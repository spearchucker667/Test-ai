/**
 * Electron main process entry point.
 *
 * Security settings:
 *   - contextIsolation: true
 *   - nodeIntegration: false
 *   - sandbox: true
 *   - No remote module
 *   - Navigation restricted to localhost dev server or local file
 */
import { app, BrowserWindow, shell } from "electron";
import path from "path";
import { registerIpcHandlers } from "./ipc/handlers";
import { startVeniceProxy, stopVeniceProxy } from "./services/veniceProxy";

const isDev = !app.isPackaged;

// CSP for Electron renderer window
const CSP =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "connect-src 'self' http://127.0.0.1:* ws://localhost:* http://localhost:*; " +
  "font-src 'self' data:; " +
  "media-src 'self' blob:;";

function createWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, "preload.js");

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: "Venice Forge",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Disable remote content for non-dev builds
      webSecurity: true,
    },
  });

  // Set CSP response headers for the renderer
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [CSP],
      },
    });
  });

  // Prevent renderer from navigating away from the app origin
  win.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev
      ? url.startsWith("http://localhost:")
      : url.startsWith("file://");
    if (!allowed) {
      event.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });

  // Open external links in the OS browser, not a new Electron window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    // Production: load built renderer from dist/
    win.loadFile(path.join(__dirname, "../dist/index.html")).catch((err) => {
      console.error(
        "[Main] Failed to load renderer. Ensure 'npm run build:web' has completed and 'dist/index.html' exists.",
        err
      );
    });
  }

  win.once("ready-to-show", () => win.show());

  return win;
}

async function bootstrap(): Promise<void> {
  // Start Venice proxy before window creation so the port is ready
  const proxyPort = await startVeniceProxy();

  // Register IPC handlers after proxy is started
  registerIpcHandlers();

  createWindow();
}

// Single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // Focus the existing window if a second instance is launched
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length > 0) {
      const win = allWindows[0];
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(bootstrap).catch((err) => {
    console.error("[Main] Bootstrap failed:", err);
    app.quit();
  });

  app.on("window-all-closed", () => {
    stopVeniceProxy();
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      startVeniceProxy()
        .then(() => createWindow())
        .catch((err) => console.error("[Main] Reactivate failed:", err));
    }
  });

  // Prevent loading remote web content (belt-and-suspenders)
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, url) => {
      const u = new URL(url);
      const allowed =
        u.protocol === "file:" ||
        (u.hostname === "localhost" && u.protocol === "http:");
      if (!allowed) {
        event.preventDefault();
      }
    });
  });
}
