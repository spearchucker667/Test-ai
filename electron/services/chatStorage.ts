/** @fileoverview Durable filesystem-backed chat history storage for the Electron
 *  main process.  Stores one JSON file per conversation under the app's userData
 *  directory.  Writes are atomic (temp + rename) and corruption is handled by
 *  backing up the bad file and starting fresh. */

import { app } from "electron";
import fs from "fs/promises";
import path from "path";
import type { Conversation, ConversationFile } from "../../src/types/conversation";
import { logError, logInfo } from "./logger";

/** Sub-directory inside userData where conversation files live. */
const CHAT_DIR = "chat-history";

/** Current on-disk schema version. */
const FILE_VERSION = 1;

/** Valid conversation ID pattern: UUID v4 or URL-safe base64-ish strings. */
const VALID_ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/;

/** Returns the absolute path to the chat-history directory. */
export function getChatHistoryDir(): string {
  return path.join(app.getPath("userData"), CHAT_DIR);
}

/** Ensures the chat-history directory exists. */
async function ensureDir(): Promise<void> {
  await fs.mkdir(getChatHistoryDir(), { recursive: true });
}

/** Builds the filesystem path for a conversation file.
 *  @param id The conversation identifier.
 *  @returns Absolute path to the JSON file.
 */
function conversationPath(id: string): string {
  return path.join(getChatHistoryDir(), `${id}.json`);
}

/** Validates that an id is safe to use as a filename (no path traversal). */
function isValidId(id: unknown): id is string {
  return typeof id === "string" && VALID_ID_RE.test(id);
}

/** Reads and validates a conversation file from disk.
 *  If the file is corrupt, it is renamed to `.backup` and `null` is returned.
 */
async function readConversationFile(filePath: string): Promise<Conversation | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidConversationFile(parsed)) {
      throw new Error("Schema validation failed");
    }
    return parsed.conversation;
  } catch (err) {
    logError("Chat history file corrupt or unreadable", { path: filePath, error: String(err) });
    try {
      const backupPath = `${filePath}.backup`;
      await fs.rename(filePath, backupPath);
      logInfo("Corrupt chat file backed up", backupPath);
    } catch {
      // Best-effort backup; ignore failure.
    }
    return null;
  }
}

/** Type-guard for the on-disk conversation file schema. */
function isValidConversationFile(value: unknown): value is ConversationFile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.version !== FILE_VERSION) return false;
  return isValidConversation(v.conversation);
}

/** Type-guard for a Conversation object. */
function isValidConversation(value: unknown): value is Conversation {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (!isValidId(c.id)) return false;
  if (typeof c.title !== "string") return false;
  if (typeof c.createdAt !== "number") return false;
  if (typeof c.updatedAt !== "number") return false;
  if (typeof c.model !== "string") return false;
  if (typeof c.systemPrompt !== "string") return false;
  if (!Array.isArray(c.messages)) return false;
  return c.messages.every(isValidMessage);
}

/** Type-guard for a ConversationMessage object. */
function isValidMessage(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  if (!isValidId(m.id)) return false;
  if (typeof m.role !== "string" || !["system", "user", "assistant"].includes(m.role)) return false;
  if (typeof m.content !== "string") return false;
  if (typeof m.timestamp !== "number") return false;
  return true;
}

/** Lists all persisted conversations, sorted by updatedAt descending. */
export async function listConversations(): Promise<Conversation[]> {
  await ensureDir();
  const dir = getChatHistoryDir();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const conversations: Conversation[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const filePath = path.join(dir, entry);
    const conv = await readConversationFile(filePath);
    if (conv) conversations.push(conv);
  }

  conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  return conversations;
}

/** Retrieves a single conversation by id. */
export async function getConversation(id: string): Promise<Conversation | null> {
  if (!isValidId(id)) return null;
  await ensureDir();
  const filePath = conversationPath(id);
  try {
    await fs.access(filePath);
  } catch {
    return null;
  }
  return readConversationFile(filePath);
}

/** Atomically writes a conversation to disk.
 *  @returns An ok flag and optional error message.
 */
export async function saveConversation(conversation: Conversation): Promise<{ ok: boolean; error?: string }> {
  if (!isValidConversation(conversation)) {
    return { ok: false, error: "Invalid conversation schema" };
  }
  await ensureDir();
  const filePath = conversationPath(conversation.id);
  const tempPath = `${filePath}.tmp`;
  const payload: ConversationFile = { version: FILE_VERSION, conversation };
  try {
    await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), "utf-8");
    await fs.rename(tempPath, filePath);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError("Failed to write conversation file", { path: filePath, error: message });
    return { ok: false, error: message };
  }
}

/** Deletes a conversation file by id.
 *  @returns An ok flag.
 */
export async function deleteConversation(id: string): Promise<{ ok: boolean }> {
  if (!isValidId(id)) return { ok: false };
  await ensureDir();
  const filePath = conversationPath(id);
  try {
    await fs.unlink(filePath);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
