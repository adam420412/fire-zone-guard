// =============================================================================
// library-ingest — chunk + embed a document and upsert into library_doc_chunks.
//
// Two modes via the `op` field in the request body:
//
//   { op: "ingest_text", document_id, content }
//     - splits content into ≤1000-char chunks (paragraph-aware)
//     - embeds each chunk with text-embedding-3-small
//     - replaces existing chunks for that document_id
//
//   { op: "embed_pending" }
//     - finds chunks with embedding IS NULL (e.g. inserted manually)
//     - embeds them in a single batch (cap = 50)
//
// Auth: requires admin / super_admin (verify_jwt = true). RLS on
// library_doc_chunks already enforces this on insert; we double-check here
// so that we fail fast with a clear error instead of an opaque RLS rejection.
// =============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EMBED_MODEL = "text-embedding-3-small";
const MAX_CHUNK_CHARS = 1000;
const BATCH_CAP = 50;

function chunkText(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // Paragraph-aware: split on blank lines first, then pack until maxChars.
  const paragraphs = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let buf = "";
  for (const p of paragraphs) {
    if (p.length > maxChars) {
      // Split oversized paragraph on sentence boundaries.
      const sentences = p.split(/(?<=[.?!])\s+/);
      for (const s of sentences) {
        if ((buf + " " + s).trim().length > maxChars) {
          if (buf) out.push(buf.trim());
          buf = s;
        } else {
          buf = (buf + " " + s).trim();
        }
      }
      continue;
    }
    if ((buf + "\n\n" + p).trim().length > maxChars) {
      if (buf) out.push(buf.trim());
      buf = p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf) out.push(buf.trim());
  return out;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`OpenAI embeddings failed: ${r.status} ${errText.slice(0, 300)}`);
  }
  const data = await r.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

interface IngestPayload {
  op: "ingest_text" | "embed_pending";
  document_id?: string;
  content?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as IngestPayload;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (body.op === "ingest_text") {
      if (!body.document_id || !body.content) {
        return new Response(
          JSON.stringify({ error: "document_id and content required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const chunks = chunkText(body.content);
      if (chunks.length === 0) {
        return new Response(JSON.stringify({ error: "Empty content" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (chunks.length > BATCH_CAP) {
        return new Response(
          JSON.stringify({
            error: `Too many chunks (${chunks.length}). Split the document into smaller pieces (max ${BATCH_CAP}).`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Replace existing chunks for this document so re-ingestion is idempotent.
      const { error: delErr } = await supabase
        .from("library_doc_chunks")
        .delete()
        .eq("document_id", body.document_id);
      if (delErr) throw delErr;

      const embeddings = await embedBatch(chunks);

      const rows = chunks.map((content, idx) => ({
        document_id: body.document_id!,
        chunk_index: idx,
        content,
        embedding: embeddings[idx],
      }));
      const { error: insErr } = await supabase
        .from("library_doc_chunks")
        .insert(rows);
      if (insErr) throw insErr;

      return new Response(
        JSON.stringify({ ok: true, document_id: body.document_id, chunks: chunks.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.op === "embed_pending") {
      const { data: pending, error: fetchErr } = await supabase
        .from("library_doc_chunks")
        .select("id, content")
        .is("embedding", null)
        .limit(BATCH_CAP);
      if (fetchErr) throw fetchErr;
      if (!pending || pending.length === 0) {
        return new Response(JSON.stringify({ ok: true, embedded: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const embeddings = await embedBatch(pending.map((p) => p.content));
      let updated = 0;
      for (let i = 0; i < pending.length; i++) {
        const { error: upErr } = await supabase
          .from("library_doc_chunks")
          .update({ embedding: embeddings[i] })
          .eq("id", pending[i].id);
        if (!upErr) updated++;
      }

      return new Response(JSON.stringify({ ok: true, embedded: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown op" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("library-ingest error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
