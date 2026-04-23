import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  BookOpen, Search, FileText, Download, ExternalLink,
  Scale, Shield, FlameKindling, Building2, AlertCircle,
  Loader2, Quote, Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLibraryRag } from "@/hooks/useLibraryRag";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Faza 4 — Biblioteka: prawo + wytyczne + szablony + AI Q&A
type Category = "law" | "guidelines" | "templates" | "internal";

interface DocItem {
  id: string;
  title: string;
  category: Category;
  description: string;
  source?: string;
  url?: string;
  badge?: string;
}

const CATEGORIES: { key: Category | "all"; label: string; Icon: typeof BookOpen; color: string }[] = [
  { key: "all",         label: "Wszystko",   Icon: BookOpen,  color: "text-slate-500" },
  { key: "law",         label: "Prawo",      Icon: Scale,     color: "text-blue-500" },
  { key: "guidelines",  label: "Wytyczne",   Icon: Shield,    color: "text-purple-500" },
  { key: "templates",   label: "Szablony",   Icon: FileText,  color: "text-green-500" },
  { key: "internal",    label: "Wewnętrzne", Icon: Building2, color: "text-orange-500" },
];

const SEED_DOCS: DocItem[] = [
  {
    id: "rmswia-2010",
    title: "Rozporządzenie MSWiA w sprawie ochrony przeciwpożarowej budynków",
    category: "law",
    description: "Podstawowy akt wykonawczy dla ochrony PPOŻ — instalacje, gaśnice, hydranty, drogi ewakuacyjne.",
    source: "Dz.U. 2010 nr 109 poz. 719",
    badge: "PODSTAWA",
  },
  {
    id: "ustawa-1991",
    title: "Ustawa o ochronie przeciwpożarowej",
    category: "law",
    description: "Ustawa z 24.08.1991 r. — obowiązki właścicieli i zarządców obiektów.",
    source: "Dz.U. 1991 nr 81 poz. 351",
    badge: "USTAWA",
  },
  {
    id: "wt-2002",
    title: "Warunki techniczne — budynki i ich usytuowanie",
    category: "law",
    description: "Kategoryzacja ZL, PM, klasy odporności pożarowej, wymagania przeciwpożarowe budynków.",
    source: "Dz.U. 2002 nr 75 poz. 690",
  },
  {
    id: "iso-7240",
    title: "PN-EN 54 / ISO 7240 — Systemy sygnalizacji pożarowej",
    category: "guidelines",
    description: "Norma dotycząca komponentów i instalacji SSP.",
    badge: "NORMA",
  },
  {
    id: "cnbop",
    title: "Wytyczne CNBOP-PIB",
    category: "guidelines",
    description: "Centrum Naukowo-Badawcze Ochrony Przeciwpożarowej — wytyczne stosowania urządzeń ppoż.",
    url: "https://www.cnbop.pl/",
  },
  {
    id: "tpl-protokol",
    title: "Szablon protokołu serwisowego gaśnic",
    category: "templates",
    description: "Standardowy szablon protokołu konserwacji gaśnic — generowany automatycznie z aplikacji.",
  },
  {
    id: "tpl-audyt",
    title: "Szablon raportu z audytu PPOŻ",
    category: "templates",
    description: "Lista kontrolna + wynik końcowy + zalecenia naprawcze.",
  },
  {
    id: "tpl-ibp",
    title: "Szablon Instrukcji Bezpieczeństwa Pożarowego (IBP)",
    category: "templates",
    description: "Wymagana dla obiektów ZL i PM o określonej powierzchni / kategorii.",
  },
];

