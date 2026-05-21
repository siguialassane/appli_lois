import { MIN_RETRIEVAL_SCORE, TOP_K_CITATIONS } from "./config";
import { loadCorpus } from "./corpus";
import { embedTextWithOpenRouter } from "./openrouter";
import { mergeCandidateCitations } from "./pipeline";
import { maybeSearchLegalPassagesWithSupabase } from "./supabase";
import { excerptText, normalizeForSearch, stripAccents, tokenize } from "./utils";
import { type ChatCitation, type LegalPassage, type LegalQueryIntent } from "./types";

type QueryConceptDefinition = {
  id: string;
  triggers: string[];
  expansions: string[];
  evidenceTerms?: string[];
  negativeTerms?: string[];
  themes?: string[];
  preferredDocumentTypes?: LegalPassage["document_type"][];
  weight: number;
  negativeWeight?: number;
};

type QuestionAnalysis = {
  normalizedQuestion: string;
  queryTokens: string[];
  expandedTokens: string[];
  activeConcepts: QueryConceptDefinition[];
  anchorTerms: string[];
  asksLegality: boolean;
  asksAuthority: boolean;
  asksException: boolean;
  asksTiming: boolean;
};

const QUERY_CONCEPTS: QueryConceptDefinition[] = [
  {
    id: "police-authority",
    triggers: ["police", "policier", "gendarme", "opj", "procureur", "juge"],
    expansions: [
      "police",
      "gendarme",
      "officier de police judiciaire",
      "procureur de la republique",
      "juge d instruction",
    ],
    evidenceTerms: ["officier de police judiciaire", "procureur de la republique"],
    themes: ["interpellation", "controle-identite", "perquisition"],
    weight: 5,
  },
  {
    id: "custody",
    triggers: ["garde a vue", "garde vue", "arrestation", "arrete", "retenu", "detenu"],
    expansions: ["garde a vue", "gardee a vue", "arrestation", "retenu", "detenu"],
    evidenceTerms: ["garde a vue", "quarante-huit heures", "avocat"],
    themes: ["garde-a-vue", "interpellation", "droits-fondamentaux"],
    preferredDocumentTypes: ["constitution", "code"],
    weight: 10,
  },
  {
    id: "identity",
    triggers: ["identite", "piece", "papiers", "carte", "cni"],
    expansions: ["controle d identite", "piece d identite", "carte nationale d identite", "papiers"],
    evidenceTerms: ["controle d identite", "piece d identite", "carte nationale d identite"],
    themes: ["controle-identite"],
    weight: 8,
  },
  {
    id: "home-entry",
    triggers: ["domicile", "chez moi", "chez lui", "chez elle", "maison", "habitation"],
    expansions: ["domicile", "maison", "habitation", "visite domiciliaire", "perquisition"],
    evidenceTerms: [
      "domicile est inviolable",
      "visites domiciliaires",
      "autorisation ecrite ou verbale du procureur de la republique",
      "crime flagrant",
    ],
    negativeTerms: ["mandat d arret", "mandat de depot"],
    themes: ["perquisition", "controle-identite"],
    preferredDocumentTypes: ["constitution", "code"],
    weight: 10,
    negativeWeight: 8,
  },
  {
    id: "search",
    triggers: ["perquisition", "fouille", "saisie", "entrer", "rentrer"],
    expansions: ["perquisition", "visites domiciliaires", "fouille", "saisie"],
    evidenceTerms: ["perquisition", "visites domiciliaires", "saisie"],
    themes: ["perquisition", "controle-identite", "controle-routier"],
    weight: 8,
  },
  {
    id: "investigation",
    triggers: ["enquete", "investigation", "instruction", "recherche", "flagrant", "delit"],
    expansions: ["enquete", "instruction", "crime flagrant", "flagrant delit", "manifestation de la verite"],
    evidenceTerms: ["crime flagrant", "manifestation de la verite", "informe le procureur"],
    themes: ["interpellation", "perquisition", "controle-identite"],
    weight: 5,
  },
  {
    id: "vehicle",
    triggers: ["vehicule", "voiture", "automobile", "carte grise"],
    expansions: ["vehicule", "voiture", "automobile", "fouille de vehicule", "controle routier"],
    evidenceTerms: ["vehicule", "fouille de vehicule", "fouilles de vehicules"],
    negativeTerms: ["geolocalisation", "dispositif technique"],
    themes: ["controle-routier", "perquisition", "controle-identite"],
    weight: 9,
    negativeWeight: 8,
  },
  {
    id: "seatbelt",
    triggers: ["ceinture", "conducteur", "passager"],
    expansions: ["ceinture de securite", "non port de la ceinture de securite", "conducteur", "passager"],
    evidenceTerms: ["ceinture de securite", "non port de la ceinture", "amendes forfaitaires", "contravention"],
    negativeTerms: ["au sens du present decret"],
    themes: ["controle-routier"],
    weight: 10,
    negativeWeight: 4,
  },
  {
    id: "road-sanction",
    triggers: ["contravention", "amende", "permis", "route", "routier", "circulation", "transport"],
    expansions: ["contravention", "amende", "permis", "controle routier", "circulation routiere", "transport routier"],
    evidenceTerms: ["contravention", "amendes forfaitaires", "permis"],
    themes: ["controle-routier"],
    weight: 7,
  },
  {
    id: "manifestation",
    triggers: ["manifestation", "marche", "attroupement", "voie publique", "lieu public"],
    expansions: ["manifestation", "marche", "voie publique", "lieux publics", "ordre public"],
    evidenceTerms: ["manifestation", "voie publique", "lieux publics"],
    weight: 7,
  },
  {
    id: "minors",
    triggers: ["mineur", "mineurs", "enfant", "enfants", "adolescent"],
    expansions: ["mineur", "enfant", "juge des enfants", "protection de l enfant"],
    evidenceTerms: ["mineur", "juge des enfants"],
    weight: 7,
  },
];

