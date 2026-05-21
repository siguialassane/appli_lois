import "dotenv/config";

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import * as cheerio from "cheerio";

import { sourceRegistry } from "./source-registry";
import {
  CORPUS_DIR,
  EXTRACTED_DIR,
  RAW_PDF_DIR,
  USER_AGENT,
} from "../src/lib/legal/config";
import {
  classifyTheme,
  excerptText,
  normalizeWhitespace,
  safeFileName,
  slugify,
  stripAccents,
} from "../src/lib/legal/utils";
import {
  legalDocumentSchema,
  legalPassageSchema,
  sourceFileSchema,
  type LegalDocument,
  type LegalPassage,
  type SourceFileRecord,
} from "../src/lib/legal/types";

const execFileAsync = promisify(execFile);
const PYTHON_CANDIDATES = [
  process.env.CORPUS_PYTHON,
  "C:\\Users\\Dell\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe",
  "python",
].filter(Boolean) as string[];

type ArticleSnapshot = {
  articleNumber: string;
  hierarchy: string[];
  text: string;
};

async function ensureDirectories() {
  await Promise.all([
    mkdir(RAW_PDF_DIR, { recursive: true }),
    mkdir(EXTRACTED_DIR, { recursive: true }),
    mkdir(CORPUS_DIR, { recursive: true }),
  ]);
}

function checksum(input: string | Buffer) {
  return createHash("sha256").update(input).digest("hex");
}

