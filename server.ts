import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createProxyMiddleware } from "http-proxy-middleware";
import dotenv from "dotenv";
import { ALLOWED_VENICE_ENDPOINTS, ALLOWED_VENICE_METHODS } from "./src/shared/validation";

dotenv.config();

export function createServerApp() {
  const app = express();
  app.disable("x-powered-by");

  // Trust the first proxy hop so req.ip reflects the real client IP.
  // Adjust the value if there are multiple proxy layers in front of this server.
  app.set("trust proxy", 1);

  // Security headers for all responses
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "connect-src 'self'",
        "font-src 'self' data:",
        "media-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ].join("; ")
    );
    next();
  });

  // Simple Rate Limiting
  const parsedRateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS);
  const rateLimitWindowMs = Number.isFinite(parsedRateLimitWindowMs) && parsedRateLimitWindowMs > 0
    ? parsedRateLimitWindowMs
    : 60000;
  const rateLimitMax = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 60);
  const reqCounts = new Map<string, { count: number; resetTime: number }>();

  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of reqCounts.entries()) {
      if (now > record.resetTime) {
        reqCounts.delete(ip);
      }
    }
  }, Math.max(10000, rateLimitWindowMs)).unref();

  app.use("/api/venice", (req, res, next) => {
    if (!process.env.VENICE_API_KEY && process.env.NODE_ENV !== "test") {
      return res.status(500).json({ error: "VENICE_API_KEY is not configured on the server." });
    }

    const ip = req.ip || "unknown";
    const now = Date.now();
    const record = reqCounts.get(ip) || { count: 0, resetTime: now + rateLimitWindowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + rateLimitWindowMs;
    } else {
      record.count++;
      if (record.count > rateLimitMax) {
        return res.status(429).json({ error: "Too many requests, please try again later." });
      }
    }
    reqCounts.set(ip, record);
    next();
  });

  const MAX_PROXY_BODY_BYTES = Number(process.env.MAX_PROXY_BODY_BYTES || 26214400);

  // Circuit Breaker State
  let circuitFailures = 0;
  let circuitOpenUntil = 0;
  const CIRCUIT_MAX_FAILURES = 5;
  const CIRCUIT_RESET_TIMEOUT_MS = 30000;

  app.use("/api/venice", (req, res, next) => {
    if (Date.now() < circuitOpenUntil) {
      return res.status(503).json({ error: "Service Unavailable: Circuit breaker open due to upstream failures." });
    }
    next();
  });

  app.use("/api/venice", (req, res, next) => {
    if (!ALLOWED_VENICE_METHODS.includes(req.method as any)) {
       return res.status(405).json({ error: "Method not allowed" });
    }
    
    // Check if path matches any allowed endpoint
    const isAllowed = ALLOWED_VENICE_ENDPOINTS.includes(req.path as any);
    if (!isAllowed && req.path !== "/") {
       return res.status(403).json({ error: `Endpoint ${req.path} not allowed` });
    }
    next();
  });

  // Venice API Proxy
  // Do NOT use body-parser for /api/venice. We want raw passthrough.
  app.use(
    "/api/venice",
    express.raw({ 
      type: "*/*", 
      limit: MAX_PROXY_BODY_BYTES
    }),
    createProxyMiddleware({
      target: "https://api.venice.ai/api/v1",
      changeOrigin: true,
      pathRewrite: {
        "^/api/venice": "", // remove base path
      },
      on: {
        proxyReq: (proxyReq: any, req: any, res: any) => {
          proxyReq.setHeader(
            "Authorization",
            `Bearer ${process.env.VENICE_API_KEY}`
          );
          if (req.method !== "GET" && req.body && Buffer.isBuffer(req.body)) {
            proxyReq.removeHeader("Transfer-Encoding");
            proxyReq.setHeader("Content-Length", req.body.length);
            proxyReq.write(req.body);
          } else if (req.method === "GET") {
            proxyReq.removeHeader("Content-Length");
            proxyReq.removeHeader("Transfer-Encoding");
          }
        },
        proxyRes: (proxyRes: any, req: any, res: any) => {
          if (proxyRes.statusCode >= 500) {
            circuitFailures++;
            if (circuitFailures >= CIRCUIT_MAX_FAILURES) {
              console.error(`[Circuit Breaker] Tripped! Opening for ${CIRCUIT_RESET_TIMEOUT_MS}ms`);
              circuitOpenUntil = Date.now() + CIRCUIT_RESET_TIMEOUT_MS;
            }
          } else if (proxyRes.statusCode < 500) {
             circuitFailures = 0; // Reset on success or client errors
          }
        },
        error: (err: any, req: any, res: any) => {
          console.error("Proxy error:", err.message);
          circuitFailures++;
          if (circuitFailures >= CIRCUIT_MAX_FAILURES) {
             console.error(`[Circuit Breaker] Tripped (Network Error)! Opening for ${CIRCUIT_RESET_TIMEOUT_MS}ms`);
             circuitOpenUntil = Date.now() + CIRCUIT_RESET_TIMEOUT_MS;
          }
          if (!res.headersSent) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Bad Gateway: Failed to reach Venice API." }));
          }
        }
      },
    })
  );

  return app;
}

export async function startServer() {
  const app = createServerApp();
  const PORT = Number(process.env.PORT || 3000);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV !== "test") {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: any, res: any) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (process.env.NODE_ENV !== "test") {
    app.listen(Number(PORT), "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

if (process.env.NODE_ENV !== "test") {
  startServer();
}
