// =============================================================================
// library-rag — RAG Q&A over the public.library_doc_chunks corpus.
//
// Flow per request:
//   1. Embed the user question with text-embedding-3-small (1536d).
//   2. Call public.match_library_documents(query_embedding, threshold, k).
//   3. Assemble a compact prompt with the top-k chunks + their citations.
//   4. Stream the answer from gpt-4o-mini (Polish, with explicit instruction
//      to cite sources by their bracketed index).
//   5. Return JSON: { answer, citations: [{ doc_title, source, similarity }] }
//
// Auth: requires a logged-in user (verify_jwt = true is the Supabase default).
// Secrets: OPENAI_API_KEY must be set in the project's edge-function env.
// =============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EMBED_MODEL = "text-embedding-3-small";
const CHAT_MODEL  = "gpt-4o-mini";
const MATCH_K     = 6;
const MATCH_THRESH = 0.4;

const SYSTEM_PROMPT = `Jesteś asystentem prawno-technicznym w obszarze ochrony przeciwpożarowej (PPOŻ) w Polsce.
Odpowiadasz wyłącznie na podstawie dostarczonych fragmentów aktów prawnych i wytycznych.
Jeżeli odpowiedź nie wynika z fragmentów — powiedz wprost, że potrzebujesz dodatkowego źródła.
Każde stwierdzenie poprzyj cytowaniem w nawiasie kwadratowym, np. [1] [3], odnoszącym się do numeru fragmentu.
Odpowiedź formułuj zwięźle, w języku polskim, używając listy wypunktowanej tylko gdy ma to wartość.`;

interface Citation {
  index: number;
  doc_title: string;
  doc_source: string | null;
  doc_url: string | null;
  similarity: number;
}

interface Chunk {
  chunk_id: string;
  document_id: string;
  content: string;
  similarity: number;
  doc_title: string;
  doc_source: string | null;
  doc_url: string | null;
}

async function embed(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`OpenAI embeddings failed: ${r.status} ${errText.slice(0, 300)}`);
  }
  const data = await r.json();
  return data.data[0].embedding as number[];
}

async function chat(messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 700,
    }),
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`OpenAI chat failed: ${r.status} ${errText.slice(0, 300)}`);
  }
  const data = await r.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
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
    const { question } = await req.json();
    if (!question || typeof question !== "string" || question.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Pytanie jest zbyt krótkie." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for the RPC so we don't depend on the caller's RLS view
    // (chunks are readable by all authenticated users anyway, but this avoids
    // an extra JWT round-trip).
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const queryEmbedding = await embed(question.trim());

    const { data: chunks, error: matchError } = await supabase.rpc(
      "match_library_documents",
      {
        query_embedding: queryEmbedding,
        match_threshold: MATCH_THRESH,
        match_count: MATCH_K,
      },
    );
    if (matchError) throw matchError;

    const matched = (chunks ?? []) as Chunk[];

    if (matched.length === 0) {
      return new Response(
        JSON.stringify({
          answer:
            "Nie znalazłem fragmentów w bibliotece, które odpowiadałyby na to pytanie. " +
            "Spróbuj przeformułować zapytanie albo dodaj odpowiedni dokument do biblioteki.",
          citations: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const contextBlock = matched
      .map((c, i) => `[${i + 1}] ${c.doc_title}${c.doc_source ? ` — ${c.doc_source}` : ""}\n${c.content}`)
      .join("\n\n---\n\n");

    const answer = await chat([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Pytanie: ${question.trim()}\n\nFragmenty z biblioteki:\n\n${contextBlock}`,
      },
    ]);

    const citations: Citation[] = matched.map((c, i) => ({
      index: i + 1,
      doc_title: c.doc_title,
      doc_source: c.doc_source,
      doc_url: c.doc_url,
      similarity: Number(c.similarity.toFixed(3)),
    }));

    return new Response(JSON.stringify({ answer, citations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("library-rag error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
