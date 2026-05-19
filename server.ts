import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createProxyMiddleware } from "http-proxy-middleware";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Venice API Proxy
  // Do NOT use body-parser for /api/venice. We want raw passthrough.
  app.use(
    "/api/venice",
    createProxyMiddleware({
      target: "https://api.venice.ai/api/v1",
      changeOrigin: true,
      pathRewrite: {
        "^/api/venice": "", // remove base path
      },
      on: {
        proxyReq: (proxyReq, req, res) => {
          if (!process.env.VENICE_API_KEY) {
            console.warn("Missing VENICE_API_KEY environment variable");
          }
          proxyReq.setHeader(
            "Authorization",
            `Bearer ${process.env.VENICE_API_KEY || ""}`
          );
        },
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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
