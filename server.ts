import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createProxyMiddleware } from "http-proxy-middleware";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  app.disable("x-powered-by");
  const PORT = Number(process.env.PORT || 3000);

  // Simple Rate Limiting
  const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
  const rateLimitMax = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 60);
  const reqCounts = new Map<string, { count: number; resetTime: number }>();

  app.use("/api/venice", (req, res, next) => {
    if (!process.env.VENICE_API_KEY) {
      return res.status(500).json({ error: "VENICE_API_KEY is not configured on the server." });
    }

    const ip = req.ip || req.connection.remoteAddress || "unknown";
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

  const ALLOWED_ENDPOINTS = [
    "/models",
    "/chat/completions",
    "/image/generate",
    "/image/upscale"
  ];

  app.use("/api/venice", (req, res, next) => {
    if (req.method !== "POST" && req.method !== "GET") {
       return res.status(405).json({ error: "Method not allowed" });
    }
    
    // Check if path matches any allowed endpoint
    const isAllowed = ALLOWED_ENDPOINTS.some(endpoint => req.path.startsWith(endpoint) || req.path === endpoint);
    if (!isAllowed && req.path !== "/") {
       return res.status(403).json({ error: `Endpoint ${req.path} not allowed` });
    }
    next();
  });

  const MAX_PROXY_BODY_BYTES = Number(process.env.MAX_PROXY_BODY_BYTES || 26214400);

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
          if (req.body && Buffer.isBuffer(req.body)) {
            proxyReq.setHeader("Content-Length", req.body.length);
            proxyReq.write(req.body);
          }
        },
        error: (err: any, req: any, res: any) => {
          console.error("Proxy error:", err.message);
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Bad Gateway: Failed to reach Venice API." }));
        }
      },
    })
  );

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: any, res: any) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
