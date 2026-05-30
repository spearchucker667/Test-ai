/** @fileoverview Unified chat history storage abstraction.
 *  In Electron, delegates to the main-process filesystem store via IPC.
 *  In the browser, falls back to IndexedDB via StorageService.
 *  All reads/writes return Conversation objects. */

import type { Conversation, ConversationMessage } from "../types/conversation";
import { desktopChat } from "./desktopBridge";
import StorageService from "./storageService";

const FALLBACK_STORE = "conversations" as const;

/** Detects whether we are running inside the Electron desktop shell. */
function isElectron(): boolean {
  return typeof window !== "undefined" && window.veniceForge?.isDesktop === true;
}

/** Generates a URL-safe random id. */
function makeId(): string {
  return crypto.randomUUID();
}

/** Creates a new empty conversation with sensible defaults. */
export function createConversation(model: string, systemPrompt: string): Conversation {
  const now = Date.now();
  return {
    id: makeId(),
    title: "New Chat",
    createdAt: now,
    updatedAt: now,
    model,
    systemPrompt,
    messages: [],
  };
}

/** Lists all conversations, newest first. */
export async function listConversations(): Promise<Conversation[]> {
  if (isElectron()) {
    const result = await desktopChat.list();
    return result.ok ? result.conversations : [];
  }
  // Web fallback: use IndexedDB
  return StorageService.getItems<Conversation>(FALLBACK_STORE);
}

/** Retrieves a single conversation by id. */
export async function getConversation(id: string): Promise<Conversation | null> {
  if (isElectron()) {
    const result = await desktopChat.get(id);
    return result.ok ? result.conversation : null;
  }
  const items = await StorageService.getItems<Conversation & { id: string }>(FALLBACK_STORE);
  return items.find((c) => c.id === id) ?? null;
}

/** Persists a conversation. */
export async function saveConversation(conversation: Conversation): Promise<boolean> {
  const payload = { ...conversation, updatedAt: Date.now() };
  if (isElectron()) {
    const result = await desktopChat.save(payload);
    return result.ok;
  }
  await StorageService.saveItem(FALLBACK_STORE, payload);
  return true;
}

/** Deletes a conversation by id. */
export async function deleteConversation(id: string): Promise<boolean> {
  if (isElectron()) {
    const result = await desktopChat.delete(id);
    return result.ok;
  }
  return StorageService.deleteItem(FALLBACK_STORE, id);
}

/** Appends a message to a conversation and persists it.
 *  @returns The updated conversation.
 */
export async function appendMessage(
  conversation: Conversation,
  message: ConversationMessage
): Promise<Conversation> {
  const updated: Conversation = {
    ...conversation,
    messages: [...conversation.messages, message],
    updatedAt: Date.now(),
  };
  await saveConversation(updated);
  return updated;
}

/** Creates a user-visible title from the first user message, capped at 40 chars. */
export function deriveTitle(messages: Array<{ role: string; content: string }>): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New Chat";
  const text = firstUser.content.trim().replace(/\s+/g, " ");
  if (text.length <= 40) return text;
  return text.slice(0, 37) + "…";
}
