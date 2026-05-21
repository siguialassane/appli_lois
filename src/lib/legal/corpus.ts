import { readFile } from "node:fs/promises";
import path from "node:path";

import { CORPUS_DIR } from "./config";
import {
  legalDocumentArraySchema,
  legalPassageArraySchema,
  type LegalDocument,
  type LegalPassage,
} from "./types";

type CorpusBundle = {
  documents: LegalDocument[];
  passages: LegalPassage[];
};

let corpusPromise: Promise<CorpusBundle> | null = null;

async function readJson<T>(fileName: string) {
  const raw = await readFile(path.join(CORPUS_DIR, fileName), "utf8");
  return JSON.parse(raw) as T;
}

export async function loadCorpus(): Promise<CorpusBundle> {
  if (!corpusPromise) {
    corpusPromise = Promise.all([
      readJson<LegalDocument[]>("legal-documents.json"),
      readJson<LegalPassage[]>("legal-passages.json"),
    ]).then(([documents, passages]) => ({
      documents: legalDocumentArraySchema.parse(documents),
      passages: legalPassageArraySchema.parse(passages),
    }));
  }

  return corpusPromise;
}

export async function getCorpusStats() {
  const corpus = await loadCorpus();
  return {
    documentCount: corpus.documents.length,
    passageCount: corpus.passages.length,
    latestVersionDate: corpus.documents.reduce((latest, document) => {
      return document.version_date > latest ? document.version_date : latest;
    }, ""),
  };
}