const SCOPE_TERMS = Array.from(
  new Set(QUERY_CONCEPTS.flatMap((concept) => [...concept.triggers, ...concept.expansions])),
);

const LEGAL_DECISION_TERMS = [
  "ne peut",
  "ne peuvent",
  "peut",
  "doit",
  "interdit",
  "autorisation",
  "presence",
  "sauf",
  "toutefois",
];

const AUTHORITY_TERMS = [
  "procureur de la republique",
  "officier de police judiciaire",
  "juge d instruction",
  "autorisation ecrite",
  "autorisation verbale",
  "mandat",
];

const EXCEPTION_TERMS = ["sauf", "toutefois", "exception", "flagrant", "urgence"];
const TIMING_TERMS = ["avant", "apres", "heure", "delai", "quarante-huit heures"];
const FUNDAMENTAL_RIGHTS_TERMS = [
  "inviolable",
  "inviolabilite du domicile",
  "liberte individuelle",
  "droits fondamentaux",
];
const LOW_SIGNAL_TOKENS = new Set([
  "police",
  "policier",
  "gendarme",
  "mandat",
  "enquete",
  "enquetes",
  "juge",
  "procureur",
  "loi",
  "article",
  "peut",
  "sans",
  "meme",
]);

function countPhraseMatches(haystack: string, phrases: string[]) {
  return phrases.reduce((total, phrase) => {
    const normalizedPhrase = normalizeForSearch(phrase);
    return normalizedPhrase && haystack.includes(normalizedPhrase) ? total + 1 : total;
  }, 0);
}

function includesAnyPhrase(haystack: string, phrases: string[]) {
  return phrases.some((phrase) => haystack.includes(normalizeForSearch(phrase)));
}

function uniqueTerms(terms: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const term of terms) {
    const normalizedTerm = normalizeForSearch(term);
    if (!normalizedTerm || seen.has(normalizedTerm)) {
      continue;
    }

    seen.add(normalizedTerm);
    unique.push(normalizedTerm);
  }

  return unique;
}

function tokenWeight(token: string) {
  return LOW_SIGNAL_TOKENS.has(token) ? 0.8 : 2.4;
}

function phraseTokenOverlap(term: string, queryTokens: string[]) {
  const normalizedTerm = normalizeForSearch(term);
  return queryTokens.filter((token) => normalizedTerm.includes(token)).length;
}

function directConceptMatchCount(concept: QueryConceptDefinition, haystack: string) {
  return (
    countPhraseMatches(haystack, concept.expansions) +
    countPhraseMatches(haystack, concept.evidenceTerms ?? [])
  );
}

