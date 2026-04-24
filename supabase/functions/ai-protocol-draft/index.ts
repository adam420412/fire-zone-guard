// =============================================================================
// ai-protocol-draft — given a protocol_id, gather measurements + building meta
// and ask gpt-4o-mini to draft Polish-language `notes` (uwagi szczegółowe) and
// suggest an `overall_result`. The frontend can pre-fill the textarea so the
// inspector only edits, never starts from a blank page.
//
// Request:  { protocol_id: uuid }
// Response: { notes: string, overall_result: string, suggestions: string[] }
//
// Auth: requires logged-in user (verify_jwt = true). Reads everything via
// the service role to bypass RLS (we still pass building_id back to the
// caller for sanity).
//
// Why gpt-4o-mini: cheap, fast, multilingual, and good at structured Polish
// technical writing. We keep temperature low and force JSON via response_format.
// =============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CHAT_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `Jesteś asystentem inspektora ochrony przeciwpożarowej w Polsce.
Na bazie danych protokołu badania (typ przeglądu, dane budynku, pomiary) generujesz krótki, profesjonalny draft sekcji "Uwagi szczegółowe z oględzin" oraz proponujesz wynik końcowy.

Zasady:
- Pisz po polsku, w stylu technicznym, bezosobowym ("Stwierdzono...", "Zaleca się...").
- Maksymalnie 4–6 zdań w sekcji notes.
- Jeśli pomiary wyglądają na pozytywne (brak NIE_OK / awarii) → overall_result = "pozytywny".
- Jeśli >0 pomiarów ma status NIE_OK / fail / negatywny → "negatywny" + wymień co naprawić.
- Jeśli brak pomiarów → "do oceny" i jedno zdanie zachęcające do uzupełnienia danych.
- Pole suggestions: 0–3 krótkich punktów konkretnych zaleceń (np. "Wymienić uszczelkę drzwi DP-3").

Zwróć ściśle JSON o kształcie:
{ "notes": "...", "overall_result": "pozytywny|negatywny|do oceny", "suggestions": ["...", ...] }`;

interface ProtocolRow {
  id: string;
  building_id: string;
  type: string | null;
  status: string | null;
  performed_at: string | null;
  next_inspection_due: string | null;
  overall_result: string | null;
  notes: string | null;
}

async function chatJson(messages: { role: string; content: string }[]): Promise<unknown> {
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
      max_tokens: 500,
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
    throw new Error(`OpenAI returned non-JSON content: ${raw.slice(0, 200)}`);
  }
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
    const { protocol_id } = await req.json();
    if (!protocol_id || typeof protocol_id !== "string") {
      return new Response(JSON.stringify({ error: "protocol_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Fetch protocol header.
    const { data: protocol, error: pErr } = await supabase
      .from("service_protocols")
      .select("id, building_id, type, status, performed_at, next_inspection_due, overall_result, notes")
      .eq("id", protocol_id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!protocol) {
      return new Response(JSON.stringify({ error: "Protocol not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const p = protocol as ProtocolRow;

    // 2. Fetch building name (for context only).
    const { data: building } = await supabase
      .from("buildings")
      .select("name, address")
      .eq("id", p.building_id)
      .maybeSingle();

    // 3. Fetch hydrant_measurements for this protocol (matches existing code).
    //    We use a permissive select so the prompt sees whatever columns exist.
    const { data: measurements } = await supabase
      .from("hydrant_measurements")
      .select("*")
      .eq("protocol_id", protocol_id);

    const measurementSummary = (measurements ?? []).slice(0, 30).map((m, i) => {
      // Strip noisy fields, keep the values that actually matter for AI judgment.
      const { id: _id, protocol_id: _pid, created_at: _ca, ...rest } = m as Record<string, unknown>;
      return `[${i + 1}] ${JSON.stringify(rest)}`;
    }).join("\n");

    const userBlock = [
      `Typ protokołu: ${p.type ?? "(nieznany)"}`,
      `Obiekt: ${building?.name ?? "(brak)"}${building?.address ? ` — ${building.address}` : ""}`,
      `Data wykonania: ${p.performed_at ?? "(brak)"}`,
      `Następny przegląd: ${p.next_inspection_due ?? "(brak)"}`,
      `Aktualne uwagi (jeśli są, do wzbogacenia, nie kasowania): ${p.notes ?? "(brak)"}`,
      `Aktualny wynik: ${p.overall_result ?? "(brak)"}`,
      ``,
      `Pomiary (${(measurements ?? []).length} pozycji):`,
      measurementSummary || "(brak pomiarów)",
    ].join("\n");

    const result = (await chatJson([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userBlock },
    ])) as { notes?: string; overall_result?: string; suggestions?: unknown };

    const notes = typeof result.notes === "string" ? result.notes : "";
    const overall_result = typeof result.overall_result === "string" ? result.overall_result : "do oceny";
    const suggestions = Array.isArray(result.suggestions)
      ? result.suggestions.filter((s): s is string => typeof s === "string").slice(0, 5)
      : [];

    return new Response(JSON.stringify({ notes, overall_result, suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-protocol-draft error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
