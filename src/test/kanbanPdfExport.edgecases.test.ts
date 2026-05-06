/**
 * Snapshot testy SKRAJNYCH przypadków eksportu PDF Kanban.
 *
 * Cel: zabezpieczenie przed regresjami w:
 *   - zawijaniu / ucinaniu bardzo długich opisów (overflow: linebreak),
 *   - wysokościach wierszy gdy opis ma wiele linii,
 *   - ekstremalnie szerokich kolumnach (column wider than page) — autoTable
 *     wówczas i tak musi się zmieścić w marginesach,
 *   - extremie wąskich kolumnach + długich tekstach (max page-span tabeli),
 *   - znakach Unicode / emoji / nowych liniach w treści.
 *
 * Snapshotujemy zaokrąglony layout (1pt) — deterministycznie, niezależnie
 * od binarnej zawartości PDF. Po świadomej zmianie układu: `vitest -u`.
 */

import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  buildKanbanPdf,
  type KanbanPdfColumn,
  type KanbanPdfGroup,
  type KanbanPdfLayoutReport,
} from "@/lib/kanbanPdfExport";

const GROUP_BY_LABEL: Record<string, string> = {
  company: "Firma",
  building: "Obiekt",
  person: "Osoba",
};

/** Deterministyczny "lorem" — bez randomizacji. */
const LOREM_PARAGRAPH =
  "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. " +
  "Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. " +
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. ";

const longText = (paragraphs: number) =>
  Array.from({ length: paragraphs }, () => LOREM_PARAGRAPH).join("");

/** Zaokrąglenie do 1pt — eliminuje szum FP, ale zachowuje wszystkie pola diagnostyczne. */
function normalizeLayout(layout: KanbanPdfLayoutReport) {
  const r = (n: number) => Math.round(n);
  const rN = (n: number | null) => (n == null ? null : Math.round(n));
  return {
    pageWidth: r(layout.pageWidth),
    pageHeight: r(layout.pageHeight),
    marginTop: r(layout.marginTop),
    marginBottom: r(layout.marginBottom),
    marginLeft: r(layout.marginLeft),
    spacing: layout.spacing,
    totalPages: layout.totalPages,
    sections: layout.sections.map((s) => ({
      groupIndex: s.groupIndex,
      groupLabel: s.groupLabel,
      page: s.page,
      headerTop: r(s.headerTop),
      headerBottom: r(s.headerBottom),
      tableStartY: r(s.tableStartY),
      tableFinalY: r(s.tableFinalY),
      tableEndPage: s.tableEndPage,
      headerHeight: r(s.headerHeight),
      tableHeightFirstPage: r(s.tableHeightFirstPage),
      tablePageSpan: s.tablePageSpan,
      sectionHeightOnStartPage: r(s.sectionHeightOnStartPage),
      gapBeforeHeader: rN(s.gapBeforeHeader),
      startsNewPage: s.startsNewPage,
      indexOnPage: s.indexOnPage,
      taskCount: s.taskCount,
    })),
    pages: layout.pages.map((p) => ({
      page: p.page,
      sectionsStarting: p.sectionsStarting,
      sectionsEnding: p.sectionsEnding,
      firstUsedY: rN(p.firstUsedY),
      lastUsedY: rN(p.lastUsedY),
      trailingWhitespace: r(p.trailingWhitespace),
    })),
    totals: {
      sectionsCount: layout.totals.sectionsCount,
      totalHeaderHeight: r(layout.totals.totalHeaderHeight),
      totalTableHeightOnStartPage: r(layout.totals.totalTableHeightOnStartPage),
      totalGapBeforeHeader: r(layout.totals.totalGapBeforeHeader),
      avgTrailingWhitespace: r(layout.totals.avgTrailingWhitespace),
    },
  };
}

function build(opts: {
  groups: KanbanPdfGroup[];
  columns: KanbanPdfColumn[];
  groupBy?: string;
}) {
  const { layout } = buildKanbanPdf(
    { jsPDF, autoTable: autoTable as unknown as (doc: any, opts: any) => void },
    {
      groups: opts.groups,
      columns: opts.columns,
      groupBy: opts.groupBy ?? "company",
      groupByLabel: GROUP_BY_LABEL,
      metaLines: ["Snapshot edge-case"],
    },
  );
  return normalizeLayout(layout);
}

// ── Zestawy kolumn dla skrajnych przypadków ─────────────────────────────────

const COLS_NORMAL: KanbanPdfColumn[] = [
  { label: "Tytuł", accessor: (t) => t.title, pdfWidth: 140 },
  { label: "Firma", accessor: (t) => t.company, pdfWidth: 100 },
  { label: "Termin", accessor: (t) => t.deadline, pdfWidth: 70 },
  { label: "Opis", accessor: (t) => t.description, pdfWidth: 320 },
];

/** Kolumna "Opis" o ekstremalnie dużej zadeklarowanej szerokości — autoTable musi ją zredukować. */
const COLS_OVERWIDE: KanbanPdfColumn[] = [
  { label: "Tytuł", accessor: (t) => t.title, pdfWidth: 80 },
  { label: "Firma", accessor: (t) => t.company, pdfWidth: 80 },
  { label: "Opis", accessor: (t) => t.description, pdfWidth: 1200 },
];

