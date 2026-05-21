import { describe, expect, it } from "vitest";

import {
  fallbackEvidenceAssessment,
  mergeCandidateCitations,
  selectAssessedCitations,
} from "../src/lib/legal/pipeline";
import { type ChatCitation, type EvidenceAssessment } from "../src/lib/legal/types";

function createCitation(overrides: Partial<ChatCitation> = {}): ChatCitation {
  return {
    passage_id: overrides.passage_id ?? "passage-1",
    document_title: overrides.document_title ?? "Document test",
    article_number: overrides.article_number ?? "Article 1",
    source_url: overrides.source_url ?? "https://example.com/source",
    version_date: overrides.version_date ?? "2024-01-01",
    excerpt: overrides.excerpt ?? "Extrait test",
    source_rank: overrides.source_rank ?? 1,
    theme: overrides.theme ?? "perquisition",
    score: overrides.score ?? 10,
  };
}

describe("legal pipeline helpers", () => {
  it("keeps local candidates ahead of external candidates when merging", () => {
    const localCandidates = [
      createCitation({ passage_id: "local-1", article_number: "Article 67", score: 22 }),
      createCitation({ passage_id: "local-2", article_number: "Article 8", score: 18 }),
    ];
    const externalCandidates = [
      createCitation({ passage_id: "local-1", article_number: "Article 67", score: 0.91 }),
      createCitation({ passage_id: "remote-1", article_number: "Article 80", score: 0.83 }),
    ];

    const merged = mergeCandidateCitations(localCandidates, externalCandidates, 5);

    expect(merged.map((citation) => citation.passage_id)).toEqual([
      "local-1",
      "local-2",
      "remote-1",
    ]);
    expect(merged[0]?.score).toBe(22);
  });

  it("returns no citations when evidence is insufficient", () => {
    const candidates = [
      createCitation({ passage_id: "cand-1", score: 17 }),
      createCitation({ passage_id: "cand-2", score: 15 }),
    ];
    const assessment: EvidenceAssessment = {
      selected_passage_ids: [],
      sufficient: false,
      confidence: "low",
      reason: "Aucun passage ne permet de conclure.",
    };

    expect(selectAssessedCitations(candidates, assessment)).toEqual([]);
  });

  it("falls back to top candidates only when evidence was marked sufficient", () => {
    const candidates = [
      createCitation({ passage_id: "cand-1", score: 17 }),
      createCitation({ passage_id: "cand-2", score: 15 }),
    ];
    const assessment: EvidenceAssessment = {
      selected_passage_ids: ["missing-id"],
      sufficient: true,
      confidence: "medium",
      reason: "Les passages retenus sont suffisants.",
    };

    expect(selectAssessedCitations(candidates, assessment)).toEqual(candidates);
  });

  it("keeps the local fallback threshold tied to local scores", () => {
    const assessment = fallbackEvidenceAssessment([
      createCitation({ passage_id: "cand-1", score: 0.92 }),
      createCitation({ passage_id: "cand-2", score: 0.87 }),
    ]);

    expect(assessment.sufficient).toBe(false);
    expect(assessment.selected_passage_ids).toEqual([]);
    expect(assessment.confidence).toBe("low");
  });
});