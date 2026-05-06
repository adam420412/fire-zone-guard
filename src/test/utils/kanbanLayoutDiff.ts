/**
 * Czytelny raport różnic dwóch znormalizowanych layoutów PDF
 * (`KanbanPdfLayoutReport` po `normalizeLayout`).
 *
 * Cel: zamiast surowego JSON-diffa Vitest, dostajemy zwięzłe podsumowanie
 * — co konkretnie się zmieniło w odstępach / paginacji / nagłówkach,
 * pogrupowane po obszarach (totals, pages, sections).
 *
 * Używany przez:
 *   - matcher `toMatchKanbanLayout` (vitest) — zob. src/test/setup/kanbanLayoutMatcher.ts
 *   - ręczne wywołanie z testów ad-hoc.
 */

export type AnyLayoutSection = {
  groupIndex: number;
  groupLabel: string;
  page: number;
  headerTop: number;
  headerBottom: number;
  tableStartY: number;
  tableFinalY: number;
  tableEndPage: number;
  headerHeight?: number;
  tableHeightFirstPage?: number;
  tablePageSpan?: number;
  sectionHeightOnStartPage?: number;
  gapBeforeHeader?: number | null;
  startsNewPage?: boolean;
  indexOnPage?: number;
  taskCount?: number;
};

export type AnyPageSummary = {
  page: number;
  sectionsStarting: number;
  sectionsEnding: number;
  firstUsedY: number | null;
  lastUsedY: number | null;
  trailingWhitespace: number;
};

export type AnyLayoutSnapshot = {
  pageWidth: number;
  pageHeight: number;
  marginTop: number;
  marginBottom: number;
  marginLeft?: number;
  spacing?: { headerToTable: number; tableToNextHeader: number };
  totalPages: number;
  sections: AnyLayoutSection[];
  pages?: AnyPageSummary[];
  totals?: {
    sectionsCount: number;
    totalHeaderHeight: number;
    totalTableHeightOnStartPage: number;
    totalGapBeforeHeader: number;
    avgTrailingWhitespace: number;
  };
};

type DiffLine = string;

function fmt(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(1);
  return String(v);
}

function diffPair(label: string, a: unknown, b: unknown, unit = ""): DiffLine | null {
  if (a === b) return null;
  if (typeof a === "number" && typeof b === "number") {
    const delta = b - a;
    const sign = delta > 0 ? "+" : "";
    return `  ${label}: ${fmt(a)}${unit} → ${fmt(b)}${unit}  (Δ ${sign}${fmt(delta)}${unit})`;
  }
  return `  ${label}: ${fmt(a)} → ${fmt(b)}`;
}

/** Indeksuje sekcje po kluczu groupIndex|groupLabel (label dodaje czytelności). */
function indexSections(sections: AnyLayoutSection[]): Map<string, AnyLayoutSection> {
  const m = new Map<string, AnyLayoutSection>();
  sections.forEach((s) => m.set(`${s.groupIndex}|${s.groupLabel}`, s));
  return m;
}

function diffSection(a: AnyLayoutSection, b: AnyLayoutSection): DiffLine[] {
  const lines: DiffLine[] = [];
  const fields: Array<{ key: keyof AnyLayoutSection; label: string; unit?: string }> = [
    { key: "page", label: "page" },
    { key: "tableEndPage", label: "tableEndPage" },
    { key: "headerTop", label: "headerTop", unit: "pt" },
    { key: "headerBottom", label: "headerBottom", unit: "pt" },
    { key: "headerHeight", label: "headerHeight", unit: "pt" },
    { key: "tableStartY", label: "tableStartY", unit: "pt" },
    { key: "tableFinalY", label: "tableFinalY", unit: "pt" },
    { key: "tableHeightFirstPage", label: "tableHeight(firstPage)", unit: "pt" },
    { key: "tablePageSpan", label: "tablePageSpan" },
    { key: "sectionHeightOnStartPage", label: "sectionHeight(start)", unit: "pt" },
    { key: "gapBeforeHeader", label: "gapBeforeHeader", unit: "pt" },
    { key: "startsNewPage", label: "startsNewPage" },
    { key: "indexOnPage", label: "indexOnPage" },
    { key: "taskCount", label: "taskCount" },
  ];
  for (const f of fields) {
    const line = diffPair(f.label, a[f.key], b[f.key], f.unit ?? "");
    if (line) lines.push(line);
  }
  return lines;
}

