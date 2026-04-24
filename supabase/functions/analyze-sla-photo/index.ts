// =============================================================================
// analyze-sla-photo — gpt-4o vision analysis of SLA ticket photos.
//
// Wywoływana zaraz po stworzeniu zgłoszenia z formularza /zgloszenie
// (auto-trigger), albo ręcznie przez operatora w SlaPage ("Re-analiza AI").
//
// Request:  { ticket_id: uuid }              — przeanalizuj photo_urls z DB
//      lub: { ticket_id: uuid, photos: [...] } — wymuś konkretne URLe
//
// Response: {
//   summary: string,                         // PL, 1-3 zdania
//   category: { device_type: string|null, issue: string|null,
//               visible_damage: boolean, recommended_action: string|null },
//   severity: "low" | "normal" | "high" | "critical",
//   confidence: "high" | "medium" | "low",
//   updated: boolean                         // czy zapisaliśmy do DB
// }
//
// Auth: invoke z anon key OK — verify_jwt = false. Edge function działa
//       service-role'em żeby ominąć RLS i pisać do sla_tickets.
//       Nie wymaga JWT bo wywołujemy z publicznego /zgloszenie.
//
// Model: gpt-4o (vision) — gpt-4o-mini nie obsługuje vision wystarczająco
//        dobrze dla zdjęć technicznych. Trzymamy max_tokens=400, low temp.
// =============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VISION_MODEL = "gpt-4o";
const MAX_PHOTOS = 4;       // wysyłamy max 4 zdjęcia żeby ograniczyć koszt
const REQUEST_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `Jesteś asystentem inspektora ochrony przeciwpożarowej w Polsce.
Otrzymujesz 1–4 zdjęcia z miejsca zgłoszenia awarii (od klienta).
Twoje zadanie: krótko opisać co widać, sklasyfikować problem, zasugerować priorytet.

Typy urządzeń (device_type), zwracaj kod:
G       = gaśnica
H       = hydrant wewnętrzny / zawór
SSP     = czujka / centrala SSP / ROP
PWP     = przeciwpożarowy wyłącznik prądu
OS_AWAR = oświetlenie awaryjne / znak ewakuacyjny
DSO     = głośnik DSO
DRZWI   = drzwi przeciwpożarowe / samozamykacz
KLAPY   = klapa odcinająca / klapa dymowa
ODDYM   = wentylator / kanał oddymiania
INNE    = inne / niejasne

Severity (priorytet sugerowany):
- "critical": realne zagrożenie życia LUB całkowita utrata funkcjonalności kluczowego systemu (np. spalona centrala SSP, brak ciśnienia w hydrancie, gaśnica wybuchnięta).
- "high": urządzenie ppoż. niesprawne ale zagrożenia bezpośredniego brak (np. zerwana plomba gaśnicy, drzwi nie domykają się).
- "normal": usterka kosmetyczna lub konserwacyjna (np. zacieki na suficie obok czujki, kurz, naklejka odpada).
- "low": nieistotne / nieczytelne / nie widać problemu.

Zwróć ŚCIŚLE JSON o kształcie:
{
  "summary": "1-3 zdania po polsku co widać i co jest nie tak",
  "category": {
    "device_type": "G|H|SSP|PWP|OS_AWAR|DSO|DRZWI|KLAPY|ODDYM|INNE" | null,
    "issue": "krótka nazwa problemu, np. 'brak plomby', 'pęknięta obudowa'" | null,
    "visible_damage": true | false,
    "recommended_action": "krótka rekomendacja serwisowa po polsku" | null
  },
  "severity": "low" | "normal" | "high" | "critical",
  "confidence": "high" | "medium" | "low"
}`;

interface AnalyzeRequest {
  ticket_id: string;
  photos?: string[];
}

interface AnalysisResult {
  summary: string;
  category: {
    device_type: string | null;
    issue: string | null;
    visible_damage: boolean;
    recommended_action: string | null;
  };
  severity: "low" | "normal" | "high" | "critical";
  confidence: "high" | "medium" | "low";
}

async function callVision(photoUrls: string[], description: string): Promise<AnalysisResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const userContent: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `Opis zgłaszającego (kontekst, niekoniecznie prawdziwy): ${
        description?.slice(0, 600) || "(brak opisu)"
      }\n\nPrzeanalizuj poniższe zdjęcia.`,
    },
  ];
  for (const url of photoUrls.slice(0, MAX_PHOTOS)) {
    userContent.push({
      type: "image_url",
      image_url: { url, detail: "low" },
    });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI vision failed: ${resp.status} ${errText.slice(0, 300)}`);
  }
  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "{}";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const cat = (parsed.category && typeof parsed.category === "object")
    ? parsed.category as Record<string, unknown>
    : {};

  const allowedDev = new Set([
    "G", "H", "SSP", "PWP", "OS_AWAR", "DSO", "DRZWI", "KLAPY", "ODDYM", "INNE",
  ]);
  const dev = typeof cat.device_type === "string" && allowedDev.has(cat.device_type)
    ? cat.device_type
    : null;

  const sev = (parsed.severity === "low" || parsed.severity === "normal" ||
               parsed.severity === "high" || parsed.severity === "critical")
    ? parsed.severity
    : "normal";

  const conf = (parsed.confidence === "high" || parsed.confidence === "low")
    ? parsed.confidence
    : "medium";

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 800) : "",
    category: {
      device_type: dev,
      issue: typeof cat.issue === "string" ? cat.issue.slice(0, 200) : null,
      visible_damage: cat.visible_damage === true,
      recommended_action: typeof cat.recommended_action === "string"
        ? cat.recommended_action.slice(0, 300)
        : null,
    },
    severity: sev,
    confidence: conf,
  };
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let ticketId = "";
  try {
    const body = (await req.json()) as AnalyzeRequest;
    ticketId = body.ticket_id ?? "";
    if (!ticketId) {
      return new Response(JSON.stringify({ error: "ticket_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch ticket → photo_urls + description
    const { data: ticket, error: tErr } = await supabase
      .from("sla_tickets")
      .select("id, description, photo_urls")
      .eq("id", ticketId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const photos = (body.photos && body.photos.length)
      ? body.photos.filter((u) => typeof u === "string" && u.startsWith("http"))
      : ((ticket.photo_urls as string[] | null) ?? []).filter((u) => u.startsWith("http"));

    if (!photos.length) {
      // Brak zdjęć — zapisz noop info, nie wywołuj OpenAI
      await supabase
        .from("sla_tickets")
        .update({
          ai_analysis_at: new Date().toISOString(),
          ai_analysis_error: "no_photos",
        })
        .eq("id", ticketId);
      return new Response(
        JSON.stringify({ updated: false, reason: "no_photos" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Call vision
    const result = await callVision(photos, ticket.description ?? "");

    // 3. Persist back to ticket
    const { error: uErr } = await supabase
      .from("sla_tickets")
      .update({
        ai_summary: result.summary,
        ai_category: { ...result.category, confidence: result.confidence },
        ai_severity_suggestion: result.severity,
        ai_analysis_at: new Date().toISOString(),
        ai_analysis_error: null,
      })
      .eq("id", ticketId);
    if (uErr) throw uErr;

    return new Response(JSON.stringify({ ...result, updated: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("analyze-sla-photo error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (ticketId) {
      try {
        await supabase
          .from("sla_tickets")
          .update({
            ai_analysis_at: new Date().toISOString(),
            ai_analysis_error: msg.slice(0, 1000),
          })
          .eq("id", ticketId);
      } catch (_) {
        // best-effort
      }
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
