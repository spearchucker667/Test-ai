/** @fileoverview Unit tests for the unified renderer chat storage abstraction. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createConversation,
  saveConversation,
  listConversations,
  getConversation,
  deleteConversation,
  appendMessage,
  deriveTitle,
} from "./chatStorage";
import StorageService from "./storageService";

vi.mock("./desktopBridge", () => ({
  isElectron: vi.fn().mockReturnValue(false),
  desktopChat: {
    list: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./storageService", () => ({
  default: {
    saveItem: vi.fn().mockResolvedValue({ id: "x", timestamp: 1 }),
    getItems: vi.fn().mockResolvedValue([]),
    deleteItem: vi.fn().mockResolvedValue(true),
  },
}));

describe("chatStorage (web fallback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a conversation with sensible defaults", () => {
    const conv = createConversation("my-model", "my-prompt");
    expect(conv.id).toBeTruthy();
    expect(conv.title).toBe("New Chat");
    expect(conv.model).toBe("my-model");
    expect(conv.systemPrompt).toBe("my-prompt");
    expect(conv.messages).toEqual([]);
    expect(conv.createdAt).toBeGreaterThan(0);
    expect(conv.updatedAt).toBeGreaterThan(0);
  });

  it("lists conversations from IndexedDB", async () => {
    const convs = [createConversation("m1", "s1"), createConversation("m2", "s2")];
    vi.mocked(StorageService.getItems).mockResolvedValueOnce(convs);
    const result = await listConversations();
    expect(result).toHaveLength(2);
    expect(StorageService.getItems).toHaveBeenCalledWith("conversations");
  });

  it("gets a single conversation by id", async () => {
    const conv = createConversation("m1", "s1");
    vi.mocked(StorageService.getItems).mockResolvedValueOnce([conv]);
    const result = await getConversation(conv.id);
    expect(result?.id).toBe(conv.id);
  });

  it("returns null when conversation not found", async () => {
    vi.mocked(StorageService.getItems).mockResolvedValueOnce([]);
    const result = await getConversation("missing");
    expect(result).toBeNull();
  });

  it("saves a conversation to IndexedDB", async () => {
    const conv = createConversation("m1", "s1");
    const result = await saveConversation(conv);
    expect(result).toBe(true);
    expect(StorageService.saveItem).toHaveBeenCalledWith("conversations", expect.objectContaining({ id: conv.id }));
  });

  it("deletes a conversation by id", async () => {
    const result = await deleteConversation("some-id");
    expect(result).toBe(true);
    expect(StorageService.deleteItem).toHaveBeenCalledWith("conversations", "some-id");
  });

  it("appends a message and updates timestamp", async () => {
    const conv = createConversation("m1", "s1");
    const msg = { id: "msg-1", role: "user" as const, content: "hello", timestamp: Date.now() };
    const updated = await appendMessage(conv, msg);
    expect(updated.messages).toHaveLength(1);
    expect(updated.messages[0].content).toBe("hello");
    expect(updated.updatedAt).toBeGreaterThanOrEqual(conv.updatedAt);
  });

  it("derives title from first user message", () => {
    const msgs = [
      { role: "system" as const, content: "sys" },
      { role: "user" as const, content: "What is the meaning of life?" },
    ];
    expect(deriveTitle(msgs)).toBe("What is the meaning of life?");
  });

  it("truncates long titles", () => {
    const long = "a".repeat(50);
    const msgs = [{ role: "user" as const, content: long }];
    expect(deriveTitle(msgs)).toBe("a".repeat(37) + "…");
  });

  it("returns New Chat when no user messages exist", () => {
    expect(deriveTitle([])).toBe("New Chat");
    expect(deriveTitle([{ role: "system" as const, content: "sys" }])).toBe("New Chat");
  });
});
