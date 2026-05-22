import legalDocumentsJson from "../../../data/corpus/legal-documents.json";
import legalPassagesJson from "../../../data/corpus/legal-passages.json";
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

export async function loadCorpus(): Promise<CorpusBundle> {
  if (!corpusPromise) {
    corpusPromise = Promise.resolve({
      documents: legalDocumentArraySchema.parse(legalDocumentsJson),
      passages: legalPassageArraySchema.parse(legalPassagesJson),
    });
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
