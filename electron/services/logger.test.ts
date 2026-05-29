/** @fileoverview Unit tests for Electron main-process logger rotation. */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
  shell: {
    openPath: vi.fn(),
  },
}));

import { ensureLogFile, getLogPath } from "./logger";

const TEST_LOG = getLogPath();

function cleanLogs() {
  for (const p of [TEST_LOG, `${TEST_LOG}.1`, `${TEST_LOG}.2`, `${TEST_LOG}.3`]) {
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
}

describe("logger rotation", () => {
  beforeEach(() => {
    cleanLogs();
    fs.mkdirSync(path.dirname(TEST_LOG), { recursive: true });
  });
  afterEach(() => cleanLogs());

  it("creates a .1 backup when log exceeds max size", () => {
    // Pre-seed log file to just over the 1 MiB limit
    const oversized = "x".repeat(1024 * 1024 + 1);
    fs.writeFileSync(TEST_LOG, oversized, "utf-8");
    ensureLogFile();
    expect(fs.existsSync(`${TEST_LOG}.1`)).toBe(true);
    expect(fs.existsSync(TEST_LOG)).toBe(false);
  });

  it("shifts backups through a 3-file ring", () => {
    // Seed .1 and current log so both are oversized
    fs.writeFileSync(`${TEST_LOG}.1`, "old1", "utf-8");
    const oversized = "x".repeat(1024 * 1024 + 1);
    fs.writeFileSync(TEST_LOG, oversized, "utf-8");
    ensureLogFile();
    expect(fs.readFileSync(`${TEST_LOG}.1`, "utf-8")).toBe(oversized);
    expect(fs.readFileSync(`${TEST_LOG}.2`, "utf-8")).toBe("old1");
  });
});
