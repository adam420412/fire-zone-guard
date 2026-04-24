// =============================================================================
// extract-pdf-metadata — given a building_documents row id, download the file
// from Supabase Storage, ask gpt-4o to extract device + inspection metadata,
// and return a structured payload the frontend can show / persist.
//
// Why text extraction (not vision):
//   - PDFs with selectable text → unpdf gives clean text and gpt-4o-mini handles
//     it for ~1/10 the cost of gpt-4o vision.
//   - For scanned PDFs we fall back to gpt-4o vision on the first page rendered
//     as a base64 PNG (handled client-side or by a future tesseract pass).
//
// Request:  { document_id: uuid }
// Response: {
//   summary: string,
//   devices: [{ type, quantity, location?, notes? }],
//   next_inspection_due: string | null,   // ISO date if AI found one
//   inspector?: string | null,
//   confidence: "high" | "medium" | "low"
// }
//
// Auth: requires logged-in user (verify_jwt = true). Reads via service role.
// Does NOT mutate anything — frontend decides whether to upsert into
// device_services or just show the operator the suggestion.
// =============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CHAT_MODEL = "gpt-4o-mini";
const MAX_PDF_BYTES = 10 * 1024 * 1024;   // 10 MB hard cap
const MAX_TEXT_CHARS = 18_000;            // trim before sending to OpenAI

const SYSTEM_PROMPT = `Jesteś asystentem ekstrakcji danych z polskich dokumentów ochrony przeciwpożarowej.
Otrzymujesz tekst protokołu / projektu / DTR / IBP. Twoje zadanie: wyciągnąć z tekstu listę urządzeń, daty kolejnego przeglądu, nazwisko inspektora i 1–2 zdania podsumowania.

Pojęcia jakich szukasz:
- Urządzenia: hydranty (HZ, hydrant DN25/DN52), gaśnice (GP-2, GP-6, GS-5, AGS), centrale SSP, czujki, ROP, klapy oddymiające, drzwi przeciwpożarowe (DP-30, DP-60), oświetlenie awaryjne, DSO, zawory hydrantowe.
- Pole quantity: integer; jeśli brak liczby, zostaw 1.
- Pole next_inspection_due: ISO YYYY-MM-DD jeśli znajdziesz "następny przegląd" / "kolejna kontrola". Zwróć null jeśli brak.
- Pole inspector: imię i nazwisko inspektora / osoby podpisanej, lub null.
- Confidence: "high" jeśli tekst jest jasny i strukturalny; "medium" jeśli częściowy; "low" jeśli przypuszczenia.

Zwróć ściśle JSON o kształcie:
{
  "summary": "...",
  "devices": [{ "type": "...", "quantity": 1, "location": null, "notes": null }],
  "next_inspection_due": "YYYY-MM-DD" | null,
  "inspector": "..." | null,
  "confidence": "high" | "medium" | "low"
}`;

interface DocRow {
  id: string;
  building_id: string;
  name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
}

async function chatJson(textBlock: string): Promise<unknown> {
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
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Treść dokumentu:\n\n${textBlock}` },
      ],
      temperature: 0.1,
      max_tokens: 900,
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`OpenAI chat failed: ${r.status} ${errText.slice(0, 300)}`);
  }
  const data = await r.json();
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "{}";
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON: ${raw.slice(0, 200)}`);
  }
}

async function pdfToText(bytes: Uint8Array): Promise<string> {
  // unpdf wraps pdf.js — works in Deno without the canvas dep.
  const proxy = await getDocumentProxy(bytes);
  const { text } = await extractText(proxy, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : (text ?? "");
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
    const { document_id } = await req.json();
    if (!document_id || typeof document_id !== "string") {
      return new Response(JSON.stringify({ error: "document_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Look up the doc row.
    const { data: doc, error: dErr } = await supabase
      .from("building_documents")
      .select("id, building_id, name, file_path, file_type, file_size")
      .eq("id", document_id)
      .maybeSingle();
    if (dErr) throw dErr;
    if (!doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const d = doc as DocRow;

    if (d.file_size && d.file_size > MAX_PDF_BYTES) {
      return new Response(
        JSON.stringify({ error: `File too large (${d.file_size} > ${MAX_PDF_BYTES})` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2. Download from storage. file_path is "<bucket>/<key>" — we expect the
    //    'building-documents' bucket per project convention; fall through to
    //    parsing if the path includes the bucket prefix.
    let bucket = "building-documents";
    let key = d.file_path;
    if (d.file_path.includes("/")) {
      const idx = d.file_path.indexOf("/");
      const candidate = d.file_path.slice(0, idx);
      if (candidate && !candidate.includes(".")) {
        bucket = candidate;
        key = d.file_path.slice(idx + 1);
      }
    }

    const { data: blob, error: dlErr } = await supabase.storage
      .from(bucket)
      .download(key);
    if (dlErr || !blob) {
      throw new Error(`Storage download failed (${bucket}/${key}): ${dlErr?.message ?? "no blob"}`);
    }

    const buf = new Uint8Array(await blob.arrayBuffer());
    if (buf.byteLength > MAX_PDF_BYTES) {
      throw new Error(`File too large (${buf.byteLength} > ${MAX_PDF_BYTES})`);
    }

    // 3. Extract text. If the PDF is image-only, text will be very short — we
    //    still send it; the model will return confidence=low.
    let text = "";
    try {
      text = await pdfToText(buf);
    } catch (err) {
      throw new Error(`PDF parse failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const trimmed = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;

    if (trimmed.trim().length < 40) {
      return new Response(
        JSON.stringify({
          summary: "Dokument wygląda na zeskanowany — brak warstwy tekstowej.",
          devices: [],
          next_inspection_due: null,
          inspector: null,
          confidence: "low",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Ask the model.
    const result = (await chatJson(trimmed)) as Record<string, unknown>;
    const out = {
      summary: typeof result.summary === "string" ? result.summary : "",
      devices: Array.isArray(result.devices) ? result.devices.slice(0, 50) : [],
      next_inspection_due:
        typeof result.next_inspection_due === "string" ? result.next_inspection_due : null,
      inspector: typeof result.inspector === "string" ? result.inspector : null,
      confidence:
        result.confidence === "high" || result.confidence === "low" ? result.confidence : "medium",
    };

    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("extract-pdf-metadata error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