export default function LibraryPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin" || role === "super_admin";

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<Category | "all">("all");
  const [aiQuestion, setAiQuestion] = useState("");
  const ragMutation = useLibraryRag();

  // Admin ingest panel state
  const [ingestDocId, setIngestDocId] = useState("");
  const [ingestContent, setIngestContent] = useState("");
  const [ingesting, setIngesting] = useState(false);

  const askAi = () => {
    const q = aiQuestion.trim();
    if (!q || q.length < 3) return;
    ragMutation.mutate(q);
  };

  const ingest = async () => {
    if (!ingestDocId.trim() || !ingestContent.trim()) {
      toast.error("Wybierz ID dokumentu i wklej treść.");
      return;
    }
    try {
      setIngesting(true);
      const { data, error } = await supabase.functions.invoke("library-ingest", {
        body: { op: "ingest_text", document_id: ingestDocId.trim(), content: ingestContent },
      });
      if (error) throw error;
      const d = data as { ok?: boolean; chunks?: number; error?: string };
      if (d?.error) throw new Error(d.error);
      toast.success(`Zaindeksowano ${d?.chunks ?? 0} fragmentów.`);
      setIngestContent("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd ingest");
    } finally {
      setIngesting(false);
    }
  };

  const filtered = SEED_DOCS.filter((d) => {
    if (activeCat !== "all" && d.category !== activeCat) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return d.title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <BookOpen className="h-7 w-7 text-orange-500" />
          Biblioteka PPOŻ
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Prawo, wytyczne, szablony dokumentów i wewnętrzne procedury w jednym miejscu.
        </p>
      </div>

      {/* AI Q&A — Faza 4 */}
      <Card className="p-5 bg-gradient-to-br from-orange-500/10 via-red-500/5 to-transparent border-orange-500/30">
        <div className="flex items-start gap-3">
          <FlameKindling className="h-6 w-6 text-orange-500 flex-shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-lg">AI Asystent prawno-techniczny</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-3">
              Zadaj pytanie z zakresu ochrony PPOŻ — odpowiedź z cytatem z aktu prawnego.
            </p>
            <div className="flex gap-2">
              <Input
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !ragMutation.isPending) askAi(); }}
                placeholder='np. "Co ile lat wymieniać proszek w gaśnicy GP-6?"'
                className="bg-background"
                disabled={ragMutation.isPending}
              />
              <Button onClick={askAi} disabled={ragMutation.isPending || aiQuestion.trim().length < 3} className="gap-2">
                {ragMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Szukam...</>
                ) : (
                  <><FlameKindling className="h-4 w-4" /> Zapytaj</>
                )}
              </Button>
            </div>

            {ragMutation.error && (
              <div className="mt-3 rounded-md border border-critical/30 bg-critical/10 p-3 text-xs text-critical">
                {ragMutation.error.message}
              </div>
            )}

            {ragMutation.data && (
              <div className="mt-4 space-y-3">
                <div className="rounded-md border border-orange-500/30 bg-background p-3 text-sm whitespace-pre-wrap">
                  {ragMutation.data.answer}
                </div>
                {ragMutation.data.citations.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Źródła
                    </p>
                    <ul className="space-y-1">
                      {ragMutation.data.citations.map((c) => (
                        <li key={c.index} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <Quote className="h-3 w-3 mt-0.5 flex-shrink-0 text-orange-500" />
                          <span>
                            <span className="font-mono mr-1">[{c.index}]</span>
                            <span className="font-medium text-foreground">{c.doc_title}</span>
                            {c.doc_source && <span className="ml-1">— {c.doc_source}</span>}
                            <span className="ml-1 opacity-60">({Math.round(c.similarity * 100)}%)</span>
                            {c.doc_url && (
                              <a href={c.doc_url} target="_blank" rel="noreferrer" className="ml-1 underline">
                                ↗
                              </a>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {!ragMutation.data && !ragMutation.isPending && (
              <p className="text-xs text-muted-foreground mt-2 italic">
                Odpowiedź oparta o RAG nad biblioteką dokumentów (text-embedding-3-small + gpt-4o-mini).
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* INGEST PANEL — admin only */}
      {isAdmin && (
        <Card className="p-4 border-dashed">
          <div className="flex items-start gap-2 mb-3">
            <Upload className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Indeksowanie dokumentu (admin)</p>
              <p className="text-xs text-muted-foreground">
                Wklej treść (np. fragmenty rozporządzenia) — zostanie pocięta na chunki i zembedowana.
              </p>
            </div>
          </div>
          <div className="grid gap-2">
            <Input
              value={ingestDocId}
              onChange={(e) => setIngestDocId(e.target.value)}
              placeholder="document_id (UUID z library_documents)"
              className="font-mono text-xs"
            />
            <Textarea
              value={ingestContent}
              onChange={(e) => setIngestContent(e.target.value)}
              rows={6}
              placeholder="Wklej treść dokumentu (max ≈ 50 chunków, czyli ~50 000 znaków)..."
              className="text-xs"
            />
            <div className="flex justify-end">
              <Button onClick={ingest} disabled={ingesting} size="sm" className="gap-2">
                {ingesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Zindeksuj
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* SEARCH + CATEGORIES */}
      <Card className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj w bibliotece..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const Icon = c.Icon;
            return (
              <Button
                key={c.key}
                size="sm"
                variant={activeCat === c.key ? "default" : "outline"}
                onClick={() => setActiveCat(c.key)}
                className="gap-1.5"
              >
                <Icon className="h-3.5 w-3.5" />
                {c.label}
              </Button>
            );
          })}
        </div>
      </Card>

      {/* DOCS LIST */}
      <div className="grid md:grid-cols-2 gap-3">
        {filtered.map((doc) => {
          const meta = CATEGORIES.find((c) => c.key === doc.category)!;
          const Icon = meta.Icon;
          return (
            <Card key={doc.id} className="p-4 hover:shadow-md transition">
              <div className="flex items-start gap-3">
                <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", meta.color)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm">{doc.title}</p>
                    {doc.badge && (
                      <Badge variant="secondary" className="text-[10px] flex-shrink-0">{doc.badge}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">{doc.description}</p>
                  {doc.source && (
                    <p className="text-xs text-muted-foreground mt-1.5 font-mono">{doc.source}</p>
                  )}
                  <div className="flex gap-2 mt-3">
                    {doc.url ? (
                      <Button asChild size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
                        <a href={doc.url} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3 w-3" /> Otwórz
                        </a>
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" disabled>
                        <Download className="h-3 w-3" /> Pobierz
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground border-dashed">
          Brak dokumentów dla tego filtra.
        </Card>
      )}

      <Card className="p-4 bg-blue-500/5 border-blue-500/30">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-blue-700 dark:text-blue-300">Biblioteka + RAG</p>
            <p className="text-muted-foreground mt-1">
              Lista bazowa pochodzi z {SEED_DOCS.length} pozycji curated. AI Q&A operuje nad
              tabelą <code className="font-mono text-[10px]">library_doc_chunks</code>; admin może
              indeksować nowe dokumenty z panelu powyżej. Linkowanie chunków do obiektów —
              w kolejnej iteracji.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
