import { describe, expect, it } from "vitest";

import {
  buildContextualQuestion,
  hasConversationScope,
  isFollowUpQuestion,
} from "../src/lib/legal/conversation";
import { isPoliceCitizenScope } from "../src/lib/legal/retrieval";
import { type LocalChatMessage } from "../src/lib/legal/types";

const HISTORY: LocalChatMessage[] = [
  {
    id: "msg_1",
    role: "user",
    content: "Peut-on fouiller mon vehicule ?",
    createdAt: new Date().toISOString(),
    metadata: {},
  },
  {
    id: "msg_2",
    role: "assistant",
    content: "Oui, mais sous certaines conditions.",
    createdAt: new Date().toISOString(),
    metadata: {},
  },
];

describe("conversation context", () => {
  it("detects short clarification questions as follow-ups", () => {
    expect(isFollowUpQuestion("Explique moi bien")).toBe(true);
    expect(isFollowUpQuestion("Je veux connaitre mes droits pendant une garde a vue")).toBe(
      false,
    );
  });

  it("builds a contextual question for short follow-up requests", () => {
    const contextualQuestion = buildContextualQuestion("Explique moi bien", HISTORY);

    expect(contextualQuestion).toContain("Question initiale: Peut-on fouiller mon vehicule ?");
    expect(contextualQuestion).toContain("Question de suivi: Explique moi bien");
  });

  it("inherits legal scope from recent conversation", () => {
    expect(hasConversationScope("Explique moi bien", HISTORY, isPoliceCitizenScope)).toBe(true);
  });
});