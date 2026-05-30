/** @fileoverview Unit tests for Electron main-process chat history filesystem storage. */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
}));

import {
  getChatHistoryDir,
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation,
} from "./chatStorage";
import type { Conversation } from "../../src/types/conversation";

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "Test Chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    model: "venice-uncensored",
    systemPrompt: "You are a test assistant.",
    messages: [
      { id: "m1", role: "user", content: "hello", timestamp: Date.now() },
      { id: "m2", role: "assistant", content: "hi", timestamp: Date.now() },
    ],
    ...overrides,
  };
}

async function cleanDir() {
  const dir = getChatHistoryDir();
  try {
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      await fs.unlink(path.join(dir, entry));
    }
  } catch {
    // ignore
  }
}

describe("chatStorage", () => {
  beforeEach(async () => {
    await cleanDir();
  });
  afterEach(async () => {
    await cleanDir();
  });

  it("saves and retrieves a conversation", async () => {
    const conv = makeConv();
    const saveResult = await saveConversation(conv);
    expect(saveResult.ok).toBe(true);

    const retrieved = await getConversation(conv.id);
    expect(retrieved).toEqual(conv);
  });

  it("lists conversations sorted by updatedAt descending", async () => {
    const c1 = makeConv({ updatedAt: 1000 });
    const c2 = makeConv({ updatedAt: 2000 });
    const c3 = makeConv({ updatedAt: 1500 });
    await saveConversation(c1);
    await saveConversation(c2);
    await saveConversation(c3);

    const list = await listConversations();
    expect(list.map((c) => c.id)).toEqual([c2.id, c3.id, c1.id]);
  });

  it("deletes a conversation", async () => {
    const conv = makeConv();
    await saveConversation(conv);
    expect(await getConversation(conv.id)).not.toBeNull();

    const delResult = await deleteConversation(conv.id);
    expect(delResult.ok).toBe(true);
    expect(await getConversation(conv.id)).toBeNull();
  });

  it("returns null for a missing conversation", async () => {
    const result = await getConversation("nonexistent-id");
    expect(result).toBeNull();
  });

  it("returns empty array when no conversations exist", async () => {
    const list = await listConversations();
    expect(list).toEqual([]);
  });

  it("rejects invalid conversation schema", async () => {
    const bad = { id: "bad", title: 123 } as unknown as Conversation;
    const result = await saveConversation(bad);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid conversation schema/);
  });

  it("rejects path traversal ids", async () => {
    const result = await getConversation("../../../etc/passwd");
    expect(result).toBeNull();
  });

  it("backs up corrupt files and returns null", async () => {
    const dir = getChatHistoryDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "corrupt.json"), "not-json", "utf-8");

    const result = await getConversation("corrupt");
    expect(result).toBeNull();

    const backup = await fs.readdir(dir);
    expect(backup.some((f) => f.endsWith(".backup"))).toBe(true);
  });

  it("updates an existing conversation", async () => {
    const conv = makeConv();
    await saveConversation(conv);

    const updated: Conversation = { ...conv, title: "Updated", messages: [...conv.messages, { id: "m3", role: "user", content: "new", timestamp: Date.now() }] };
    const saveResult = await saveConversation(updated);
    expect(saveResult.ok).toBe(true);

    const retrieved = await getConversation(conv.id);
    expect(retrieved?.title).toBe("Updated");
    expect(retrieved?.messages).toHaveLength(3);
  });
});
