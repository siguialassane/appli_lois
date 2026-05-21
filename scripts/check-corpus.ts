import { readFile } from "node:fs/promises";
import path from "node:path";

import { CORPUS_DIR } from "../src/lib/legal/config";
import {
  legalDocumentArraySchema,
  legalPassageArraySchema,
  sourceFileArraySchema,
} from "../src/lib/legal/types";

async function main() {
  const [documentsRaw, passagesRaw, sourcesRaw] = await Promise.all([
    readFile(path.join(CORPUS_DIR, "legal-documents.json"), "utf8"),
    readFile(path.join(CORPUS_DIR, "legal-passages.json"), "utf8"),
    readFile(path.join(CORPUS_DIR, "source-files.json"), "utf8"),
  ]);

  const documents = legalDocumentArraySchema.parse(JSON.parse(documentsRaw));
  const passages = legalPassageArraySchema.parse(JSON.parse(passagesRaw));
  const sourceFiles = sourceFileArraySchema.parse(JSON.parse(sourcesRaw));

  const missingSource = passages.filter((passage) => !passage.source_url);
  const missingVersion = passages.filter((passage) => !passage.version_date);
  const duplicates = new Map<string, number>();
  for (const passage of passages) {
    duplicates.set(passage.checksum, (duplicates.get(passage.checksum) ?? 0) + 1);
  }

  const duplicateCount = [...duplicates.values()].filter((value) => value > 1).length;

  if (missingSource.length || missingVersion.length) {
    throw new Error(
      `Corpus invalide: ${missingSource.length} passages sans source et ${missingVersion.length} passages sans version.`,
    );
  }

  console.log(
    JSON.stringify(
      {
        documents: documents.length,
        passages: passages.length,
        sourceFiles: sourceFiles.length,
        duplicateChecksums: duplicateCount,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
