#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const args = process.argv.slice(2);
const checkWin = args.includes("--win") || args.includes("--all") || (!args.includes("--mac") && process.platform === "win32") || args.length === 0 && process.platform !== "darwin";
const checkMac = args.includes("--mac") || args.includes("--all") || (!args.includes("--win") && process.platform === "darwin") || args.length === 0 && process.platform === "darwin";

let targetArches = ["x64", "arm64"];
const archIdx = args.indexOf("--arch");
const noExplicitPlatform = !args.includes("--win") && !args.includes("--mac") && !args.includes("--all");
if (archIdx !== -1 && archIdx + 1 < args.length) {
  targetArches = [args[archIdx + 1]];
} else if (args.includes("--all")) {
  targetArches = ["x64", "arm64"];
} else if (noExplicitPlatform && process.platform === "win32") {
  targetArches = ["x64"];
}

const root = path.join(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const version = pkg.version;

function fail(msg) {
  console.error(`[verify:dist] FAIL: ${msg}`);
  process.exit(1);
}

function verifyFileExists(filePath, minSize = 0) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${path.relative(root, filePath)}`);
  }
  const stat = fs.statSync(filePath);
  if (stat.size < minSize) {
    fail(`File too small: ${path.relative(root, filePath)} (Size: ${stat.size} bytes, Expected at least: ${minSize} bytes)`);
  }
  return true;
}

function verifyChecksum(filePath) {
  const sidecar = `${filePath}.sha256`;
  if (!fs.existsSync(sidecar)) {
    fail(`Missing checksum sidecar for ${path.basename(filePath)}`);
  }
  const expectedHash = fs.readFileSync(sidecar, "ascii").split(" ")[0].trim();
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash("sha256");
  hashSum.update(fileBuffer);
  const actualHash = hashSum.digest("hex");
  if (expectedHash !== actualHash) {
    fail(`Checksum mismatch for ${path.basename(filePath)}. Expected: ${expectedHash}, Actual: ${actualHash}`);
  }
}

console.log(`[verify:dist] Starting verification for version ${version}`);

// Base build validation
verifyFileExists(path.join(root, "dist", "index.html"), 100);
verifyFileExists(path.join(root, "dist-electron", "electron", "main.js"), 1000);
verifyFileExists(path.join(root, "dist-electron", "package.json"), 20);

const releaseDir = path.join(root, "release");
if (!fs.existsSync(releaseDir)) fail("Missing release directory.");

const verified = [];

if (checkWin) {
  console.log("[verify:dist] Verifying Windows artifacts...");
  verifyFileExists(path.join(root, "build", "icon.ico"), 1024);
  const isPortableOnly = args.includes("--portable") && !args.includes("--all");

  const winArches = targetArches.includes("x64") ? ["x64"] : []; // Windows is only x64 for now
  for (const arch of winArches) {
    if (!isPortableOnly) {
      const setupExe = path.join(releaseDir, `Venice-Forge-${version}-${arch}-Setup.exe`);
      verifyFileExists(setupExe, 1024 * 1024 * 10); // 10MB min
      verifyChecksum(setupExe);
      verified.push(`Venice-Forge-${version}-${arch}-Setup.exe`);
    }

    const portableExe = path.join(releaseDir, `Venice-Forge-${version}-${arch}-Portable.exe`);
    verifyFileExists(portableExe, 1024 * 1024 * 10);
    verifyChecksum(portableExe);
    verified.push(`Venice-Forge-${version}-${arch}-Portable.exe`);
  }
}

if (checkMac) {
  console.log("[verify:dist] Verifying macOS artifacts...");
  verifyFileExists(path.join(root, "build", "icon.icns"), 1024);

  for (const arch of targetArches) {
    const dmg = path.join(releaseDir, `Venice-Forge-${version}-${arch}.dmg`);
    verifyFileExists(dmg, 1024 * 1024 * 10); // 10MB min
    verifyChecksum(dmg);
    verified.push(`Venice-Forge-${version}-${arch}.dmg`);

    const zip = path.join(releaseDir, `Venice-Forge-${version}-${arch}.zip`);
    verifyFileExists(zip, 1024 * 1024 * 10);
    verifyChecksum(zip);
    verified.push(`Venice-Forge-${version}-${arch}.zip`);
  }
}

console.log("[verify:dist] Successfully verified artifacts:");
verified.forEach((v) => console.log(`  - ${v}`));
