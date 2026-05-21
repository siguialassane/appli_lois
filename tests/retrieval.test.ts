import { describe, expect, it } from "vitest";

import { isPoliceCitizenScope, retrieveRelevantPassages } from "../src/lib/legal/retrieval";
import { normalizeForSearch } from "../src/lib/legal/utils";

describe("retrieval", () => {
  it("detects police-citizen scope questions", () => {
    expect(isPoliceCitizenScope("Un policier peut-il me demander ma carte d'identite ?")).toBe(
      true,
    );
    expect(isPoliceCitizenScope("Quel est le meilleur plat ivoirien ?")).toBe(false);
  });

  it("returns citations for garde a vue queries", async () => {
    const citations = await retrieveRelevantPassages(
      "Quels sont mes droits pendant une garde a vue en Cote d'Ivoire ?",
    );

    expect(citations.length).toBeGreaterThan(0);
    expect(
      citations.some(
        (citation) =>
          citation.article_number === "Article 7" ||
          citation.document_title.toLowerCase().includes("procédure pénale") ||
          citation.excerpt.toLowerCase().includes("gardé à vue") ||
          citation.excerpt.toLowerCase().includes("garde a vue"),
      ),
    ).toBe(true);
  });

  it("prioritizes direct vehicle-search citations over geolocation passages", async () => {
    const citations = await retrieveRelevantPassages("Peut-on fouiller mon vehicule ?");

    expect(citations.length).toBeGreaterThan(0);
    expect(citations[0]?.article_number).toBe("Article 67");
    expect(
      citations.some(
        (citation) =>
          citation.article_number === "Article 67" &&
          normalizeForSearch(citation.excerpt).includes("fouille") &&
          normalizeForSearch(citation.excerpt).includes("vehicule"),
      ),
    ).toBe(true);
  });

  it("finds seatbelt contravention rules for road-law questions", async () => {
    const citations = await retrieveRelevantPassages(
      "Est ce que dans un vehicule de transport si je porte pas ma ceinture de securite devant je risque une contravention ?",
    );

    expect(citations.length).toBeGreaterThan(0);
    expect(citations[0]?.article_number).toBe("Article 256 (nouveau)");
    expect(citations.some((citation) => citation.article_number === "Article 256 (nouveau)")).toBe(
      true,
    );
  });

  it("prioritizes domicile-search safeguards over unrelated mandate articles", async () => {
    const citations = await retrieveRelevantPassages(
      "la police peut rentrer chez moi comme ils veulent sans mandat meme pour des enquetes ?",
    );

    expect(citations.length).toBeGreaterThan(0);
    expect(citations[0]?.article_number).toBe("Article 67");
    expect(citations.some((citation) => citation.article_number === "Article 8")).toBe(true);
    expect(
      citations.some(
        (citation) =>
          citation.article_number === "Article 68" || citation.article_number === "Article 80",
      ),
    ).toBe(true);
  });

  it("keeps core home-search citations for a paraphrased question", async () => {
    const citations = await retrieveRelevantPassages(
      "les gendarmes peuvent-ils entrer dans ma maison pendant une enquete sans autorisation ?",
    );

    expect(citations.length).toBeGreaterThan(0);
    expect(citations.some((citation) => citation.article_number === "Article 67")).toBe(true);
    expect(citations.some((citation) => citation.article_number === "Article 8")).toBe(true);
    expect(
      citations.some(
        (citation) =>
          citation.article_number === "Article 68" || citation.article_number === "Article 80",
      ),
    ).toBe(true);
  });
});
