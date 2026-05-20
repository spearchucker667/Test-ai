#!/usr/bin/env node
// Writes dist-electron/package.json with {"type":"commonjs"} so that Node/Electron
// treats the compiled .js output as CommonJS, even when the root package.json
// has "type": "module".  Called as part of the build:electron script.
const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "dist-electron");
const pkgPath = path.join(outDir, "package.json");

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(pkgPath, JSON.stringify({ type: "commonjs" }, null, 2) + "\n");
console.log(`Written ${pkgPath}`);
