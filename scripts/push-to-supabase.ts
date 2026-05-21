import { config as loadDotenv } from "dotenv";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { CORPUS_DIR } from "../src/lib/legal/config";
import {
  legalDocumentArraySchema,
  legalPassageArraySchema,
  sourceFileArraySchema,
} from "../src/lib/legal/types";
import { stripAccents } from "../src/lib/legal/utils";

loadDotenv({ path: ".env.local", override: false });
loadDotenv({ path: ".env", override: false });

const FRENCH_MONTHS: Record<string, string> = {
  janvier: "01",
  fevrier: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  aout: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  decembre: "12",
};

const OPENROUTER_EMBEDDINGS_ENDPOINT = "https://openrouter.ai/api/v1/embeddings";
const EMBEDDING_BATCH_SIZE = 32;

function getEmbeddingInput(passage: {
  title: string;
  article_number: string;
  theme: string;
  text: string;
}) {
  return [
    passage.title,
    passage.article_number,
    `Theme: ${passage.theme}`,
    passage.text,
  ].join("\n");
}

function toVectorLiteral(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}

async function embedBatch(inputs: string[]) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_EMBEDDING_MODEL;

  if (!apiKey || !model || process.env.SKIP_PASSAGE_EMBEDDINGS === "1") {
    return null;
  }

  const response = await fetch(OPENROUTER_EMBEDDINGS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_APP_URL ?? "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME ?? "Appli Loi CI",
    },
    body: JSON.stringify({
      model,
      input: inputs,
      dimensions: 1536,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter embeddings error: ${response.status}`);
  }

  const payload = await response.json();
  const rows = payload?.data;
  if (!Array.isArray(rows)) {
    throw new Error("Reponse embeddings invalide.");
  }

  return rows.map((row) => {
    const embedding = row?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error("Embedding manquant dans la reponse OpenRouter.");
    }

    return embedding.map(Number);
  });
}

function normalizeDate(value: string | null) {
  if (!value) return null;

  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || /inconnue/i.test(cleaned)) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  const normalized = stripAccents(cleaned).toLowerCase();
  const match = normalized.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (!match) {
    return null;
  }

  const [, day, monthLabel, year] = match;
  const month = FRENCH_MONTHS[monthLabel];
  if (!month) {
    return null;
  }

  return `${year}-${month}-${day.padStart(2, "0")}`;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const writeKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !writeKey) {
    throw new Error(
      "SUPABASE_URL et une cle d'ecriture Supabase sont requis.",
    );
  }

  const supabase = createClient(supabaseUrl, writeKey, {
    auth: { persistSession: false },
  });

  const [documentsRaw, passagesRaw, sourceFilesRaw] = await Promise.all([
    readFile(path.join(CORPUS_DIR, "legal-documents.json"), "utf8"),
    readFile(path.join(CORPUS_DIR, "legal-passages.json"), "utf8"),
    readFile(path.join(CORPUS_DIR, "source-files.json"), "utf8"),
  ]);

  const documents = legalDocumentArraySchema
    .parse(JSON.parse(documentsRaw))
    .map((document) => ({
      ...document,
      commencement_date: normalizeDate(document.commencement_date),
    }));

  const sourceFiles = sourceFileArraySchema.parse(JSON.parse(sourceFilesRaw));

  const passageIdCounts = new Map<string, number>();
  const passages = legalPassageArraySchema
    .parse(JSON.parse(passagesRaw))
    .map((passage) => {
      const occurrence = (passageIdCounts.get(passage.id) ?? 0) + 1;
      passageIdCounts.set(passage.id, occurrence);

      return occurrence === 1
        ? passage
        : {
            ...passage,
            id: `${passage.id}-dup-${occurrence}`,
          };
    });

  const passagesWithEmbeddings: Array<(typeof passages)[number] & { embedding?: string }> = [];
  for (let index = 0; index < passages.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = passages.slice(index, index + EMBEDDING_BATCH_SIZE);
    const embeddings = await embedBatch(batch.map(getEmbeddingInput));

    passagesWithEmbeddings.push(
      ...batch.map((passage, passageIndex) =>
        embeddings
          ? {
              ...passage,
              embedding: toVectorLiteral(embeddings[passageIndex]),
            }
          : passage,
      ),
    );
  }

  const { error: docError } = await supabase
    .from("legal_documents")
    .upsert(documents, { onConflict: "id" });
  if (docError) throw docError;

  const { error: sourceError } = await supabase
    .from("source_files")
    .upsert(sourceFiles, { onConflict: "id" });
  if (sourceError) throw sourceError;

  for (let index = 0; index < passagesWithEmbeddings.length; index += 250) {
    const batch = passagesWithEmbeddings.slice(index, index + 250);
    const { error } = await supabase
      .from("legal_passages")
      .upsert(batch, { onConflict: "id" });

    if (error) throw error;
  }

  console.log(
    `Supabase alimente: ${documents.length} documents, ${passages.length} passages, ${sourceFiles.length} fichiers.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
