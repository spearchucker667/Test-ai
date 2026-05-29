// Code Owner: fayeblade (@spearchucker667)
// Express web proxy and Vite dev-server bootstrap.
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createProxyMiddleware } from "http-proxy-middleware";
import dotenv from "dotenv";
import {
  ALLOWED_VENICE_ENDPOINTS,
  ALLOWED_VENICE_METHODS,
  isAllowedVeniceRequest,
} from "./src/shared/validation";
import { VENICE_API_HOST, VENICE_API_BASE_PATH } from "./src/shared/apiConfig";
import { AppConfig } from "./src/shared/configSchema";

dotenv.config();

type VeniceProxyRequest = {
  method?: string;
  body?: unknown;
};

type VeniceProxyOutboundRequest = {
  removeHeader(name: string): void;
  setHeader(name: string, value: string | number): void;
  write(chunk: Buffer): void;
};

const FORBIDDEN_RENDERER_PROXY_HEADERS = ["Authorization", "Cookie", "Host"] as const;

export function applyVeniceProxyHeaders(
  proxyReq: VeniceProxyOutboundRequest,
  req: VeniceProxyRequest
) {
  for (const header of FORBIDDEN_RENDERER_PROXY_HEADERS) {
    proxyReq.removeHeader(header);
  }

  proxyReq.setHeader("Authorization", `Bearer ${AppConfig.VENICE_API_KEY}`);
  proxyReq.setHeader("Host", VENICE_API_HOST);

  if (req.method !== "GET" && req.body && Buffer.isBuffer(req.body)) {
    proxyReq.removeHeader("Transfer-Encoding");
    proxyReq.setHeader("Content-Length", req.body.length);
    proxyReq.write(req.body);
  } else if (req.method === "GET") {
    proxyReq.removeHeader("Content-Length");
    proxyReq.removeHeader("Transfer-Encoding");
  }
}

export function createServerApp() {
  const app = express();
  app.disable("x-powered-by");

  // Structured request logging (no bodies, no secrets) in development/test only.
  if (AppConfig.NODE_ENV !== "production") {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on("finish", () => {
        const duration = Date.now() - start;
        console.warn(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      });
      next();
    });
  }

  // Health check endpoint (does not proxy to Venice)
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", version: process.env.npm_package_version || "unknown" });
  });

  // Trust proxy only when explicitly configured via TRUST_PROXY env var,
  // to prevent IP spoofing when the server is accessed directly without a trusted reverse proxy.
  if (AppConfig.TRUST_PROXY) {
    app.set("trust proxy", AppConfig.TRUST_PROXY);
  }

  // Security headers for all responses
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    // In non-production environments Vite HMR uses WebSocket connections, so we
    // widen connect-src to include ws: / wss:. In production only 'self' is allowed.
    const isProduction = AppConfig.NODE_ENV === "production";
    const connectSrc = isProduction ? "connect-src 'self'" : "connect-src 'self' ws: wss:";
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        connectSrc,
        "font-src 'self' data:",
        "media-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join("; ")
    );
    next();
  });

  // Simple Rate Limiting
  const rateLimitWindowMs = AppConfig.RATE_LIMIT_WINDOW_MS;
  const rateLimitMax = AppConfig.RATE_LIMIT_MAX_REQUESTS;
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
    if (!AppConfig.VENICE_API_KEY && AppConfig.NODE_ENV !== "test") {
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

  const MAX_PROXY_BODY_BYTES = AppConfig.MAX_PROXY_BODY_BYTES;

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
    const method = req.method.toUpperCase();

    if (!ALLOWED_VENICE_METHODS.includes(method as any)) {
       return res.status(405).json({ error: "Method not allowed" });
    }
    
    // Check if path matches any allowed endpoint
    const isAllowed = ALLOWED_VENICE_ENDPOINTS.includes(req.path as any);
    if (!isAllowed) {
       return res.status(403).json({ error: `Endpoint ${req.path} not allowed` });
    }
    if (!isAllowedVeniceRequest(req.path, method)) {
       return res.status(405).json({ error: `Method ${method} not allowed for endpoint ${req.path}` });
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
      target: `https://${VENICE_API_HOST}${VENICE_API_BASE_PATH}`,
      changeOrigin: true,
      pathRewrite: {
        "^/api/venice": "", // remove base path
      },
      on: {
        proxyReq: (proxyReq: any, req: any, res: any) => {
          applyVeniceProxyHeaders(proxyReq, req);
        },
        proxyRes: (proxyRes: any, req: any, res: any) => {
          // Forward rate-limit headers so the client can respect them.
          const retryAfter = proxyRes.headers["retry-after"];
          if (retryAfter) res.setHeader("Retry-After", retryAfter);
          const rlReset = proxyRes.headers["x-ratelimit-reset-requests"];
          if (rlReset) res.setHeader("X-RateLimit-Reset-Requests", rlReset);

          if (proxyRes.statusCode >= 500) {
            circuitFailures++;
            if (circuitFailures >= CIRCUIT_MAX_FAILURES) {
              console.error(`[Circuit Breaker] Tripped! Opening for ${CIRCUIT_RESET_TIMEOUT_MS}ms`);
              circuitOpenUntil = Date.now() + CIRCUIT_RESET_TIMEOUT_MS;
            }
          } else if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
             circuitFailures = 0; // Reset only on successful responses
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
  const PORT = AppConfig.PORT;

  // Vite middleware for development
  if (AppConfig.NODE_ENV !== "production" && AppConfig.NODE_ENV !== "test") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (AppConfig.NODE_ENV !== "test") {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: any, res: any) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (AppConfig.NODE_ENV !== "test") {
    const host = process.env.HOST || "127.0.0.1";
    app.listen(Number(PORT), host, () => {
      console.warn(`Server running on http://${host}:${PORT}`);
    });
  }
}

if (AppConfig.NODE_ENV !== "test") {
  startServer();
}
