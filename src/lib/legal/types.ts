import { z } from "zod";

export const documentTypeSchema = z.enum([
  "constitution",
  "code",
  "law",
  "decree",
  "ordinance",
  "other",
]);

export const sourceRegistryEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  htmlUrl: z.string().url(),
  pdfUrl: z.string().url(),
  sourceRank: z.number().int().min(1).max(3),
  lawNumber: z.string().min(1),
  documentType: documentTypeSchema,
  publicationDate: z.string().nullable(),
  focusTags: z.array(z.string()).min(1),
});

export const sourceRegistrySchema = z.array(sourceRegistryEntrySchema);

export const legalDocumentSchema = z.object({
  id: z.string().min(1),
  source_url: z.string().url(),
  source_host: z.string().min(1),
  source_rank: z.number().int().min(1).max(3),
  title: z.string().min(1),
  law_number: z.string().min(1),
  document_type: documentTypeSchema,
  version_date: z.string().min(1),
  publication_date: z.string().nullable(),
  commencement_date: z.string().nullable(),
  language: z.literal("fr"),
  focus_tags: z.array(z.string()),
  passage_count: z.number().int().nonnegative(),
  extracted_at: z.string().min(1),
});

export const legalPassageSchema = z.object({
  id: z.string().min(1),
  document_id: z.string().min(1),
  source_url: z.string().url(),
  source_host: z.string().min(1),
  source_rank: z.number().int().min(1).max(3),
  title: z.string().min(1),
  law_number: z.string().min(1),
  document_type: documentTypeSchema,
  version_date: z.string().min(1),
  publication_date: z.string().nullable(),
  article_number: z.string().min(1),
  theme: z.string().min(1),
  hierarchy: z.array(z.string()),
  focus_tags: z.array(z.string()),
  text: z.string().min(1),
  excerpt: z.string().min(1),
  citability_status: z.enum(["primary", "secondary", "unknown"]),
  checksum: z.string().min(1),
});

export const sourceFileSchema = z.object({
  id: z.string().min(1),
  document_id: z.string().min(1),
  file_role: z.enum(["html", "pdf", "extracted_text"]),
  file_path: z.string().min(1),
  source_url: z.string().url(),
  mime_type: z.string().min(1),
  checksum: z.string().min(1),
  size_bytes: z.number().nonnegative(),
});

export const chatCitationSchema = z.object({
  passage_id: z.string().min(1),
  document_title: z.string().min(1),
  article_number: z.string().min(1),
  source_url: z.string().url(),
  version_date: z.string().min(1),
  excerpt: z.string().min(1),
  source_rank: z.number().int().min(1).max(3),
  theme: z.string().min(1),
  score: z.number(),
});

export const legalQueryIntentSchema = z.object({
  normalized_question: z.string().min(1),
  legal_issue: z.string().min(1),
  query_terms: z.array(z.string()).default([]),
  must_have_terms: z.array(z.string()).default([]),
  excluded_topics: z.array(z.string()).default([]),
  themes: z.array(z.string()).default([]),
  document_types: z.array(documentTypeSchema).default([]),
  needs_clarification: z.boolean().default(false),
  clarification_question: z.string().nullable().default(null),
});

export const evidenceAssessmentSchema = z.object({
  selected_passage_ids: z.array(z.string()).default([]),
  sufficient: z.boolean(),
  confidence: z.enum(["low", "medium", "high"]),
  reason: z.string().min(1),
});

export const chatResponseSchema = z.object({
  answer: z.string().min(1),
  citations: z.array(chatCitationSchema),
  confidence: z.enum(["low", "medium", "high"]),
  needs_human_review: z.boolean(),
  warning: z.string().min(1),
  mode: z.enum(["fallback", "openrouter"]),
});

export const localChatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  createdAt: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const localChatSessionSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  messages: z.array(localChatMessageSchema),
});

export const askRequestSchema = z.object({
  question: z.string().min(6),
  sessionId: z.string().min(1),
  accessCode: z.string().optional(),
});

export const legalDocumentArraySchema = z.array(legalDocumentSchema);
export const legalPassageArraySchema = z.array(legalPassageSchema);
export const sourceFileArraySchema = z.array(sourceFileSchema);

export type SourceRegistryEntry = z.infer<typeof sourceRegistryEntrySchema>;
export type LegalDocument = z.infer<typeof legalDocumentSchema>;
export type LegalPassage = z.infer<typeof legalPassageSchema>;
export type SourceFileRecord = z.infer<typeof sourceFileSchema>;
export type ChatCitation = z.infer<typeof chatCitationSchema>;
export type LegalQueryIntent = z.infer<typeof legalQueryIntentSchema>;
export type EvidenceAssessment = z.infer<typeof evidenceAssessmentSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type LocalChatMessage = z.infer<typeof localChatMessageSchema>;
export type LocalChatSession = z.infer<typeof localChatSessionSchema>;
export type AskRequest = z.infer<typeof askRequestSchema>;
