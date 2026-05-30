/** @fileoverview Type definitions for multi-conversation chat history. */

/** A single message within a conversation. */
export interface ConversationMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: number;
}

/** A persisted conversation / chat session. */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  systemPrompt: string;
  messages: ConversationMessage[];
}

/** Shape of a conversation as stored on disk by the main process. */
export interface ConversationFile {
  version: 1;
  conversation: Conversation;
}

/** Result returned from the chat storage list operation. */
export interface ConversationListResult {
  conversations: Conversation[];
}

/** Payload for saving a conversation through IPC. */
export interface SaveConversationPayload {
  conversation: Conversation;
}
