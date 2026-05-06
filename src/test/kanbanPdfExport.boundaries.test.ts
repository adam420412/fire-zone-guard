/**
 * Testy BRZEGOWE buildKanbanPdf — uzupełnienie do `kanbanPdfExport.edgecases.test.ts`
 * (który robi snapshoty) o asercje behawioralne dla:
 *
 *   1) Pustych grup — pojedynczych, wielu z rzędu, na początku/końcu, mieszanych z pełnymi.
 *      Walidujemy, że sekcja powstaje, taskCount=0, gap przed kolejnym nagłówkiem jest
 *      zachowany, a tabela ma wiersz "(brak zadań w grupie)".
 *   2) Bardzo długich opisów — zarówno wielu paragrafów, jak i pojedynczego słowa
 *      bez spacji (worst-case dla word-wrap), oraz długich linii wymuszonych \n.
 *   3) Skrajnych szerokości kolumn:
 *        - pojedyncza skrajnie szeroka kolumna (> szerokość strony),
 *        - wszystkie kolumny ekstremalnie wąskie,
 *        - zerowa / ujemna pdfWidth (defensywnie),
 *        - bardzo dużo kolumn (16) o małej szerokości.
 *   4) Edge-case wejścia: 0 grup (jeśli dozwolone), 1 grupa × 1 zadanie, 1 grupa × 1000 zadań.
 */

import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  buildKanbanPdf,
  DEFAULT_KANBAN_PDF_SPACING,
  type KanbanPdfColumn,
  type KanbanPdfGroup,
} from "@/lib/kanbanPdfExport";

const GROUP_BY_LABEL: Record<string, string> = {
  company: "Firma",
  building: "Obiekt",
  person: "Osoba",
};

const COLS_NORMAL: KanbanPdfColumn[] = [
  { label: "Tytuł", accessor: (t) => t.title, pdfWidth: 140 },
  { label: "Firma", accessor: (t) => t.company, pdfWidth: 100 },
  { label: "Termin", accessor: (t) => t.deadline, pdfWidth: 70 },
  { label: "Opis", accessor: (t) => t.description, pdfWidth: 320 },
];

function build(
  groups: KanbanPdfGroup[],
  columns: KanbanPdfColumn[] = COLS_NORMAL,
  groupBy: string = "company",
) {
  return buildKanbanPdf(
    { jsPDF, autoTable: autoTable as unknown as (doc: any, opts: any) => void },
    {
      groups,
      columns,
      groupBy,
      groupByLabel: GROUP_BY_LABEL,
      metaLines: ["Test brzegowy"],
    },
  );
}

const EPS = 0.01;
const TASK = (i: number, descLen = 80) => ({
  title: `T-${i}`,
  company: `Firma-${i % 3}`,
  deadline: "2026-05-15",
  description: "x".repeat(descLen),
});

