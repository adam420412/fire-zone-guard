-- =============================================================================
-- Library RAG schema — pgvector + chunked document storage + match RPC.
--
-- Two-table design:
--   * library_documents      — one row per logical document (act, norm, template)
--   * library_doc_chunks     — content split into ≤1000-char chunks with one
--                              embedding per chunk (text-embedding-3-small,
--                              1536 dims).
--
-- The match_library_documents() RPC returns the top-k chunks for a query
-- embedding, joined with their parent document metadata so the caller can
-- render citations without a second round-trip.
-- =============================================================================

-- 1. pgvector extension (Supabase enables it on demand) ---------------------
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2. library_documents ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.library_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('law','guidelines','templates','internal')),
  description   TEXT,
  source        TEXT,           -- e.g. 'Dz.U. 2010 nr 109 poz. 719'
  url           TEXT,
  badge         TEXT,
  uploaded_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_documents_category
  ON public.library_documents(category);

-- 3. library_doc_chunks -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.library_doc_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES public.library_documents(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  content       TEXT NOT NULL,
  embedding     extensions.vector(1536),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, chunk_index)
);

-- IVFFlat index for cosine similarity. Lists=100 is a safe default for
-- low-thousands of rows; we'll bump it once the corpus grows.
CREATE INDEX IF NOT EXISTS idx_library_doc_chunks_embedding
  ON public.library_doc_chunks
  USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_library_doc_chunks_document_id
  ON public.library_doc_chunks(document_id);

-- 4. match_library_documents RPC -------------------------------------------
--    Returns top-k chunks ranked by cosine similarity, joined with their
--    parent document metadata so the UI can render citations directly.
CREATE OR REPLACE FUNCTION public.match_library_documents(
  query_embedding extensions.vector(1536),
  match_threshold FLOAT  DEFAULT 0.5,
  match_count     INTEGER DEFAULT 8
)
RETURNS TABLE (
  chunk_id        UUID,
  document_id     UUID,
  chunk_index     INTEGER,
  content         TEXT,
  similarity      FLOAT,
  doc_title       TEXT,
  doc_category    TEXT,
  doc_source      TEXT,
  doc_url         TEXT,
  doc_badge       TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.document_id,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) AS similarity,
    d.title,
    d.category,
    d.source,
    d.url,
    d.badge
  FROM public.library_doc_chunks c
  JOIN public.library_documents d ON d.id = c.document_id
  WHERE c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- 5. RLS --------------------------------------------------------------------
ALTER TABLE public.library_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_doc_chunks ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user.
DROP POLICY IF EXISTS p_lib_docs_read    ON public.library_documents;
CREATE POLICY p_lib_docs_read    ON public.library_documents
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS p_lib_chunks_read  ON public.library_doc_chunks;
CREATE POLICY p_lib_chunks_read  ON public.library_doc_chunks
  FOR SELECT TO authenticated USING (true);

-- Write: super_admin and admin (so we don't need the service role from the UI).
DROP POLICY IF EXISTS p_lib_docs_write   ON public.library_documents;
CREATE POLICY p_lib_docs_write   ON public.library_documents
  FOR ALL TO authenticated
  USING     (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS p_lib_chunks_write ON public.library_doc_chunks;
CREATE POLICY p_lib_chunks_write ON public.library_doc_chunks
  FOR ALL TO authenticated
  USING     (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 6. Seed: bootstrap library_documents with the curated list the LibraryPage
--    currently hard-codes, so the table is non-empty on day one. Embeddings
--    are populated lazily by the `library-ingest` Edge Function.
INSERT INTO public.library_documents (id, title, category, description, source, badge)
VALUES
  ('11111111-0000-4000-8000-000000000001',
   'Rozporządzenie MSWiA w sprawie ochrony przeciwpożarowej budynków',
   'law',
   'Podstawowy akt wykonawczy dla ochrony PPOŻ — instalacje, gaśnice, hydranty, drogi ewakuacyjne.',
   'Dz.U. 2010 nr 109 poz. 719',
   'PODSTAWA'),
  ('11111111-0000-4000-8000-000000000002',
   'Ustawa o ochronie przeciwpożarowej',
   'law',
   'Ustawa z 24.08.1991 r. — obowiązki właścicieli i zarządców obiektów.',
   'Dz.U. 1991 nr 81 poz. 351',
   'USTAWA'),
  ('11111111-0000-4000-8000-000000000003',
   'Warunki techniczne — budynki i ich usytuowanie',
   'law',
   'Kategoryzacja ZL, PM, klasy odporności pożarowej, wymagania przeciwpożarowe budynków.',
   'Dz.U. 2002 nr 75 poz. 690',
   NULL),
  ('11111111-0000-4000-8000-000000000004',
   'PN-EN 54 / ISO 7240 — Systemy sygnalizacji pożarowej',
   'guidelines',
   'Norma dotycząca komponentów i instalacji SSP.',
   NULL,
   'NORMA'),
  ('11111111-0000-4000-8000-000000000005',
   'Wytyczne CNBOP-PIB',
   'guidelines',
   'Centrum Naukowo-Badawcze Ochrony Przeciwpożarowej — wytyczne stosowania urządzeń ppoż.',
   NULL,
   NULL)
ON CONFLICT (id) DO NOTHING;

UPDATE public.library_documents
   SET url = 'https://www.cnbop.pl/'
 WHERE id  = '11111111-0000-4000-8000-000000000005';

-- 7. Reload PostgREST schema cache so the RPC is visible to the client.
NOTIFY pgrst, 'reload schema';