function analyzeQuestion(question: string): QuestionAnalysis {
  const normalizedQuestion = normalizeForSearch(question);
  const queryTokens = tokenize(question);
  const activeConcepts = QUERY_CONCEPTS.filter((concept) =>
    includesAnyPhrase(normalizedQuestion, concept.triggers),
  );
  const expandedTerms = uniqueTerms([
    ...queryTokens,
    ...activeConcepts.flatMap((concept) => concept.expansions),
    ...activeConcepts.flatMap((concept) => concept.evidenceTerms ?? []),
  ]);
  const expandedTokens = uniqueTerms(expandedTerms.flatMap((term) => tokenize(term)));
  const anchorCandidates = activeConcepts
    .flatMap((concept) =>
      [
        ...(concept.evidenceTerms ?? []),
        ...concept.expansions.filter((term) => term.length > 4),
      ].map((term) => ({
        term,
        weight: concept.weight,
        overlap: phraseTokenOverlap(term, queryTokens),
      })),
    )
    .sort(
      (left, right) =>
        right.weight - left.weight || right.overlap - left.overlap || right.term.length - left.term.length,
    );
  const anchorTerms = uniqueTerms(anchorCandidates.map((candidate) => candidate.term));

  return {
    normalizedQuestion,
    queryTokens,
    expandedTokens,
    activeConcepts,
    anchorTerms,
    asksLegality: includesAnyPhrase(normalizedQuestion, [
      "peut",
      "droit",
      "legal",
      "legale",
      "autorise",
      "interdit",
      "sans",
    ]),
    asksAuthority: includesAnyPhrase(normalizedQuestion, [
      "mandat",
      "autorisation",
      "procureur",
      "juge",
      "police",
      "gendarme",
    ]),
    asksException: includesAnyPhrase(normalizedQuestion, ["sauf", "meme", "exception", "urgence", "flagrant"]),
    asksTiming: includesAnyPhrase(normalizedQuestion, ["quand", "heure", "avant", "apres", "combien de temps"]),
  };
}

function getPassageHaystack(passage: LegalPassage) {
  return normalizeForSearch(
    [
      passage.title,
      passage.article_number,
      passage.theme,
      passage.hierarchy.join(" "),
      passage.text,
    ].join(" "),
  );
}

function conceptCoverageScore(
  concept: QueryConceptDefinition,
  haystack: string,
  passage: LegalPassage,
) {
  const expansionMatches = countPhraseMatches(haystack, concept.expansions);
  const evidenceMatches = countPhraseMatches(haystack, concept.evidenceTerms ?? []);
  const themeMatches = concept.themes?.includes(passage.theme) ? 1 : 0;
  const documentTypeMatches = concept.preferredDocumentTypes?.includes(passage.document_type)
    ? 1
    : 0;
  const negativeMatches = countPhraseMatches(haystack, concept.negativeTerms ?? []);

  let score = 0;
  score += Math.min(2, expansionMatches) * concept.weight;
  score += evidenceMatches * Math.max(3, Math.round(concept.weight / 2));
  score += themeMatches * 4;
  score += documentTypeMatches * 2;

  if (negativeMatches > 0 && expansionMatches + evidenceMatches === 0) {
    score -= negativeMatches * (concept.negativeWeight ?? 4);
  }

  return score;
}

function scorePassage(analysis: QuestionAnalysis, passage: LegalPassage) {
  const haystack = getPassageHaystack(passage);
  const tokens = new Set(tokenize(haystack));
  const baseOverlap = analysis.queryTokens.filter((token) => tokens.has(token));
  const expandedOverlap = analysis.expandedTokens.filter(
    (token) => tokens.has(token) && !analysis.queryTokens.includes(token),
  );
  let score = baseOverlap.reduce((total, token) => total + tokenWeight(token), 0);
  score += expandedOverlap.reduce((total, token) => total + tokenWeight(token) * 0.55, 0);

  for (const token of baseOverlap) {
    if (token.length > 5 && haystack.includes(token)) {
      score += 0.6;
    }
  }

  for (const token of expandedOverlap) {
    if (token.length > 5 && haystack.includes(token)) {
      score += 0.3;
    }
  }

  let matchedConcepts = 0;
  for (const concept of analysis.activeConcepts) {
    const conceptScore = conceptCoverageScore(concept, haystack, passage);
    if (conceptScore > 0) {
      matchedConcepts += 1;
    }
    score += conceptScore;
  }

  if (matchedConcepts >= 2) {
    score += matchedConcepts * 4;
  }

  score += Math.max(0, 4 - passage.source_rank);

  return Number(score.toFixed(2));
}

