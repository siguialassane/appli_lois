import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import { STATIC_WARNING } from "./config";
import {
  chatResponseSchema,
  evidenceAssessmentSchema,
  legalQueryIntentSchema,
  type ChatCitation,
  type ChatResponse,
  type EvidenceAssessment,
  type LegalQueryIntent,
  type LocalChatMessage,
} from "./types";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_EMBEDDINGS_ENDPOINT = "https://openrouter.ai/api/v1/embeddings";

const UNCERTAINTY_MARKERS = [
  "ne le dit pas clairement",
  "ne dit pas clairement",
  "ne precise pas",
  "ne permet pas de conclure",
  "ne permet pas d'affirmer",
  "ne tranche pas",
  "incertain",
];

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasPracticalAdvice(answer: string) {
  return /conseil pratique\s*:/i.test(answer);
}

function isSeatbeltTopic(question: string, citations: ChatCitation[]) {
  const normalizedQuestion = normalizeText(question);
  if (normalizedQuestion.includes("ceinture")) {
    return true;
  }

  return citations.some((citation) => {
    const haystack = normalizeText(
      `${citation.article_number} ${citation.excerpt}`,
    );
    return haystack.includes("ceinture");
  });
}

function isLegallyUncertain(answer: string) {
  const normalized = normalizeText(answer);
  return UNCERTAINTY_MARKERS.some((marker) => normalized.includes(marker));
}

function stripTrailingSeatbeltAdvice(answer: string) {
  return answer.replace(/\s*Il est prudent[^.]*\.\s*$/i, "").trim();
}

function appendPracticalAdvice(
  answer: string,
  question: string,
  citations: ChatCitation[],
) {
  const trimmed = answer.trim();

  if (!trimmed || hasPracticalAdvice(trimmed)) {
    return trimmed;
  }

  if (isSeatbeltTopic(question, citations) && isLegallyUncertain(trimmed)) {
    const baseAnswer = stripTrailingSeatbeltAdvice(trimmed);

    return `${baseAnswer}\n\nConseil pratique : meme si le texte cite ne tranche pas clairement pour le passager, le plus prudent pour la securite de tous reste que chaque occupant attache sa ceinture.`;
  }

  return trimmed;
}

function normalizeConfidence(value: unknown): "low" | "medium" | "high" {
  if (typeof value !== "string") {
    return "medium";
  }

  const normalized = value.trim().toLowerCase();

  if (["low", "faible", "basse", "bas"].includes(normalized)) {
    return "low";
  }

  if (["high", "haute", "haut", "elevee", "elevated"].includes(normalized)) {
    return "high";
  }

  return "medium";
}

function getOpenRouterHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_APP_URL ?? "http://localhost:3000",
    "X-Title": process.env.OPENROUTER_APP_NAME ?? "Appli Loi CI",
  };
}

function parseJsonObject(content: string) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("La reponse du modele n'est pas un JSON valide.");
    }

    return JSON.parse(match[0]);
  }
}

function normalizeModelResponse(parsed: unknown) {
  const payload = parsed && typeof parsed === "object" ? parsed : {};
  const record = payload as Record<string, unknown>;

  return {
    answer:
      typeof record.answer === "string"
        ? record.answer
        : typeof record.reponse === "string"
          ? record.reponse
          : typeof record.response === "string"
            ? record.response
            : "Je ne peux pas formuler une reponse fiable a partir du resultat du modele.",
    confidence: normalizeConfidence(record.confidence),
    needs_human_review:
      typeof record.needs_human_review === "boolean"
        ? record.needs_human_review
        : typeof record.needsHumanReview === "boolean"
          ? record.needsHumanReview
          : normalizeConfidence(record.confidence) === "low",
    warning:
      typeof record.warning === "string"
        ? record.warning
        : typeof record.avertissement === "string"
          ? record.avertissement
          : STATIC_WARNING,
  };
}

function normalizeSelectedPassageIds(value: unknown, candidates: ChatCitation[]) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        const trimmed = item.trim();
        const directMatch = candidates.find((citation) => citation.passage_id === trimmed);
        if (directMatch) {
          return directMatch.passage_id;
        }

        const indexMatch = trimmed.match(/^#?(\d+)$/);
        if (indexMatch) {
          return candidates[Number(indexMatch[1]) - 1]?.passage_id ?? null;
        }
      }

      if (typeof item === "number") {
        return candidates[item - 1]?.passage_id ?? null;
      }

      return null;
    })
    .filter((item): item is string => Boolean(item));
}

function normalizeEvidenceAssessment(
  parsed: unknown,
  candidates: ChatCitation[],
): EvidenceAssessment {
  const payload = parsed && typeof parsed === "object" ? parsed : {};
  const record = payload as Record<string, unknown>;

  return evidenceAssessmentSchema.parse({
    selected_passage_ids: normalizeSelectedPassageIds(
      record.selected_passage_ids ?? record.selectedPassageIds ?? record.passages,
      candidates,
    ),
    sufficient: record.sufficient === true,
    confidence: normalizeConfidence(record.confidence),
    reason:
      typeof record.reason === "string"
        ? record.reason
        : typeof record.raison === "string"
          ? record.raison
          : "Evaluation de pertinence indisponible.",
  });
}