function diffPageSummary(a: AnyPageSummary, b: AnyPageSummary): DiffLine[] {
  const lines: DiffLine[] = [];
  const fields: Array<{ key: keyof AnyPageSummary; label: string; unit?: string }> = [
    { key: "sectionsStarting", label: "sectionsStarting" },
    { key: "sectionsEnding", label: "sectionsEnding" },
    { key: "firstUsedY", label: "firstUsedY", unit: "pt" },
    { key: "lastUsedY", label: "lastUsedY", unit: "pt" },
    { key: "trailingWhitespace", label: "trailingWhitespace", unit: "pt" },
  ];
  for (const f of fields) {
    const line = diffPair(f.label, a[f.key], b[f.key], f.unit ?? "");
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Buduje czytelny tekstowy raport różnic między dwoma layoutami.
 * Zwraca pusty string gdy raporty są identyczne (po polach branych pod uwagę).
 */
export function diffKanbanLayouts(
  expected: AnyLayoutSnapshot,
  actual: AnyLayoutSnapshot,
): string {
  const out: string[] = [];
  const push = (s: string) => out.push(s);
  const section = (title: string, lines: string[]) => {
    if (lines.length === 0) return;
    push("");
    push(`▼ ${title}`);
    lines.forEach(push);
  };

  // ── Page geometry / spacing ───────────────────────────────────────────────
  const geoLines: string[] = [];
  (
    [
      ["pageWidth", "pt"],
      ["pageHeight", "pt"],
      ["marginTop", "pt"],
      ["marginBottom", "pt"],
      ["marginLeft", "pt"],
      ["totalPages", ""],
    ] as const
  ).forEach(([k, u]) => {
    const line = diffPair(k, (expected as any)[k], (actual as any)[k], u);
    if (line) geoLines.push(line);
  });
  if (expected.spacing && actual.spacing) {
    const a = diffPair(
      "spacing.headerToTable",
      expected.spacing.headerToTable,
      actual.spacing.headerToTable,
      "pt",
    );
    const b = diffPair(
      "spacing.tableToNextHeader",
      expected.spacing.tableToNextHeader,
      actual.spacing.tableToNextHeader,
      "pt",
    );
    if (a) geoLines.push(a);
    if (b) geoLines.push(b);
  }
  section("Geometria strony / spacing", geoLines);

  // ── Totals ────────────────────────────────────────────────────────────────
  if (expected.totals && actual.totals) {
    const tLines: string[] = [];
    (
      [
        ["sectionsCount", ""],
        ["totalHeaderHeight", "pt"],
        ["totalTableHeightOnStartPage", "pt"],
        ["totalGapBeforeHeader", "pt"],
        ["avgTrailingWhitespace", "pt"],
      ] as const
    ).forEach(([k, u]) => {
      const line = diffPair(
        `totals.${k}`,
        (expected.totals as any)[k],
        (actual.totals as any)[k],
        u,
      );
      if (line) tLines.push(line);
    });
    section("Sumy / agregaty", tLines);
  }

  // ── Per-page summaries ────────────────────────────────────────────────────
  const pagesA = expected.pages ?? [];
  const pagesB = actual.pages ?? [];
  const pageMaxLen = Math.max(pagesA.length, pagesB.length);
  const pageLines: string[] = [];
  for (let i = 0; i < pageMaxLen; i++) {
    const a = pagesA[i];
    const b = pagesB[i];
    if (!a && b) {
      pageLines.push(`  + nowa strona ${b.page} (sectionsStarting=${b.sectionsStarting}, lastUsedY=${fmt(b.lastUsedY)}pt)`);
      continue;
    }
    if (a && !b) {
      pageLines.push(`  - brakuje strony ${a.page} (była: sectionsStarting=${a.sectionsStarting})`);
      continue;
    }
    if (!a || !b) continue;
    const sub = diffPageSummary(a, b);
    if (sub.length) {
      pageLines.push(`  • strona ${a.page}:`);
      sub.forEach((l) => pageLines.push("  " + l));
    }
  }
  section("Strony (per-page)", pageLines);

  // ── Sections (po kluczu groupIndex|groupLabel) ────────────────────────────
  const idxA = indexSections(expected.sections);
  const idxB = indexSections(actual.sections);
  const allKeys = new Set<string>([...idxA.keys(), ...idxB.keys()]);
  const sectionLines: string[] = [];
  // Stabilna kolejność: wg groupIndex z `expected`, potem nowe z actual.
  const ordered = Array.from(allKeys).sort((k1, k2) => {
    const a1 = idxA.get(k1) ?? idxB.get(k1)!;
    const a2 = idxA.get(k2) ?? idxB.get(k2)!;
    return a1.groupIndex - a2.groupIndex;
  });
  for (const key of ordered) {
    const a = idxA.get(key);
    const b = idxB.get(key);
    if (a && !b) {
      sectionLines.push(`  - usunięta sekcja [${key}] (była page=${a.page})`);
      continue;
    }
    if (!a && b) {
      sectionLines.push(`  + nowa sekcja [${key}] (page=${b.page})`);
      continue;
    }
    if (!a || !b) continue;
    const sub = diffSection(a, b);
    if (sub.length) {
      sectionLines.push(`  • sekcja [${key}] (page ${a.page}):`);
      sub.forEach((l) => sectionLines.push("  " + l));
    }
  }
  section("Sekcje (per-grupa)", sectionLines);

  if (out.length === 0) return "";
  out.unshift("┌── KanbanPdfLayout DIFF ──────────────────────────────");
  out.push("");
  out.push("└──────────────────────────────────────────────────────");
  // Krótkie podsumowanie liczbowe na górze.
  const summary = [
    `sekcji zmienionych: ${
      ordered.filter((k) => {
        const a = idxA.get(k);
        const b = idxB.get(k);
        return a && b && diffSection(a, b).length > 0;
      }).length
    }`,
    `dodanych: ${ordered.filter((k) => !idxA.get(k) && idxB.get(k)).length}`,
    `usuniętych: ${ordered.filter((k) => idxA.get(k) && !idxB.get(k)).length}`,
    `stron: ${expected.totalPages} → ${actual.totalPages}`,
  ].join(" | ");
  out.splice(1, 0, `│ ${summary}`);
  return out.join("\n");
}