function rerankPassage(
  analysis: QuestionAnalysis,
  passage: LegalPassage,
  baseScore: number,
) {
  const haystack = getPassageHaystack(passage);
  let score = baseScore;

  const directConceptMatches = analysis.activeConcepts.filter((concept) => {
    if (directConceptMatchCount(concept, haystack) > 0) {
      return true;
    }

    return false;
  }).length;

  const themeConceptMatches = analysis.activeConcepts.filter((concept) => {
    if (directConceptMatchCount(concept, haystack) > 0) {
      return false;
    }

    return concept.themes?.includes(passage.theme) ?? false;
  }).length;

  score += directConceptMatches * 5;
  score += themeConceptMatches * 1.5;

  const coreConcepts = analysis.activeConcepts.filter((concept) => concept.weight >= 8);
  const directCoreMatches = coreConcepts.filter(
    (concept) => directConceptMatchCount(concept, haystack) > 0,
  ).length;

  if (coreConcepts.length > 0 && directCoreMatches === 0) {
    score -= 16;
  } else if (coreConcepts.length > 1 && directCoreMatches === 1) {
    score -= 4;
  }

  if (analysis.asksLegality) {
    score += Math.min(10, countPhraseMatches(haystack, LEGAL_DECISION_TERMS) * 1.8);
  }

  if (analysis.asksAuthority) {
    score += Math.min(10, countPhraseMatches(haystack, AUTHORITY_TERMS) * 2);
  }

  if (analysis.asksException) {
    score += Math.min(8, countPhraseMatches(haystack, EXCEPTION_TERMS) * 1.6);
  }

  if (analysis.asksTiming) {
    score += Math.min(6, countPhraseMatches(haystack, TIMING_TERMS) * 1.5);
  }

  const isHomeEntryQuestion = analysis.activeConcepts.some((concept) => concept.id === "home-entry");

  if (isHomeEntryQuestion) {
    score += countPhraseMatches(haystack, FUNDAMENTAL_RIGHTS_TERMS) * 4;

    if (passage.document_type === "constitution" && haystack.includes("domicile est inviolable")) {
      score += 14;
    }

    const talksMostlyAboutArrestWarrants =
      (haystack.includes("mandat d arret") || haystack.includes("mandat de depot")) &&
      !haystack.includes("autorisation") &&
      !haystack.includes("procureur de la republique");

    if (talksMostlyAboutArrestWarrants) {
      score -= 14;
    }
  }

  return Number(score.toFixed(2));
}

function injectRightsAnchor(
  analysis: QuestionAnalysis,
  ranked: Array<{ passage: LegalPassage; score: number }>,
) {
  const needsRightsAnchor = analysis.activeConcepts.some((concept) =>
    ["home-entry", "custody", "identity", "search"].includes(concept.id),
  );

  if (!needsRightsAnchor) {
    return ranked;
  }

  const topSlice = ranked.slice(0, TOP_K_CITATIONS);
  const alreadyHasRightsAnchor = topSlice.some(
    ({ passage }) =>
      passage.document_type === "constitution" || passage.theme === "droits-fondamentaux",
  );

  if (alreadyHasRightsAnchor) {
    return ranked;
  }

  const rightsCandidate = ranked.find(({ passage }) => {
    if (passage.document_type !== "constitution" && passage.theme !== "droits-fondamentaux") {
      return false;
    }

    const haystack = getPassageHaystack(passage);
    return analysis.activeConcepts.some(
      (concept) => directConceptMatchCount(concept, haystack) > 0,
    );
  });

  if (!rightsCandidate) {
    return ranked;
  }

  const leading = ranked[0] ? [ranked[0]] : [];
  const trailing = ranked[0] ? ranked.slice(1) : ranked;
  const merged = [...leading, rightsCandidate, ...trailing].filter(
    (entry, index, list) =>
      list.findIndex((candidate) => candidate.passage.id === entry.passage.id) === index,
  );

  return [
    ...merged.slice(0, TOP_K_CITATIONS),
    ...merged.slice(TOP_K_CITATIONS),
  ];
}

