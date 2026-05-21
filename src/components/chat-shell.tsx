import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { ShiningText } from "@/components/ui/shining-text";
import type { ChatCitation, ChatResponse, LocalChatMessage } from "@/lib/legal/types";
import { ChatComposer } from "./chat-composer";

const AUTO_ACCESS = "beta-civ-2026";
const SESSION_KEY = "appli-loi-session-id";
const THEME_KEY = "appli-loi-theme";

type ApiPayload = ChatResponse & {
  sessionId: string;
  history?: LocalChatMessage[];
};

const STARTER_PROMPTS = [
  "Un policier peut-il me demander ma carte d'identite ?",
  "Combien de temps peut durer une garde a vue ?",
  "Peut-on fouiller mon vehicule ?",
];

function createSessionId() {
  return `session_${crypto.randomUUID()}`;
}

function getStoredSessionId() {
  if (typeof window === "undefined") {
    return "";
  }

  const current = window.localStorage.getItem(SESSION_KEY);
  if (current) {
    return current;
  }

  const nextSession = createSessionId();
  window.localStorage.setItem(SESSION_KEY, nextSession);
  return nextSession;
}

function getStoredTheme() {
  if (typeof window === "undefined") {
    return "dark" as const;
  }

  const storedTheme = window.localStorage.getItem(THEME_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getScrollElement() {
  if (typeof document === "undefined") {
    return null;
  }

  return document.scrollingElement;
}

function isNearBottom(threshold = 96) {
  const scrollElement = getScrollElement();
  if (!scrollElement) {
    return true;
  }

  const distanceToBottom =
    scrollElement.scrollHeight - (scrollElement.scrollTop + scrollElement.clientHeight);

  return distanceToBottom <= threshold;
}

function CitationList({
  citations,
  confidence,
  needsHumanReview,
}: {
  citations: ChatCitation[];
  confidence: string | null;
  needsHumanReview: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4 border-t border-[--line] pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-[13px] text-[--muted] transition hover:text-[--ink-soft]"
      >
        <span>
          {citations.length} source{citations.length > 1 ? "s" : ""}
        </span>
        {(confidence === "low" || needsHumanReview) && (
          <span className="text-[--danger]">· consulter un avocat</span>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul className="mt-3 space-y-4">
          {citations.map((citation) => (
            <li key={citation.passage_id}>
              <p className="text-[13px] font-medium text-[--ink]">
                {citation.document_title}
                {citation.article_number ? (
                  <span className="ml-1 font-normal text-[--muted]">
                    · {citation.article_number}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-[13px] leading-5 text-[--ink-soft]">{citation.excerpt}</p>
              <a
                href={citation.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[13px] text-[--accent]"
              >
                Voir la source →
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssistantIdentity({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[--line] bg-[--surface-strong] text-[--ink] shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 4V20"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M5 7H19"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M7 7L4.5 12C5 13.3 6.1 14 7.5 14C8.9 14 10 13.3 10.5 12L8 7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M16 7L13.5 12C14 13.3 15.1 14 16.5 14C17.9 14 19 13.3 19.5 12L17 7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9 20H15"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div>
        <p className="text-[13px] font-medium text-[--ink]">Conseiller IA</p>
        <p className="text-[12px] text-[--muted]">{status}</p>
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <motion.div
      key="assistant-thinking"
      layout
      initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: 10, filter: "blur(4px)" }}
      transition={{ duration: 0.24 }}
      className="max-w-[92%]"
    >
      <AssistantIdentity status="Analyse en cours" />
      <div
        role="status"
        aria-live="polite"
        className="mt-3 rounded-[24px] border border-[--line] bg-[--surface]/85 px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.12)]"
      >
        <ShiningText text="Analyse des textes en cours..." className="text-[15px]" />
        <p className="mt-2 text-[14px] leading-6 text-[--muted]">
          Je rassemble les articles utiles et je prépare une réponse simple, claire et sourcée.
        </p>
        <div className="mt-4 space-y-2.5">
          <div className="h-2.5 w-full animate-pulse rounded-full bg-[--surface-strong]" />
          <div className="h-2.5 w-5/6 animate-pulse rounded-full bg-[--surface-strong] [animation-delay:120ms]" />
          <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-[--surface-strong] [animation-delay:240ms]" />
        </div>
      </div>
    </motion.div>
  );
}

export function ChatShell() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [answer, setAnswer] = useState<ChatResponse | null>(null);
  const [sessionId, setSessionId] = useState(() => getStoredSessionId());
  const [requestError, setRequestError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const hasLocalMutationRef = useRef(false);
  const currentSessionIdRef = useRef(sessionId);

  useEffect(() => {
    currentSessionIdRef.current = sessionId;
  }, [sessionId]);

  const loadHistory = useEffectEvent(async (nextSessionId: string) => {
    const response = await fetch(`/api/chat?sessionId=${encodeURIComponent(nextSessionId)}`, {
      headers: { "x-private-access": AUTO_ACCESS },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Impossible de charger l'historique.");
    }

    const payload = (await response.json()) as { history: LocalChatMessage[] };
    if (hasLocalMutationRef.current) {
      return;
    }

    setMessages(payload.history);
    setAnswer(null);
    setRequestError("");
  });

  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!sessionId) return;
    void loadHistory(sessionId).catch((error) => {
      setRequestError(error instanceof Error ? error.message : "Erreur de chargement.");
    });
  }, [loadHistory, sessionId]);

  useEffect(() => {
    const handleScroll = () => {
      shouldStickToBottomRef.current = isNearBottom();
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const lastAssistant = useMemo(() => {
    return [...messages].reverse().find((message) => message.role === "assistant") ?? null;
  }, [messages]);

  const visibleCitations = useMemo(() => {
    if (answer) {
      return answer.citations;
    }

    const raw = lastAssistant?.metadata.citations;
    return Array.isArray(raw) ? (raw as ChatCitation[]) : [];
  }, [answer, lastAssistant]);

  const visibleConfidence = useMemo(() => {
    if (answer) {
      return answer.confidence;
    }

    const raw = lastAssistant?.metadata.confidence;
    return raw === "low" || raw === "medium" || raw === "high" ? raw : null;
  }, [answer, lastAssistant]);

  const visibleNeedsHumanReview = useMemo(() => {
    if (answer) {
      return answer.needs_human_review;
    }

    return lastAssistant?.metadata.needs_human_review === true;
  }, [answer, lastAssistant]);

  async function handleSend() {
    if (!question.trim() || isLoading) return;

    setRequestError("");
    shouldStickToBottomRef.current = true;
    hasLocalMutationRef.current = true;

    const optimisticMessage: LocalChatMessage = {
      id: `draft_${Date.now()}`,
      role: "user",
      content: question.trim(),
      createdAt: new Date().toISOString(),
      metadata: {},
    };

    const currentQuestion = question.trim();
    const requestSessionId = sessionId;
    setQuestion("");
    setMessages((current) => [...current, optimisticMessage]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-private-access": AUTO_ACCESS,
        },
        body: JSON.stringify({
          question: currentQuestion,
          sessionId: requestSessionId,
          accessCode: AUTO_ACCESS,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "La demande a echoue.");
      }

      const payload = (await response.json()) as ApiPayload;

      if (currentSessionIdRef.current !== requestSessionId) {
        return;
      }

      setMessages(payload.history ?? []);
      setAnswer(payload);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Erreur inconnue.");
      setMessages((current) => current.filter((message) => message.id !== optimisticMessage.id));
      setQuestion(currentQuestion);
    } finally {
      hasLocalMutationRef.current = false;
      setIsLoading(false);
    }
  }

  function handleNewConversation() {
    if (typeof window === "undefined" || isLoading) {
      return;
    }

    const nextSessionId = createSessionId();
    window.localStorage.setItem(SESSION_KEY, nextSessionId);
    hasLocalMutationRef.current = false;
    shouldStickToBottomRef.current = true;
    setSessionId(nextSessionId);
    setQuestion("");
    setMessages([]);
    setAnswer(null);
    setRequestError("");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  const lastAssistantIndex = messages.reduce(
    (acc, msg, idx) => (msg.role === "assistant" ? idx : acc),
    -1,
  );

  return (
    <div className="flex min-h-[100dvh] touch-pan-y flex-col">
      <header className="sticky top-0 z-20 bg-[--bg]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-[16px] font-semibold text-[--ink]">Appli Loi CI</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleNewConversation}
              disabled={isLoading}
              className="rounded-full border border-[--line] px-3 py-1.5 text-[13px] text-[--ink-soft] transition hover:border-[rgba(255,255,255,0.14)] hover:text-[--ink] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Nouveau chat
            </button>
            <button
              type="button"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              className="rounded-full px-3 py-1.5 text-[13px] text-[--muted] transition hover:text-[--ink]"
            >
              {theme === "dark" ? "Clair" : "Sombre"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-8 pt-4">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="text-[28px] font-semibold tracking-[-0.02em] text-[--ink]"
            >
              Que dit la loi ivoirienne ?
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.08 }}
              className="mt-2 max-w-xs text-[14px] leading-6 text-[--muted]"
            >
              Contrôles, garde à vue, fouilles, perquisitions...
            </motion.p>
            <div className="mt-8 grid w-full max-w-xl gap-3 sm:grid-cols-2">
              {STARTER_PROMPTS.map((suggestion, index) => (
                <motion.button
                  key={suggestion}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + 0.07 * index, duration: 0.22 }}
                  type="button"
                  onClick={() => setQuestion(suggestion)}
                  className="rounded-[18px] border border-[--line] bg-[--surface] px-4 py-3.5 text-left text-[14px] text-[--ink-soft] transition hover:bg-[--surface-strong] hover:border-[rgba(255,255,255,0.15)]"
                >
                  {suggestion}
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((message, index) =>
                message.role === "user" ? (
                  <motion.div
                    key={message.id}
                    layout
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.22 }}
                    className="flex justify-end"
                  >
                    <div className="max-w-[80%] rounded-[22px] bg-[--user-bubble] px-4 py-3 text-[15px] leading-7 text-[--user-text] shadow-[0_14px_34px_rgba(0,0,0,0.10)]">
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key={message.id}
                    layout
                    initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                    className="max-w-[92%]"
                  >
                    <AssistantIdentity status="Réponse sourcée" />
                    <div className="mt-3 rounded-[24px] border border-[--line] bg-[--surface]/80 px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.12)]">
                      <motion.p
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.04, duration: 0.24 }}
                        className="whitespace-pre-wrap text-[15px] leading-7 text-[--ink]"
                      >
                        {message.content}
                      </motion.p>
                      {index === lastAssistantIndex && visibleCitations.length > 0 && (
                        <CitationList
                          citations={visibleCitations}
                          confidence={visibleConfidence}
                          needsHumanReview={visibleNeedsHumanReview}
                        />
                      )}
                    </div>
                  </motion.div>
                ),
              )}

              {isLoading ? <ThinkingBubble /> : null}
            </AnimatePresence>

            {requestError ? (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-2xl bg-[--danger-soft] px-4 py-3 text-sm text-[--danger]"
              >
                {requestError}
              </motion.p>
            ) : null}

            <div ref={bottomRef} />
          </div>
        )}
      </main>

      <div className="sticky bottom-0 z-30 mt-auto bg-gradient-to-t from-[--bg] via-[--bg]/95 to-transparent pt-8">
        <div className="mx-auto w-full max-w-3xl px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
          <ChatComposer
            value={question}
            onChange={setQuestion}
            onSubmit={() => void handleSend()}
            isPending={isLoading}
            suggestions={STARTER_PROMPTS}
            showSuggestions={false}
            onSelectSuggestion={(s) => {
              setQuestion(s);
            }}
          />
        </div>
      </div>
    </div>
  );
}
