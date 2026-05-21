import { type LocalChatMessage } from "./types";
import { normalizeForSearch } from "./utils";

const FOLLOW_UP_MARKERS = [
  "explique",
  "explique moi",
  "explique moi bien",
  "je comprends pas",
  "je ne comprends pas",
  "plus simple",
  "plus clairement",
  "ca veut dire quoi",
  "c est a dire",
  "concretement",
  "dans quel cas",
  "et si",
  "donc",
  "pourquoi",
  "comment",
  "resume",
  "reformule",
];

export function getRecentConversation(messages: LocalChatMessage[], maxMessages = 6) {
  return messages.slice(-maxMessages);
}

export function isFollowUpQuestion(question: string) {
  const normalized = normalizeForSearch(question);
  if (!normalized) {
    return false;
  }

  if (FOLLOW_UP_MARKERS.some((marker) => normalized.includes(marker))) {
    return true;
  }

  const tokenCount = normalized.split(" ").filter(Boolean).length;
  return tokenCount <= 6;
}

export function buildContextualQuestion(question: string, messages: LocalChatMessage[]) {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) {
    return "";
  }

  if (!isFollowUpQuestion(trimmedQuestion)) {
    return trimmedQuestion;
  }

  const lastUserQuestion = [...messages].reverse().find((message) => message.role === "user");
  const lastAssistantAnswer = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");

  const contextualParts = [
    lastUserQuestion ? `Question initiale: ${lastUserQuestion.content}` : "",
    `Question de suivi: ${trimmedQuestion}`,
    lastAssistantAnswer ? `Derniere reponse utile: ${lastAssistantAnswer.content}` : "",
  ].filter(Boolean);

  return contextualParts.join("\n");
}

export function hasConversationScope(
  question: string,
  messages: LocalChatMessage[],
  isInScope: (value: string) => boolean,
) {
  if (isInScope(question)) {
    return true;
  }

  return [...messages].reverse().some((message) => isInScope(message.content));
}