export function isPoliceCitizenScope(question: string) {
  const query = normalizeForSearch(question);
  return SCOPE_TERMS.some((term) => query.includes(term));
}

export async function retrieveRelevantPassages(question: string) {
  const candidates = await retrieveCandidatePassages(question, undefined, TOP_K_CITATIONS);
  return candidates.slice(0, TOP_K_CITATIONS);
}

function buildEmbeddingText(question: string, intent?: LegalQueryIntent) {
  if (!intent) {
    return question;
  }

  return [
    intent.normalized_question,
    intent.legal_issue,
    ...intent.query_terms,
    ...intent.must_have_terms,
  ].join("\n");
}

export async function retrieveCandidatePassages(
  question: string,
  intent?: LegalQueryIntent,
  limit = TOP_K_CITATIONS * 6,
) {
  const localCandidates = await retrieveLocalCandidatePassages(question, limit);

  try {
    if (intent) {
      const queryEmbedding = await embedTextWithOpenRouter(buildEmbeddingText(question, intent));
      const supabaseCandidates = await maybeSearchLegalPassagesWithSupabase(
        question,
        intent,
        queryEmbedding,
        limit,
      );

      if (supabaseCandidates?.length) {
        return mergeCandidateCitations(localCandidates, supabaseCandidates, limit);
      }
    }
  } catch {
    return localCandidates;
  }

  return localCandidates;
}

async function retrieveLocalCandidatePassages(question: string, limit: number) {
  const corpus = await loadCorpus();
  const analysis = analyzeQuestion(question);

  const ranked = corpus.passages
    .map((passage) => ({
      passage,
      score: scorePassage(analysis, passage),
    }))
    .filter(({ score }) => score >= MIN_RETRIEVAL_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(limit, TOP_K_CITATIONS * 6))
    .map(({ passage, score }) => ({
      passage,
      score: rerankPassage(analysis, passage, score),
    }))
    .sort((left, right) => right.score - left.score);

  const diversified = injectRightsAnchor(analysis, ranked)
    .slice(0, limit);

  return diversified.map(({ passage, score }) =>
    toCitation(passage, score, analysis),
  );
}

function excerptAroundMatch(text: string, rawHaystack: string, match: string) {
  const index = rawHaystack.indexOf(match);
  if (index === -1) {
    return null;
  }

  const start = Math.max(0, index - 90);
  const end = Math.min(text.length, index + match.length + 190);
  const snippet = text.slice(start, end).trim();

  return excerptText(snippet, 280);
}

function selectRelevantExcerpt(
  passage: LegalPassage,
  analysis: QuestionAnalysis,
) {
  const rawHaystack = stripAccents(passage.text).toLowerCase();

  for (const match of analysis.anchorTerms) {
    const snippet = excerptAroundMatch(passage.text, rawHaystack, match);
    if (snippet) {
      return snippet;
    }
  }

  const sentences = passage.text
    .split(/(?=\d+\.)|(?<=[.!?;])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const rankedSentence = sentences
    .map((sentence) => {
      const normalizedSentence = normalizeForSearch(sentence);
      const matchingTokens = analysis.expandedTokens.filter((token) =>
        normalizedSentence.includes(token),
      );
      const overlap = matchingTokens.length;
      const weightedOverlap = matchingTokens.reduce((total, token) => total + token.length, 0);

      return {
        sentence,
        overlap,
        weightedOverlap,
      };
    })
    .sort(
      (left, right) =>
        right.weightedOverlap - left.weightedOverlap || right.overlap - left.overlap,
    )[0];

  if (rankedSentence.overlap > 0) {
    return excerptText(rankedSentence.sentence, 280);
  }

  return excerptText(passage.text, 280);
}

function toCitation(
  passage: LegalPassage,
  score: number,
  analysis: QuestionAnalysis,
): ChatCitation {
  return {
    passage_id: passage.id,
    document_title: passage.title,
    article_number: passage.article_number,
    source_url: passage.source_url,
    version_date: passage.version_date,
    excerpt: selectRelevantExcerpt(passage, analysis),
    source_rank: passage.source_rank,
    theme: passage.theme,
    score,
  };
}
