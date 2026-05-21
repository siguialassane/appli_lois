import path from "node:path";

export const PROJECT_ROOT = process.cwd();
export const DATA_DIR = path.join(PROJECT_ROOT, "data");
export const RAW_PDF_DIR = path.join(DATA_DIR, "raw_pdfs");
export const EXTRACTED_DIR = path.join(DATA_DIR, "extracted");
export const CORPUS_DIR = path.join(DATA_DIR, "corpus");
export const RUNTIME_DIR = path.join(DATA_DIR, "runtime");
export const CHAT_SESSIONS_DIR = path.join(RUNTIME_DIR, "chat_sessions");

export const USER_AGENT =
  "AppliLoiCI/0.1 (+https://localhost; corpus-juridique-cote-divoire)";

export const PRIVATE_BETA_DEFAULT_CODE = "beta-civ-2026";
export const STATIC_WARNING = "Ceci n'est pas un avis d'avocat.";

export const TOP_K_CITATIONS = 5;
export const MIN_RETRIEVAL_SCORE = 3;
