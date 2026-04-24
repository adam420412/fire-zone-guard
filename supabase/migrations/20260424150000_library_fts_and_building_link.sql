-- =============================================================================
-- Library: per-building filter + Polish full-text search.
--
-- Adds two capabilities to library_documents:
--   1. Optional building_id FK  — lets a doc be scoped to a specific obiekt
--      (e.g. an IBP for budynek X). NULL means "global / cross-building".
--   2. Generated tsvector column 'fts' built from title + description + source
--      using the 'simple' configuration (Polish is not a built-in TS config in
--      stock Supabase Postgres; 'simple' covers our short titles and works
--      with prefix queries via to_tsquery / plainto_tsquery).
--
-- Plus a helper RPC search_library_documents(q, building_id) that blends
-- full-text rank with optional building scoping. The frontend uses this for
-- the Biblioteka search box; the embeddings RPC stays untouched (RAG path).
-- =============================================================================

-- 1. building_id -------------------------------------------------------------
ALTER TABLE public.library_documents
  ADD COLUMN IF NOT EXISTS building_id UUID
    REFERENCES public.buildings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_library_documents_building_id
  ON public.library_documents(building_id)
  WHERE building_id IS NOT NULL;

-- 2. tsvector + GIN ----------------------------------------------------------
ALTER TABLE public.library_documents
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(title, '')        || ' ' ||
      coalesce(description, '')  || ' ' ||
      coalesce(source, '')       || ' ' ||
      coalesce(badge, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_library_documents_fts
  ON public.library_documents USING GIN (fts);

-- 3. Search RPC --------------------------------------------------------------
-- - q is treated as a plainto_tsquery (handles spaces / punctuation safely);
--   passing an empty string returns all rows ranked by created_at desc.
-- - p_building_id NULL → no filter; UUID → that building OR globals (NULL).
CREATE OR REPLACE FUNCTION public.search_library_documents(
  q             TEXT DEFAULT '',
  p_building_id UUID DEFAULT NULL,
  p_category    TEXT DEFAULT NULL,
  p_limit       INTEGER DEFAULT 50
)
RETURNS TABLE (
  id           UUID,
  title        TEXT,
  category     TEXT,
  description  TEXT,
  source       TEXT,
  url          TEXT,
  badge        TEXT,
  building_id  UUID,
  rank         REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH parsed AS (
    SELECT CASE WHEN q IS NULL OR length(trim(q)) = 0
                THEN NULL
                ELSE plainto_tsquery('simple', q) END AS tsq
  )
  SELECT
    d.id,
    d.title,
    d.category,
    d.description,
    d.source,
    d.url,
    d.badge,
    d.building_id,
    CASE
      WHEN parsed.tsq IS NULL THEN 0::real
      ELSE ts_rank(d.fts, parsed.tsq)
    END AS rank
  FROM public.library_documents d, parsed
  WHERE
    (parsed.tsq IS NULL OR d.fts @@ parsed.tsq)
    AND (p_building_id IS NULL OR d.building_id IS NULL OR d.building_id = p_building_id)
    AND (p_category IS NULL OR d.category = p_category)
  ORDER BY
    CASE WHEN parsed.tsq IS NULL THEN 0 ELSE 1 END DESC,
    rank DESC,
    d.created_at DESC
  LIMIT GREATEST(1, COALESCE(p_limit, 50));
$$;

GRANT EXECUTE ON FUNCTION public.search_library_documents(TEXT, UUID, TEXT, INTEGER)
  TO authenticated, anon;

-- 4. Schema cache nudge so PostgREST picks up the new column + RPC ----------
NOTIFY pgrst, 'reload schema';