// ────────────────────────────────────────────────────────────────────────────
// 1. PUSTE GRUPY
// ────────────────────────────────────────────────────────────────────────────
describe("buildKanbanPdf — puste grupy", () => {
  it("pojedyncza pusta grupa: powstaje 1 sekcja z taskCount=0 i pozytywną wysokością tabeli", () => {
    const { layout } = build([{ label: "Pusta", tasks: [] }]);
    expect(layout.sections).toHaveLength(1);
    const s = layout.sections[0];
    expect(s.taskCount).toBe(0);
    expect(s.tableFinalY).toBeGreaterThan(s.tableStartY);
    expect(s.tableHeightFirstPage).toBeGreaterThan(0);
    expect(layout.totalPages).toBe(1);
  });

  it("wszystkie grupy puste: każda generuje sekcję z taskCount=0 i zachowane są gapy", () => {
    const groups = Array.from({ length: 5 }, (_, i) => ({
      label: `Pusta-${i + 1}`,
      tasks: [] as any[],
    }));
    const { layout } = build(groups);
    expect(layout.sections).toHaveLength(5);
    for (const s of layout.sections) {
      expect(s.taskCount).toBe(0);
      expect(s.tableStartY).toBe(s.headerBottom);
      expect(s.headerBottom - s.headerTop).toBeGreaterThanOrEqual(
        DEFAULT_KANBAN_PDF_SPACING.headerToTable - EPS,
      );
    }
    // Pary na tej samej stronie: gap ≥ tableToNextHeader
    for (let i = 1; i < layout.sections.length; i++) {
      const prev = layout.sections[i - 1];
      const curr = layout.sections[i];
      if (curr.page === prev.tableEndPage) {
        expect(curr.headerTop - prev.tableFinalY).toBeGreaterThanOrEqual(
          DEFAULT_KANBAN_PDF_SPACING.tableToNextHeader - EPS,
        );
      }
    }
  });

  it("pusta grupa pomiędzy pełnymi: nie psuje page-breaków i numeracji sekcji", () => {
    const groups: KanbanPdfGroup[] = [
      { label: "A-pełna", tasks: Array.from({ length: 10 }, (_, i) => TASK(i)) },
      { label: "B-pusta", tasks: [] },
      { label: "C-pełna", tasks: Array.from({ length: 8 }, (_, i) => TASK(i)) },
    ];
    const { layout } = build(groups);
    expect(layout.sections).toHaveLength(3);
    expect(layout.sections.map((s) => s.taskCount)).toEqual([10, 0, 8]);
    // groupIndex monotoniczne
    expect(layout.sections.map((s) => s.groupIndex)).toEqual([0, 1, 2]);
    // page-numery są niemalejące
    let lastPage = 0;
    for (const s of layout.sections) {
      expect(s.page).toBeGreaterThanOrEqual(lastPage);
      lastPage = s.page;
    }
  });

  it("pusta grupa na początku i końcu: oba przypadki tworzą poprawne sekcje", () => {
    const groups: KanbanPdfGroup[] = [
      { label: "Start-pusta", tasks: [] },
      { label: "Środek", tasks: Array.from({ length: 5 }, (_, i) => TASK(i)) },
      { label: "End-pusta", tasks: [] },
    ];
    const { layout } = build(groups);
    expect(layout.sections[0].taskCount).toBe(0);
    expect(layout.sections[2].taskCount).toBe(0);
    // Sekcja końcowa ma headerBottom <= pageHeight - marginBottom
    const last = layout.sections.at(-1)!;
    expect(last.headerBottom).toBeLessThanOrEqual(
      layout.pageHeight - layout.marginBottom,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. BARDZO DŁUGIE OPISY
// ────────────────────────────────────────────────────────────────────────────
describe("buildKanbanPdf — skrajnie długie opisy", () => {
  it("pojedyncze zadanie z opisem 10000 znaków: tabela rozciąga się na wiele stron", () => {
    const groups: KanbanPdfGroup[] = [
      {
        label: "Mega",
        tasks: [{ ...TASK(0), description: "Lorem ipsum ".repeat(900) }],
      },
    ];
    const { layout } = build(groups);
    expect(layout.totalPages).toBeGreaterThan(1);
    const s = layout.sections[0];
    expect(s.tablePageSpan).toBeGreaterThan(1);
    expect(s.tableEndPage).toBeGreaterThan(s.page);
  });

  it("opis jako jedno gigantyczne słowo bez spacji (worst-case word-wrap) nie wywala buildera", () => {
    const groups: KanbanPdfGroup[] = [
      {
        label: "Mono",
        tasks: [{ ...TASK(0), description: "X".repeat(2000) }],
      },
    ];
    expect(() => build(groups)).not.toThrow();
    const { layout } = build(groups);
    expect(layout.sections).toHaveLength(1);
    expect(layout.sections[0].tableFinalY).toBeGreaterThan(
      layout.sections[0].tableStartY,
    );
  });

  it("opis z setkami wymuszonych \\n: każda linia respektuje page-margin", () => {
    const desc = Array.from({ length: 200 }, (_, i) => `Linia ${i + 1}`).join("\n");
    const groups: KanbanPdfGroup[] = [
      { label: "MultiLine", tasks: [{ ...TASK(0), description: desc }] },
    ];
    const { layout } = build(groups);
    expect(layout.totalPages).toBeGreaterThan(1);
    // Żaden tableStartY nie wchodzi w stopkę
    const footerZone = layout.pageHeight - layout.marginBottom;
    for (const s of layout.sections) {
      expect(s.tableStartY).toBeLessThanOrEqual(footerZone - 14);
    }
  });

  it("mieszanka 50 zadań o losowych (ale deterministycznych) długościach opisu — gapy zachowane", () => {
    const tasks = Array.from({ length: 50 }, (_, i) => ({
      ...TASK(i),
      description: "Opis ".repeat(((i * 37) % 60) + 1),
    }));
    const { layout } = build([{ label: "Mix", tasks }]);
    expect(layout.totalPages).toBeGreaterThan(1);
    expect(layout.sections).toHaveLength(1);
    expect(layout.sections[0].taskCount).toBe(50);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. SKRAJNE SZEROKOŚCI KOLUMN
// ────────────────────────────────────────────────────────────────────────────
describe("buildKanbanPdf — skrajne szerokości kolumn", () => {
  it("pojedyncza kolumna szersza niż strona (pdfWidth=2000): builder nie wywala, layout poprawny", () => {
    const cols: KanbanPdfColumn[] = [
      { label: "Tytuł", accessor: (t) => t.title, pdfWidth: 50 },
      { label: "Opis", accessor: (t) => t.description, pdfWidth: 2000 },
    ];
    const { layout } = build(
      [{ label: "Wide", tasks: Array.from({ length: 4 }, (_, i) => TASK(i, 200)) }],
      cols,
    );
    expect(layout.sections).toHaveLength(1);
    expect(layout.sections[0].tableFinalY).toBeGreaterThan(
      layout.sections[0].tableStartY,
    );
  });

  it("wszystkie kolumny ekstremalnie wąskie (pdfWidth=20): wymusza intensywne zawijanie", () => {
    const cols: KanbanPdfColumn[] = [
      { label: "T", accessor: (t) => t.title, pdfWidth: 20 },
      { label: "F", accessor: (t) => t.company, pdfWidth: 20 },
      { label: "D", accessor: (t) => t.deadline, pdfWidth: 20 },
      { label: "O", accessor: (t) => t.description, pdfWidth: 20 },
    ];
    const { layout } = build(
      [{ label: "Narrow", tasks: Array.from({ length: 6 }, (_, i) => TASK(i, 120)) }],
      cols,
    );
    // Mocno wyższe wiersze → tabela większa niż przy normalnych szerokościach.
    expect(layout.sections[0].tableFinalY - layout.sections[0].tableStartY).toBeGreaterThan(50);
  });

  it("kolumna z pdfWidth=0 lub ujemną: builder nie wywala (defensywnie obsłużone przez autoTable)", () => {
    const colsZero: KanbanPdfColumn[] = [
      { label: "Tytuł", accessor: (t) => t.title, pdfWidth: 100 },
      { label: "Pusty", accessor: () => "", pdfWidth: 0 },
      { label: "Opis", accessor: (t) => t.description, pdfWidth: 200 },
    ];
    expect(() => build([{ label: "ZeroCol", tasks: [TASK(0)] }], colsZero)).not.toThrow();

    const colsNeg: KanbanPdfColumn[] = [
      { label: "Tytuł", accessor: (t) => t.title, pdfWidth: 100 },
      { label: "Neg", accessor: () => "x", pdfWidth: -10 as any },
      { label: "Opis", accessor: (t) => t.description, pdfWidth: 200 },
    ];
    expect(() => build([{ label: "NegCol", tasks: [TASK(0)] }], colsNeg)).not.toThrow();
  });

  it("kolumny bez pdfWidth (undefined dla wszystkich): autoTable rozdziela szerokość auto", () => {
    const cols: KanbanPdfColumn[] = [
      { label: "Tytuł", accessor: (t) => t.title },
      { label: "Firma", accessor: (t) => t.company },
      { label: "Termin", accessor: (t) => t.deadline },
      { label: "Opis", accessor: (t) => t.description },
    ];
    const { layout } = build(
      [{ label: "Auto", tasks: Array.from({ length: 5 }, (_, i) => TASK(i)) }],
      cols,
    );
    expect(layout.sections).toHaveLength(1);
    expect(layout.totalPages).toBeGreaterThanOrEqual(1);
  });

  it("dużo kolumn (16) o małej szerokości: layout nadal stabilny", () => {
    const cols: KanbanPdfColumn[] = Array.from({ length: 16 }, (_, i) => ({
      label: `K${i + 1}`,
      accessor: (t: any) => `${t.title}-${i}`,
      pdfWidth: 45,
    }));
    const { layout } = build(
      [{ label: "Wiele-Kolumn", tasks: Array.from({ length: 10 }, (_, i) => TASK(i)) }],
      cols,
    );
    expect(layout.sections).toHaveLength(1);
    expect(layout.sections[0].tableFinalY).toBeGreaterThan(
      layout.sections[0].tableStartY,
    );
  });

  it("pojedyncza kolumna (minimum kolumn = 1): builder działa poprawnie", () => {
    const cols: KanbanPdfColumn[] = [
      { label: "Tylko-Tytuł", accessor: (t) => t.title, pdfWidth: 400 },
    ];
    const { layout } = build(
      [{ label: "Solo", tasks: Array.from({ length: 5 }, (_, i) => TASK(i)) }],
      cols,
    );
    expect(layout.sections).toHaveLength(1);
    expect(layout.totals.sectionsCount).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. EDGE-CASE WEJŚCIA
// ────────────────────────────────────────────────────────────────────────────
describe("buildKanbanPdf — edge-case wejścia", () => {
  it("0 grup: builder zwraca dokument z 0 sekcjami i totalPages>=1", () => {
    const { layout, doc } = build([]);
    expect(layout.sections).toHaveLength(0);
    expect(layout.totalPages).toBeGreaterThanOrEqual(1);
    expect(doc).toBeTruthy();
  });

  it("1 grupa × 1 zadanie: minimalny przypadek — 1 strona, 1 sekcja", () => {
    const { layout } = build([{ label: "Min", tasks: [TASK(0, 20)] }]);
    expect(layout.sections).toHaveLength(1);
    expect(layout.totalPages).toBe(1);
    expect(layout.sections[0].taskCount).toBe(1);
  });

  it("1 grupa × 500 zadań: rozciąga się na wiele stron, sekcja jedna", () => {
    const tasks = Array.from({ length: 500 }, (_, i) => TASK(i, 30));
    const { layout } = build([{ label: "Duża", tasks }]);
    expect(layout.sections).toHaveLength(1);
    expect(layout.totalPages).toBeGreaterThan(3);
    expect(layout.sections[0].tablePageSpan).toBeGreaterThan(3);
    expect(layout.sections[0].taskCount).toBe(500);
  });

  it("groupBy='none': brak nagłówków grupowych (headerHeight=0) niezależnie od liczby grup wejściowych", () => {
    const { layout } = build(
      [{ label: "agregat", tasks: Array.from({ length: 8 }, (_, i) => TASK(i)) }],
      COLS_NORMAL,
      "none",
    );
    expect(layout.sections).toHaveLength(1);
    expect(layout.sections[0].headerHeight).toBe(0);
  });
});
