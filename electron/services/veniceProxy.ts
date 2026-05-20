/**
 * Venice local proxy server for the Electron main process.
 *
 * Starts an Express server bound ONLY to 127.0.0.1 on a random available port.
 * Injects the Venice API key (from secureStore) on every proxied request.
 * Renderer calls http://127.0.0.1:{port}/api/venice/* — the API key never leaves
 * the main process.
 */
import express, { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import type { Server } from "http";
import { getApiKey } from "./secureStore";

const VENICE_BASE = "https://api.venice.ai/api/v1";

const ALLOWED_PATHS = [
  "/models",
  "/chat/completions",
  "/image/generate",
  "/image/upscale",
];

const MAX_BODY_BYTES = 26_214_400; // 25 MB
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const FALLBACK_IP_IDENTIFIER = "local";

let _server: Server | null = null;
let _port: number | null = null;

function pickRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const net = require("net") as typeof import("net");
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close(() => reject(new Error("Could not get port")));
        return;
      }
      const p = addr.port;
      srv.close(() => resolve(p));
    });
    srv.on("error", reject);
  });
}

export async function startVeniceProxy(): Promise<number> {
  if (_server && _port) return _port;

  const port = await pickRandomPort();
  const app = express();
  app.disable("x-powered-by");

  // Rate limiting state (simple in-memory)
  const reqCounts = new Map<string, { count: number; resetTime: number }>();

  app.use("/api/venice", (_req: Request, res: Response, next: NextFunction) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      return res
        .status(401)
        .json({ error: "Venice API key is not configured. Please set it in Settings." });
    }
    next();
  });

  app.use("/api/venice", (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = req.ip || FALLBACK_IP_IDENTIFIER;
    const rec = reqCounts.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
    if (now > rec.resetTime) {
      rec.count = 1;
      rec.resetTime = now + RATE_LIMIT_WINDOW_MS;
    } else {
      rec.count++;
      if (rec.count > RATE_LIMIT_MAX_REQUESTS) {
        return res.status(429).json({ error: "Rate limit exceeded." });
      }
    }
    reqCounts.set(ip, rec);
    next();
  });

  app.use("/api/venice", (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "POST" && req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed." });
    }
    // Strict path matching — req.path excludes the query string in Express,
    // so this correctly allows /models?type=all while blocking /models/anything.
    if (!ALLOWED_PATHS.includes(req.path)) {
      return res.status(403).json({ error: `Endpoint ${req.path} is not allowed.` });
    }
    next();
  });

  app.use(
    "/api/venice",
    express.raw({ type: "*/*", limit: MAX_BODY_BYTES }),
    createProxyMiddleware({
      target: VENICE_BASE,
      changeOrigin: true,
      pathRewrite: { "^/api/venice": "" },
      on: {
        proxyReq: (proxyReq: any, req: any) => {
          const apiKey = getApiKey();
          if (apiKey) {
            proxyReq.setHeader("Authorization", `Bearer ${apiKey}`);
          }
          if (req.body && Buffer.isBuffer(req.body)) {
            proxyReq.setHeader("Content-Length", req.body.length);
            proxyReq.write(req.body);
          }
        },
        error: (_err: unknown, _req: unknown, res: any) => {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Bad Gateway: Failed to reach Venice API." }));
        },
      },
    })
  );

  await new Promise<void>((resolve, reject) => {
    _server = app.listen(port, "127.0.0.1", () => resolve());
    _server!.once("error", reject);
  });

  _port = port;
  console.log(`[VeniceProxy] Listening on http://127.0.0.1:${port}/api/venice`);
  return port;
}

export function stopVeniceProxy(): void {
  _server?.close();
  _server = null;
  _port = null;
}

export function getProxyPort(): number | null {
  return _port;
}
