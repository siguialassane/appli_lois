import { createClient } from "@supabase/supabase-js";

import { type ChatCitation, type ChatResponse, type LegalQueryIntent } from "./types";

export function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

type HybridSearchRow = {
  passage_id: string;
  document_id: string;
  source_url: string;
  source_rank: number;
  document_title: string;
  article_number: string;
  version_date: string;
  excerpt: string;
  theme: string;
  score: number;
};

function cleanFilter(values: string[]) {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}

export async function maybeSearchLegalPassagesWithSupabase(
  question: string,
  intent: LegalQueryIntent,
  queryEmbedding: number[] | null,
  matchCount = 30,
): Promise<ChatCitation[] | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const queryText = [
    intent.normalized_question || question,
    intent.legal_issue,
    ...intent.query_terms,
    ...intent.must_have_terms,
  ].join(" ");

  const { data, error } = await supabase.rpc("hybrid_search_legal_passages", {
    query_text: queryText,
    query_embedding: queryEmbedding,
    match_count: matchCount,
    filter_themes: cleanFilter(intent.themes),
    filter_document_types: cleanFilter(intent.document_types),
  });

  if (error || !Array.isArray(data)) {
    return null;
  }

  return (data as HybridSearchRow[]).map((row) => ({
    passage_id: row.passage_id,
    document_title: row.document_title,
    article_number: row.article_number,
    source_url: row.source_url,
    version_date: row.version_date,
    excerpt: row.excerpt,
    source_rank: row.source_rank,
    theme: row.theme,
    score: Number(row.score),
  }));
}

export async function maybePersistChat(
  sessionId: string,
  question: string,
  response: ChatResponse,
) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  await supabase.from("chat_sessions").upsert({
    id: sessionId,
    updated_at: new Date().toISOString(),
  });

  await supabase.from("chat_messages").insert([
    {
      id: crypto.randomUUID(),
      session_id: sessionId,
      role: "user",
      content: question,
      metadata: {},
    },
    {
      id: crypto.randomUUID(),
      session_id: sessionId,
      role: "assistant",
      content: response.answer,
      metadata: {
        citations: response.citations,
        confidence: response.confidence,
        needs_human_review: response.needs_human_review,
      },
    },
  ]);

  await supabase.from("retrieval_logs").insert({
    id: crypto.randomUUID(),
    session_id: sessionId,
    question,
    passage_ids: response.citations.map((citation) => citation.passage_id),
    citations: response.citations,
    confidence: response.confidence,
    needs_human_review: response.needs_human_review,
  });
}
