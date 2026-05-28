/** @fileoverview Bootstraps the Venice Forge Electron main process, creates the
 *  BrowserWindow with security hardening, and manages navigation guards. */

// Code Owner: fayeblade (@spearchucker667)
// Primary maintainer and security gatekeeper for the Electron main process.
import { app, BrowserWindow, dialog, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { registerIpcHandlers } from "./ipc/handlers";
import { logError, logInfo } from "./services/logger";

/** Indicates whether the app is running in development mode. */
const isDev = !app.isPackaged;

/** Whether to allow DevTools in packaged production builds. */
const allowProdDevTools = process.env.VENICE_FORGE_DEBUG_DEVTOOLS === "true";

/** Builds the Content-Security-Policy header string for the renderer. */
function rendererCsp(): string {
  const connectSrc = isDev ? "'self' http://localhost:5173 ws://localhost:5173" : "'self'";
  const styleSrc = isDev ? "'self' 'unsafe-inline' http://localhost:5173" : "'self' 'unsafe-inline'";
  const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173" : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data: blob:",
    `connect-src ${connectSrc}`,
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Determines whether a URL is a trusted external https: link.
 *  DSC-001: Any https: URL is allowed to open externally via the OS browser.
 *  The security boundary is that external links never load inside the Electron
 *  BrowserWindow — they are always delegated to shell.openExternal.
 *  @param url The URL to evaluate.
 *  @returns True when the URL uses the https: protocol.
 */
export function isTrustedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Maximum length for displaying a URL in the external link confirmation dialog. */
const MAX_DISPLAY_URL_LENGTH = 60;

/** Prompts the user with a native dialog before opening an external URL.
 *  SEC-001: Prevents AI-generated or attacker-controlled links from silently
 *  navigating the user to phishing sites or local-network admin pages.
 *  @param win The parent BrowserWindow.
 *  @param url The external URL to potentially open.
 */
function promptExternalLink(win: BrowserWindow, url: string): void {
  let displayUrl: string;
  try {
    const parsed = new URL(url);
    const protocolAndHost = `${parsed.protocol}//${parsed.host}`;
    const fullPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const availableLength = Math.max(0, MAX_DISPLAY_URL_LENGTH - protocolAndHost.length);
    const truncatedPath =
      fullPath.length > availableLength
        ? `${fullPath.slice(0, Math.max(0, availableLength - 1))}…`
        : fullPath;
    displayUrl = `${protocolAndHost}${truncatedPath}`;
  } catch {
    displayUrl = url.slice(0, 120);
  }

  dialog
    .showMessageBox(win, {
      type: "question",
      buttons: ["Open in browser", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: "Open External Link",
      message: "Open this link in your system browser?",
      detail: displayUrl,
    })
    .then(({ response }) => {
      if (response === 0) {
        shell.openExternal(url).catch((err) => {
          logError("shell.openExternal failed", String(err));
        });
      }
    })
    .catch((err) => {
      logError("promptExternalLink dialog error", String(err));
    });
}

/** Validates that a navigation URL stays within the allowed app boundaries. */
function isAllowedAppNavigation(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (isDev) return parsed.origin === "http://localhost:5173";
    if (parsed.protocol !== "file:") return false;
    const rendererRoot = path.resolve(__dirname, "../../dist");
    // Normalize to resolve ".." and symlinks, then verify strict containment.
    const targetPath = path.normalize(fileURLToPath(parsed));
    const normalizedRoot = path.normalize(rendererRoot);
    const indexHtml = path.join(normalizedRoot, "index.html");
    return targetPath === indexHtml || targetPath.startsWith(`${normalizedRoot}${path.sep}`);
  } catch {
    return false;
  }
}

/** Creates the main BrowserWindow with preload, CSP, and navigation guards. */
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
      webSecurity: true,
      devTools: isDev || allowProdDevTools,
    },
  });

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [rendererCsp()],
      },
    });
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (isAllowedAppNavigation(url)) return;
    event.preventDefault();
    if (isTrustedExternalUrl(url)) promptExternalLink(win, url);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedExternalUrl(url)) promptExternalLink(win, url);
    return { action: "deny" };
  });

  if (!isDev && !allowProdDevTools) {
    win.webContents.on("devtools-opened", () => {
      win.webContents.closeDevTools();
    });
  }

  if (isDev) {
    win.loadURL("http://localhost:5173").catch((err) => logError("Failed to load Vite dev server", err));
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../../dist/index.html")).catch((err) => {
      logError("Failed to load production renderer", err);
    });
  }

  win.once("ready-to-show", () => win.show());
  return win;
}

/** Registers IPC handlers and creates the main application window. */
async function bootstrap(): Promise<void> {
  registerIpcHandlers();
  logInfo("Venice Forge startup", {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    mode: isDev ? "development" : "production",
    transport: "direct-ipc",
  });
  createWindow();
}

/** Prevents multiple application instances from running simultaneously. */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length > 0) {
      const win = allWindows[0];
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(bootstrap).catch((err) => {
    logError("Bootstrap failed", err);
    app.quit();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, url) => {
      if (isAllowedAppNavigation(url)) return;
      event.preventDefault();
      if (isTrustedExternalUrl(url)) {
        const win = BrowserWindow.fromWebContents(contents);
        if (win) promptExternalLink(win, url);
        else shell.openExternal(url).catch((err) => logError("shell.openExternal fallback failed", String(err)));
      }
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (isTrustedExternalUrl(url)) {
        const win = BrowserWindow.fromWebContents(contents);
        if (win) promptExternalLink(win, url);
        else shell.openExternal(url).catch((err) => logError("shell.openExternal fallback failed", String(err)));
      }
      return { action: "deny" };
    });
  });
}
