import { TOP_K_CITATIONS } from "./config";
import { type ChatCitation, type EvidenceAssessment } from "./types";

export function fallbackEvidenceAssessment(citations: ChatCitation[]): EvidenceAssessment {
  const topScore = citations[0]?.score ?? 0;
  const selected_passage_ids = citations
    .filter((citation) => citation.score >= 8)
    .slice(0, TOP_K_CITATIONS)
    .map((citation) => citation.passage_id);

  return {
    selected_passage_ids,
    sufficient: selected_passage_ids.length > 0 && topScore >= 8,
    confidence: topScore >= 18 ? "high" : topScore >= 8 ? "medium" : "low",
    reason:
      selected_passage_ids.length > 0
        ? "Les meilleurs passages locaux semblent suffisamment proches de la question."
        : "Aucun passage candidat ne soutient directement une reponse fiable.",
  };
}

export function selectAssessedCitations(
  candidates: ChatCitation[],
  assessment: EvidenceAssessment,
) {
  if (!assessment.sufficient) {
    return [];
  }

  const byId = new Map(candidates.map((citation) => [citation.passage_id, citation]));
  const selected = assessment.selected_passage_ids
    .map((id) => byId.get(id))
    .filter((citation): citation is ChatCitation => Boolean(citation));

  return selected.length > 0 ? selected.slice(0, TOP_K_CITATIONS) : candidates.slice(0, TOP_K_CITATIONS);
}

export function mergeCandidateCitations(
  localCandidates: ChatCitation[],
  externalCandidates: ChatCitation[],
  limit: number,
) {
  const seen = new Set<string>();
  const merged: ChatCitation[] = [];

  for (const citation of [...localCandidates, ...externalCandidates]) {
    if (seen.has(citation.passage_id)) {
      continue;
    }

    seen.add(citation.passage_id);
    merged.push(citation);

    if (merged.length >= limit) {
      break;
    }
  }

  return merged;
}