/** Bardzo wąska kolumna opisu — wymusza dużo zawijania linii. */
const COLS_NARROW: KanbanPdfColumn[] = [
  { label: "Tytuł", accessor: (t) => t.title, pdfWidth: 60 },
  { label: "Firma", accessor: (t) => t.company, pdfWidth: 60 },
  { label: "Termin", accessor: (t) => t.deadline, pdfWidth: 50 },
  { label: "Opis", accessor: (t) => t.description, pdfWidth: 50 },
];

// ── Generatory zadań z deterministyczną treścią ─────────────────────────────

const baseTask = (i: number, descLen: number) => ({
  title: `Zad-${String(i + 1).padStart(3, "0")}`,
  company: `Firma-${(i % 3) + 1}`,
  deadline: `2026-05-${String((i % 28) + 1).padStart(2, "0")}`,
  description: longText(descLen),
});

const tasks = (count: number, descParas: number) =>
  Array.from({ length: count }, (_, i) => baseTask(i, descParas));

// ── Testy ───────────────────────────────────────────────────────────────────

describe("buildKanbanPdf — snapshoty skrajnych przypadków (długie opisy / szerokości)", () => {
  it("snapshot: bardzo długie opisy (5 paragrafów × 6 zadań) — wieloliniowe wiersze", () => {
    const snap = build({
      groups: [{ label: "Long-Desc", tasks: tasks(6, 5) }],
      columns: COLS_NORMAL,
    });
    expect(snap).toMatchSnapshot();
  });

  it("snapshot: ekstremalnie długi pojedynczy opis (20 paragrafów × 2 zadania)", () => {
    const snap = build({
      groups: [{ label: "Mega-Desc", tasks: tasks(2, 20) }],
      columns: COLS_NORMAL,
    });
    expect(snap).toMatchSnapshot();
  });

  it("snapshot: ekstremalnie szeroka kolumna opis (pdfWidth=1200pt > strony) — autoTable musi przyciąć", () => {
    const snap = build({
      groups: [{ label: "Overwide", tasks: tasks(4, 2) }],
      columns: COLS_OVERWIDE,
    });
    expect(snap).toMatchSnapshot();
  });

  it("snapshot: bardzo wąskie kolumny + długi opis — agresywne zawijanie linii", () => {
    const snap = build({
      groups: [{ label: "Narrow", tasks: tasks(5, 3) }],
      columns: COLS_NARROW,
    });
    expect(snap).toMatchSnapshot();
  });

  it("snapshot: mieszanka krótkich i bardzo długich opisów w jednej grupie", () => {
    const mixed = [
      baseTask(0, 1),
      baseTask(1, 8),
      baseTask(2, 1),
      baseTask(3, 12),
      baseTask(4, 1),
      baseTask(5, 6),
    ];
    const snap = build({
      groups: [{ label: "Mixed-Desc", tasks: mixed }],
      columns: COLS_NORMAL,
    });
    expect(snap).toMatchSnapshot();
  });

  it("snapshot: opisy z polskimi znakami / emoji / wymuszonymi nowymi liniami", () => {
    const t = (i: number, desc: string) => ({
      title: `T-${i}`,
      company: "Firma-PL",
      deadline: "2026-05-15",
      description: desc,
    });
    const groups: KanbanPdfGroup[] = [
      {
        label: "Unicode",
        tasks: [
          t(1, "Żółć ąęśćźń — diakrytyki w pełnym zakresie. " + LOREM_PARAGRAPH),
          t(2, "Emoji 🔥🚒🧯 oraz strzałki ←→↑↓ i symbole §©®™."),
          t(3, "Wymuszone\nnowe\nlinie\nw\nopisie\nzadania."),
          t(4, "Mix: Żółć 🔥\nLinia 2 — bardzo długi tekst " + longText(3)),
        ],
      },
    ];
    const snap = build({ groups, columns: COLS_NORMAL });
    expect(snap).toMatchSnapshot();
  });

  it("snapshot: groupBy='none' + pojedyncze zadanie z gigantycznym opisem (50 paragrafów) — przeciąga tabelę przez wiele stron", () => {
    const snap = build({
      groups: [{ label: "wszystkie", tasks: tasks(1, 50) }],
      columns: COLS_NORMAL,
      groupBy: "none",
    });
    expect(snap).toMatchSnapshot();
    // Sanity: jedna sekcja, ale tabela rozciąga się na wiele stron.
    expect(snap.totalPages).toBeGreaterThan(1);
    expect(snap.sections[0].tablePageSpan).toBeGreaterThan(1);
  });

  it("snapshot: 2 grupy × duży opis — sprawdza zachowanie page-breaków przy wieloliniowych wierszach", () => {
    const snap = build({
      groups: [
        { label: "Grupa-A", tasks: tasks(8, 4) },
        { label: "Grupa-B", tasks: tasks(8, 4) },
      ],
      columns: COLS_NORMAL,
    });
    expect(snap).toMatchSnapshot();
    // Sanity: druga grupa musi zaczynać sekcję poprawnie (po tabeli A lub na nowej stronie).
    const [a, b] = snap.sections;
    if (b.page === a.tableEndPage) {
      // ten sam page → musi być gap ≥ tableToNextHeader z domyślnego spacing (18pt).
      expect(b.headerTop - a.tableFinalY).toBeGreaterThanOrEqual(17);
    } else {
      expect(b.startsNewPage).toBe(true);
    }
  });
});
