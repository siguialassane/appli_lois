import { createFileRoute } from "@tanstack/react-router";

import { hasPrivateAccess } from "@/lib/legal/access";
import {
  buildContextualQuestion,
  getRecentConversation,
  hasConversationScope,
} from "@/lib/legal/conversation";
import {
  fallbackEvidenceAssessment,
  selectAssessedCitations,
} from "@/lib/legal/pipeline";
import { buildFallbackResponse, buildInsufficientEvidenceResponse } from "@/lib/legal/response";
import {
  buildBasicLegalIntent,
  maybeBuildLegalIntent,
  maybeGenerateWithOpenRouter,
  maybeRerankAndAssessEvidence,
} from "@/lib/legal/openrouter";
import { retrieveCandidatePassages, isPoliceCitizenScope } from "@/lib/legal/retrieval";
import { appendExchange, getOrCreateSession } from "@/lib/legal/storage";
import { maybePersistChat } from "@/lib/legal/supabase";
import { askRequestSchema } from "@/lib/legal/types";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });
}

function getAccessCode(request: Request, fallback?: string) {
  return fallback ?? request.headers.get("x-private-access") ?? null;
}

function assertPrivateAccess(request: Request, fallback?: string) {
  const accessCode = getAccessCode(request, fallback);
  return hasPrivateAccess(accessCode);
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!assertPrivateAccess(request)) {
          return json({ error: "Acces refuse." }, { status: 401 });
        }

        const url = new URL(request.url);
        const sessionId = url.searchParams.get("sessionId");

        if (!sessionId) {
          return json({ error: "sessionId manquant." }, { status: 400 });
        }

        const session = await getOrCreateSession(sessionId);
        return json({ history: session.messages, sessionId: session.id });
      },

      POST: async ({ request }) => {
        try {
          const body = askRequestSchema.parse(await request.json());

          if (!assertPrivateAccess(request, body.accessCode)) {
            return json({ error: "Acces refuse." }, { status: 401 });
          }

          const session = await getOrCreateSession(body.sessionId);
          const recentMessages = getRecentConversation(session.messages);
          const contextualQuestion = buildContextualQuestion(body.question, recentMessages);
          const inScope = hasConversationScope(
            contextualQuestion,
            recentMessages,
            isPoliceCitizenScope,
          );

          const intent = inScope
            ? ((await maybeBuildLegalIntent(contextualQuestion, recentMessages).catch((error) => {
                console.error("OpenRouter intent skipped", error);
                return null;
              })) ?? buildBasicLegalIntent(contextualQuestion))
            : buildBasicLegalIntent(contextualQuestion);

          const candidates = inScope
            ? await retrieveCandidatePassages(intent.normalized_question, intent, 30)
            : [];

          const assessment = inScope
            ? ((await maybeRerankAndAssessEvidence(body.question, intent, candidates).catch((error) => {
                console.error("OpenRouter rerank skipped", error);
                return null;
              })) ?? fallbackEvidenceAssessment(candidates))
            : fallbackEvidenceAssessment([]);

          const citations = selectAssessedCitations(candidates, assessment);

          let response = !inScope
            ? buildFallbackResponse(body.question, [], false)
            : assessment.sufficient
              ? buildFallbackResponse(body.question, citations, true)
              : buildInsufficientEvidenceResponse(citations, assessment.reason);

          if (inScope && assessment.sufficient && citations.length > 0) {
            try {
              response =
                (await maybeGenerateWithOpenRouter(body.question, citations, recentMessages)) ??
                response;
            } catch (error) {
              console.error("OpenRouter fallback", error);
            }
          }

          const nextSession = await appendExchange(body.sessionId, body.question, response);

          try {
            await maybePersistChat(body.sessionId, body.question, response);
          } catch (error) {
            console.error("Supabase persistence skipped", error);
          }

          return json({
            ...response,
            sessionId: nextSession.id,
            history: nextSession.messages,
          });
        } catch (error) {
          console.error("chat route error", error);
          return json({ error: "La demande a echoue." }, { status: 400 });
        }
      },
    },
  },
});
