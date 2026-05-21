import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { CHAT_SESSIONS_DIR } from "./config";
import {
  localChatSessionSchema,
  type ChatResponse,
  type LocalChatMessage,
  type LocalChatSession,
} from "./types";
import { newId, nowIso } from "./utils";

async function ensureSessionDir() {
  await mkdir(CHAT_SESSIONS_DIR, { recursive: true });
}

function sessionPath(sessionId: string) {
  return path.join(CHAT_SESSIONS_DIR, `${sessionId}.json`);
}

export async function getOrCreateSession(sessionId: string) {
  await ensureSessionDir();

  try {
    const raw = await readFile(sessionPath(sessionId), "utf8");
    return localChatSessionSchema.parse(JSON.parse(raw));
  } catch {
    const session: LocalChatSession = {
      id: sessionId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: [],
    };

    await writeFile(sessionPath(sessionId), JSON.stringify(session, null, 2), "utf8");
    return session;
  }
}

export async function appendExchange(
  sessionId: string,
  question: string,
  response: ChatResponse,
) {
  const session = await getOrCreateSession(sessionId);
  const updatedAt = nowIso();

  const messages: LocalChatMessage[] = [
    ...session.messages,
    {
      id: newId("msg"),
      role: "user",
      content: question,
      createdAt: updatedAt,
      metadata: {},
    },
    {
      id: newId("msg"),
      role: "assistant",
      content: response.answer,
      createdAt: nowIso(),
      metadata: {
        citations: response.citations,
        confidence: response.confidence,
        needs_human_review: response.needs_human_review,
      },
    },
  ];

  const nextSession: LocalChatSession = {
    ...session,
    updatedAt,
    messages,
  };

  await writeFile(sessionPath(sessionId), JSON.stringify(nextSession, null, 2), "utf8");
  return nextSession;
}