function toVersionDate(url: string) {
  const match = url.match(/@(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? new Date().toISOString().slice(0, 10);
}

function extractMetaVersion($: cheerio.CheerioAPI) {
  return $("meta[property='article:published_time']").attr("content")?.trim() || null;
}

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

function normalizeFrenchDate(raw: string) {
  const cleaned = normalizeWhitespace(raw);
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

function extractCommencement($: cheerio.CheerioAPI) {
  const raw = $(".commencement-date").first().text().trim();
  const withoutPrefix = raw.replace(/^Commenc.*?le\s*/i, "");
  const normalized = normalizeFrenchDate(withoutPrefix);
  if (normalized) {
    return normalized;
  }
  return normalizeWhitespace(raw.replace(/^Commencé le\s*/i, "")) || null;
}

function buildHierarchy($article: cheerio.Cheerio<cheerio.Element>) {
  const hierarchy = $article
    .parentsUntil(".akn-act")
    .toArray()
    .reverse()
    .flatMap((node) => {
      const heading = cheerio.load(node)("> h2").first().text().trim();
      return heading ? [normalizeWhitespace(heading)] : [];
    });

  return hierarchy;
}

function extractArticles(html: string): ArticleSnapshot[] {
  const $ = cheerio.load(html);

  return $("section.akn-article")
    .toArray()
    .map((article) => {
      const $article = $(article);
      const articleNumber = normalizeWhitespace($article.children("h2").first().text());

      const cloned = $article.clone();
      cloned.children("h2").first().remove();
      const text = normalizeWhitespace(cloned.text());

      return {
        articleNumber,
        hierarchy: buildHierarchy($article),
        text,
      };
    })
    .filter((article) => article.articleNumber && article.text);
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Impossible de charger ${url}: ${response.status}`);
  }

  return {
    finalUrl: response.url,
    body: await response.text(),
  };
}

async function fetchBinary(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/pdf",
    },
  });

  if (!response.ok) {
    throw new Error(`Impossible de charger ${url}: ${response.status}`);
  }

  return {
    finalUrl: response.url,
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
  };
}

async function fetchPdfWithFallback(registryPdfUrl: string, finalHtmlUrl: string) {
  try {
    return await fetchBinary(registryPdfUrl);
  } catch {
    const fallbackUrl = `${finalHtmlUrl.replace(/\/$/, "")}/source.pdf`;
    return fetchBinary(fallbackUrl);
  }
}

async function extractPdfText(pdfPath: string) {
  const pythonScript = [
    "from pypdf import PdfReader",
    "import sys",
    "reader = PdfReader(sys.argv[1])",
    "chunks = []",
    "for page in reader.pages:",
    "    chunks.append(page.extract_text() or '')",
    "sys.stdout.buffer.write('\\n'.join(chunks).encode('utf-8', errors='ignore'))",
  ].join("\n");

  for (const candidate of PYTHON_CANDIDATES) {
    try {
      const { stdout } = await execFileAsync(
        candidate,
        ["-c", pythonScript, pdfPath],
        {
          env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
          },
          maxBuffer: 1024 * 1024 * 20,
        },
      );

      return normalizeWhitespace(stdout);
    } catch {
      continue;
    }
  }

  throw new Error("Aucun interpreteur Python compatible n'a pu extraire le PDF.");
}

async function main() {
  await ensureDirectories();

  const documents: LegalDocument[] = [];
  const passages: LegalPassage[] = [];
  const sourceFiles: SourceFileRecord[] = [];
  const passageIdCounts = new Map<string, number>();

  for (const source of sourceRegistry) {
    const html = await fetchText(source.htmlUrl);
    const pdfFile = await fetchPdfWithFallback(source.pdfUrl, html.finalUrl);

    const versionDate = toVersionDate(html.finalUrl);
    const htmlPath = path.join(EXTRACTED_DIR, `${safeFileName(source.id)}.html`);
    const pdfPath = path.join(RAW_PDF_DIR, `${safeFileName(source.id)}.pdf`);
    const pdfTextPath = path.join(EXTRACTED_DIR, `${safeFileName(source.id)}.txt`);

    await writeFile(htmlPath, html.body, "utf8");
    await writeFile(pdfPath, pdfFile.body);

    const pdfText = await extractPdfText(pdfPath);
    await writeFile(pdfTextPath, pdfText, "utf8");

    const $ = cheerio.load(html.body);
    const metaVersion = extractMetaVersion($);
    const pageTitle =
      normalizeWhitespace($("h1").first().text()) || normalizeWhitespace(source.title);
    const commencementDate = extractCommencement($);
    const extractedArticles = extractArticles(html.body);

    const document = legalDocumentSchema.parse({
      id: source.id,
      source_url: html.finalUrl,
      source_host: new URL(html.finalUrl).host,
      source_rank: source.sourceRank,
      title: pageTitle,
      law_number: source.lawNumber,
      document_type: source.documentType,
      version_date: metaVersion || versionDate,
      publication_date: source.publicationDate,
      commencement_date: commencementDate,
      language: "fr",
      focus_tags: source.focusTags,
      passage_count: extractedArticles.length,
      extracted_at: new Date().toISOString(),
    });

    documents.push(document);

    for (const article of extractedArticles) {
      const combinedContext = [
        pageTitle,
        article.articleNumber,
        article.hierarchy.join(" "),
        article.text,
      ].join(" ");

      const basePassageId = slugify(`${source.id}-${article.articleNumber}`);
      const nextOccurrence = (passageIdCounts.get(basePassageId) ?? 0) + 1;
      passageIdCounts.set(basePassageId, nextOccurrence);
      const passageId =
        nextOccurrence === 1 ? basePassageId : `${basePassageId}-dup-${nextOccurrence}`;
      passages.push(
        legalPassageSchema.parse({
          id: passageId,
          document_id: source.id,
          source_url: html.finalUrl,
          source_host: new URL(html.finalUrl).host,
          source_rank: source.sourceRank,
          title: pageTitle,
          law_number: source.lawNumber,
          document_type: source.documentType,
          version_date: metaVersion || versionDate,
          publication_date: source.publicationDate,
          article_number: article.articleNumber,
          theme: classifyTheme(combinedContext),
          hierarchy: article.hierarchy,
          focus_tags: source.focusTags,
          text: article.text,
          excerpt: excerptText(article.text, 320),
          citability_status: source.sourceRank <= 2 ? "primary" : "secondary",
          checksum: checksum(`${source.id}:${article.articleNumber}:${article.text}`),
        }),
      );
    }

    sourceFiles.push(
      sourceFileSchema.parse({
        id: `${source.id}-html`,
        document_id: source.id,
        file_role: "html",
        file_path: htmlPath,
        source_url: html.finalUrl,
        mime_type: "text/html",
        checksum: checksum(html.body),
        size_bytes: Buffer.byteLength(html.body),
      }),
      sourceFileSchema.parse({
        id: `${source.id}-pdf`,
        document_id: source.id,
        file_role: "pdf",
        file_path: pdfPath,
        source_url: pdfFile.finalUrl,
        mime_type: pdfFile.contentType,
        checksum: checksum(pdfFile.body),
        size_bytes: pdfFile.body.byteLength,
      }),
      sourceFileSchema.parse({
        id: `${source.id}-txt`,
        document_id: source.id,
        file_role: "extracted_text",
        file_path: pdfTextPath,
        source_url: pdfFile.finalUrl,
        mime_type: "text/plain",
        checksum: checksum(pdfText),
        size_bytes: Buffer.byteLength(pdfText),
      }),
    );
  }

  await writeFile(
    path.join(CORPUS_DIR, "legal-documents.json"),
    JSON.stringify(documents, null, 2),
    "utf8",
  );

  await writeFile(
    path.join(CORPUS_DIR, "legal-passages.json"),
    JSON.stringify(passages, null, 2),
    "utf8",
  );

  await writeFile(
    path.join(CORPUS_DIR, "legal-passages.jsonl"),
    `${passages.map((passage) => JSON.stringify(passage)).join("\n")}\n`,
    "utf8",
  );

  await writeFile(
    path.join(CORPUS_DIR, "source-files.json"),
    JSON.stringify(sourceFiles, null, 2),
    "utf8",
  );

  const duplicateChecksums = new Map<string, number>();
  for (const passage of passages) {
    duplicateChecksums.set(
      passage.checksum,
      (duplicateChecksums.get(passage.checksum) ?? 0) + 1,
    );
  }

  const duplicateCount = [...duplicateChecksums.values()].filter((value) => value > 1).length;

  await writeFile(
    path.join(CORPUS_DIR, "summary.md"),
    [
      "# Corpus juridique v1",
      "",
      `- Documents: ${documents.length}`,
      `- Passages: ${passages.length}`,
      `- Fichiers source: ${sourceFiles.length}`,
      `- Doublons de checksum detectes: ${duplicateCount}`,
      "",
      "## Documents",
      ...documents.map(
        (document) =>
          `- ${document.title} (${document.law_number}) - ${document.passage_count} articles - source ${document.source_host}`,
      ),
    ].join("\n"),
    "utf8",
  );

  console.log(
    `Corpus genere: ${documents.length} documents, ${passages.length} passages, ${sourceFiles.length} fichiers source.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
