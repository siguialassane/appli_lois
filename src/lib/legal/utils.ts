import { createHash, randomUUID } from "node:crypto";

const THEME_RULES: Array<{ theme: string; terms: string[] }> = [
  {
    theme: "controle-identite",
    terms: ["identite", "carte nationale", "cn i", "controle d identite", "piece"],
  },
  {
    theme: "controle-routier",
    terms: ["vehicule", "permis", "route", "circulation", "voies routieres", "papiers"],
  },
  {
    theme: "perquisition",
    terms: ["perquisition", "domicile", "fouille", "visite domiciliaire"],
  },
  {
    theme: "interpellation",
    terms: ["interpellation", "arrestation", "retenue", "apprehender", "police judiciaire"],
  },
  {
    theme: "garde-a-vue",
    terms: ["garde a vue", "opj", "officier de police judiciaire", "detention", "audition"],
  },
  {
    theme: "droits-fondamentaux",
    terms: ["dignite", "liberte", "arbitrairement", "justice", "presume innocent"],
  },
];

const STOPWORDS = new Set([
  "a",
  "au",
  "aux",
  "avec",
  "ce",
  "ces",
  "dans",
  "de",
  "des",
  "du",
  "elle",
  "en",
  "est",
  "et",
  "il",
  "je",
  "la",
  "le",
  "les",
  "leur",
  "ma",
  "mes",
  "me",
  "mon",
  "ne",
  "nos",
  "nous",
  "ou",
  "par",
  "pas",
  "pendant",
  "pour",
  "qu",
  "que",
  "quel",
  "quelle",
  "quels",
  "quelles",
  "sa",
  "se",
  "ses",
  "son",
  "sont",
  "sur",
  "ta",
  "te",
  "tes",
  "toi",
  "ton",
  "tu",
  "un",
  "une",
  "vos",
  "votre",
  "vous",
  "cote",
  "ivoire",
]);

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function stripAccents(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function normalizeForSearch(value: string) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string) {
  return normalizeForSearch(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function excerptText(value: string, maxLength = 280) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trim()}...`;
}

export function slugify(value: string) {
  return normalizeForSearch(value).replace(/\s+/g, "-");
}

export function safeFileName(value: string) {
  return value.replace(/[^a-z0-9-_]/gi, "_").toLowerCase();
}

export function classifyTheme(text: string, fallbackTags: string[] = []) {
  const haystack = normalizeForSearch(`${text} ${fallbackTags.join(" ")}`);

  for (const rule of THEME_RULES) {
    if (rule.terms.some((term) => haystack.includes(normalizeForSearch(term)))) {
      return rule.theme;
    }
  }

  return "general";
}

export function stableChecksum(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

export function confidenceFromScore(score: number) {
  if (score >= 18) return "high";
  if (score >= 8) return "medium";
  return "low";
}