export async function maybeGenerateWithOpenRouter(
  question: string,
  citations: ChatCitation[],
  recentMessages: LocalChatMessage[] = [],
): Promise<ChatResponse | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;

  if (!apiKey || !model || citations.length === 0) {
    return null;
  }

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: getOpenRouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        ...recentMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: "user", content: buildUserPrompt(question, citations) },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }

  const parsed = normalizeModelResponse(parseJsonObject(content));
  return chatResponseSchema.parse({
    ...parsed,
    answer: appendPracticalAdvice(parsed.answer, question, citations),
    citations,
    mode: "openrouter",
  });
}

export function buildBasicLegalIntent(question: string): LegalQueryIntent {
  const normalized = question.trim();
  const queryTerms = normalized
    .toLowerCase()
    .split(/[^a-zA-ZÀ-ÿ0-9]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length > 2)
    .slice(0, 12);

  return legalQueryIntentSchema.parse({
    normalized_question: normalized,
    legal_issue: normalized,
    query_terms: queryTerms,
    must_have_terms: [],
    excluded_topics: [],
    themes: [],
    document_types: [],
    needs_clarification: false,
    clarification_question: null,
  });
}

export async function maybeBuildLegalIntent(
  question: string,
  recentMessages: LocalChatMessage[] = [],
): Promise<LegalQueryIntent | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;

  if (!apiKey || !model) {
    return null;
  }

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: getOpenRouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "Tu transformes une question utilisateur en intention juridique interne pour un moteur RAG.",
            "Ne reponds pas a l'utilisateur.",
            "Retourne seulement un JSON strict.",
            "Le domaine est le droit ivoirien police-citoyen avec un corpus limite.",
            "N'invente pas de texte de loi.",
            "Champs requis: normalized_question, legal_issue, query_terms, must_have_terms, excluded_topics, themes, document_types, needs_clarification, clarification_question.",
            "themes possibles: controle-identite, controle-routier, perquisition, interpellation, garde-a-vue, droits-fondamentaux, general.",
            "document_types possibles: constitution, code, law, decree, ordinance, other.",
          ].join(" "),
        },
        ...recentMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: "user", content: question },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter intent error: ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }

  return legalQueryIntentSchema.parse(parseJsonObject(content));
}

export async function embedTextWithOpenRouter(input: string): Promise<number[] | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_EMBEDDING_MODEL;

  if (!apiKey || !model || !input.trim()) {
    return null;
  }

  const response = await fetch(OPENROUTER_EMBEDDINGS_ENDPOINT, {
    method: "POST",
    headers: getOpenRouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      input,
      dimensions: 1536,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter embedding error: ${response.status}`);
  }

  const payload = await response.json();
  const embedding = payload?.data?.[0]?.embedding;
  return Array.isArray(embedding) ? embedding.map(Number) : null;
}

export async function maybeRerankAndAssessEvidence(
  question: string,
  intent: LegalQueryIntent,
  candidates: ChatCitation[],
): Promise<EvidenceAssessment | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;

  if (!apiKey || !model || candidates.length === 0) {
    return null;
  }

  const candidateBlock = candidates
    .map((citation, index) =>
      [
        `#${index + 1}`,
        `passage_id: ${citation.passage_id}`,
        `titre: ${citation.document_title}`,
        `article: ${citation.article_number}`,
        `theme: ${citation.theme}`,
        `extrait: ${citation.excerpt}`,
      ].join("\n"),
    )
    .join("\n\n---\n\n");

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: getOpenRouterHeaders(apiKey),
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "Tu es un reranker juridique strict.",
            "Tu ne rediges pas la reponse finale.",
            "Tu choisis seulement les passages qui repondent directement a la question juridique.",
            "La reponse peut etre suffisante meme si le vocabulaire exact de l'utilisateur est imprecis: par exemple si l'utilisateur dit 'mandat' mais que les textes pertinents parlent d'autorisation du procureur, retiens les textes et signale cette distinction dans la raison.",
            "sufficient=true seulement si les passages retenus permettent d'expliquer la regle, l'autorite competente ou la limite principale.",
            "Si les passages parlent d'un sujet voisin mais ne permettent pas de conclure, sufficient=false.",
            "Tu dois etre conservateur: mieux vaut refuser que soutenir une conclusion avec des preuves faibles.",
            "Retourne un JSON strict avec selected_passage_ids, sufficient, confidence, reason.",
            "selected_passage_ids doit contenir 1 a 6 ids, dans l'ordre de pertinence, ou [] si aucun passage ne convient.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Question utilisateur: ${question}`,
            `Intention juridique: ${JSON.stringify(intent)}`,
            "",
            "Passages candidats:",
            candidateBlock,
          ].join("\n"),
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter rerank error: ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }

  return normalizeEvidenceAssessment(parseJsonObject(content), candidates);
}
