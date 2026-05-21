create extension if not exists vector;

create table if not exists legal_documents (
  id text primary key,
  source_url text not null,
  source_host text not null,
  source_rank integer not null check (source_rank between 1 and 3),
  title text not null,
  law_number text not null,
  document_type text not null,
  version_date date not null,
  publication_date date,
  commencement_date date,
  language text not null default 'fr',
  focus_tags jsonb not null default '[]'::jsonb,
  passage_count integer not null default 0,
  extracted_at timestamptz not null default now()
);

create table if not exists legal_passages (
  id text primary key,
  document_id text not null references legal_documents(id) on delete cascade,
  source_url text not null,
  source_host text not null,
  source_rank integer not null check (source_rank between 1 and 3),
  title text not null,
  law_number text not null,
  document_type text not null,
  version_date date not null,
  publication_date date,
  article_number text not null,
  theme text not null,
  hierarchy jsonb not null default '[]'::jsonb,
  focus_tags jsonb not null default '[]'::jsonb,
  text text not null,
  excerpt text not null,
  citability_status text not null,
  checksum text not null,
  embedding vector(1536)
);

create index if not exists legal_passages_document_idx on legal_passages(document_id);
create index if not exists legal_passages_theme_idx on legal_passages(theme);
create index if not exists legal_passages_source_rank_idx on legal_passages(source_rank);
create index if not exists legal_passages_embedding_idx
  on legal_passages
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);

create index if not exists legal_passages_text_search_idx
  on legal_passages
  using gin (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(article_number, '') || ' ' ||
      coalesce(theme, '') || ' ' ||
      coalesce(text, '')
    )
  );

create or replace function hybrid_search_legal_passages(
  query_text text,
  query_embedding vector(1536) default null,
  match_count integer default 30,
  filter_themes text[] default null,
  filter_document_types text[] default null
)
returns table (
  passage_id text,
  document_id text,
  source_url text,
  source_rank integer,
  document_title text,
  article_number text,
  version_date date,
  excerpt text,
  theme text,
  lexical_score real,
  semantic_score real,
  score real
)
language sql
stable
as $$
  with prepared_query as (
    select
      websearch_to_tsquery('simple', coalesce(nullif(query_text, ''), 'loi')) as ts_query
  ),
  scored as (
    select
      p.id as passage_id,
      p.document_id,
      p.source_url,
      p.source_rank,
      p.title as document_title,
      p.article_number,
      p.version_date,
      p.excerpt,
      p.theme,
      ts_rank_cd(
        to_tsvector(
          'simple',
          coalesce(p.title, '') || ' ' ||
          coalesce(p.article_number, '') || ' ' ||
          coalesce(p.theme, '') || ' ' ||
          coalesce(p.text, '')
        ),
        prepared_query.ts_query
      )::real as lexical_score,
      case
        when query_embedding is null or p.embedding is null then 0::real
        else (1 - (p.embedding <=> query_embedding))::real
      end as semantic_score
    from legal_passages p
    cross join prepared_query
    where
      (filter_themes is null or p.theme = any(filter_themes))
      and (filter_document_types is null or p.document_type = any(filter_document_types))
  )
  select
    scored.passage_id,
    scored.document_id,
    scored.source_url,
    scored.source_rank,
    scored.document_title,
    scored.article_number,
    scored.version_date,
    scored.excerpt,
    scored.theme,
    scored.lexical_score,
    scored.semantic_score,
    (
      scored.lexical_score * 0.55
      + scored.semantic_score * 0.4
      + greatest(0, 4 - scored.source_rank) * 0.05
    )::real as score
  from scored
  where scored.lexical_score > 0 or scored.semantic_score > 0
  order by score desc
  limit greatest(1, least(match_count, 50));
$$;

create table if not exists source_files (
  id text primary key,
  document_id text not null references legal_documents(id) on delete cascade,
  file_role text not null,
  file_path text not null,
  source_url text not null,
  mime_type text not null,
  checksum text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);

create table if not exists chat_sessions (
  id text primary key,
  channel text not null default 'private-beta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id text primary key,
  session_id text not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_idx on chat_messages(session_id, created_at);

create table if not exists retrieval_logs (
  id text primary key,
  session_id text not null references chat_sessions(id) on delete cascade,
  question text not null,
  passage_ids jsonb not null default '[]'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  confidence text not null,
  needs_human_review boolean not null default false,
  created_at timestamptz not null default now()
);
