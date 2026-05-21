import { STATIC_WARNING } from "./config";
import { type ChatCitation, type ChatResponse } from "./types";
import { confidenceFromScore } from "./utils";

const SENSITIVE_TERMS = [
  "violence",
  "frapper",
  "tirer",
  "mort",
  "arme",
  "enfant",
  "mineur",
  "torture",
];

export function buildFallbackResponse(
  question: string,
  citations: ChatCitation[],
  inScope: boolean,
): ChatResponse {
  if (!inScope) {
    return {
      answer:
        "Le texte ne le dit pas ici, parce que cette application repond seulement aux questions police-citoyen en droit ivoirien. Reformule la question autour d'un controle, d'une interpellation, d'une garde a vue, d'une fouille, d'une perquisition ou d'un controle routier.",
      citations: [],
      confidence: "low",
      needs_human_review: false,
      warning: STATIC_WARNING,
      mode: "fallback",
    };
  }

  if (citations.length === 0) {
    return {
      answer:
        "Le texte ne le dit pas clairement, et je ne peux pas te repondre oui ou non avec fiabilite pour l'instant. Aucun article assez pertinent n'a ete retrouve dans la base actuelle. Il vaut mieux verifier avec un juriste ou enrichir la base sur ce point avant de conclure.",
      citations: [],
      confidence: "low",
      needs_human_review: true,
      warning: STATIC_WARNING,
      mode: "fallback",
    };
  }

  const topScore = citations[0]?.score ?? 0;
  const confidence = confidenceFromScore(topScore);
  const needsHumanReview =
    confidence === "low" ||
    SENSITIVE_TERMS.some((term) => question.toLowerCase().includes(term));

  const quoted = citations
    .slice(0, 3)
    .map(
      (citation) =>
        `- ${citation.article_number} (${citation.document_title}) : ${citation.excerpt}`,
    )
    .join("\n");

  const answer = [
    confidence === "low"
      ? "Le texte ne le dit pas clairement, mais voici ce qu'on peut affirmer avec prudence."
      : "Oui, si les conditions prevues par les textes cites sont bien reunies.",
    "",
    "En simple : l'action de la police doit rester rattachee a une base legale precise et au contexte reel. Si ces conditions ne sont pas reunies, la mesure peut etre discutable.",
    "",
    "Preuves dans la loi :",
    quoted,
  ].join("\n");

  return {
    answer,
    citations,
    confidence,
    needs_human_review: needsHumanReview,
    warning: STATIC_WARNING,
    mode: "fallback",
  };
}

export function buildInsufficientEvidenceResponse(
  citations: ChatCitation[],
  reason = "Les passages retrouves ne repondent pas assez directement a la question.",
): ChatResponse {
  return {
    answer: [
      "Le corpus actuel ne permet pas une reponse fiable a cette question.",
      "",
      reason,
      "Je peux seulement repondre quand les textes retrouves soutiennent directement la conclusion. Ici, il vaut mieux verifier avec un juriste ou enrichir la base avec les textes applicables avant de conclure.",
    ].join("\n"),
    citations,
    confidence: "low",
    needs_human_review: true,
    warning: STATIC_WARNING,
    mode: "fallback",
  };
}
