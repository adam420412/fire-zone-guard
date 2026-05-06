import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  buildKanbanPdf,
  type KanbanPdfColumn,
  type KanbanPdfGroup,
} from "@/lib/kanbanPdfExport";
import {
  serializeKanbanLayoutForExport,
  serializeKanbanLayoutToJsonString,
  isLayoutDiagnostic,
} from "@/lib/kanbanLayoutExport";

const COLUMNS: KanbanPdfColumn[] = [
  { label: "Tytuł", accessor: (t) => t.title, pdfWidth: 180 },
  { label: "Firma", accessor: (t) => t.company, pdfWidth: 120 },
  { label: "Opis", accessor: (t) => t.description, pdfWidth: 200 },
];

const makeTasks = (n: number, p: string) =>
  Array.from({ length: n }, (_, i) => ({
    title: `${p}-${i + 1}`,
    company: `${p} sp.`,
    description: "Opis testowy do generowania realnych wysokości komórek tabeli.",
  }));

const GROUPS: KanbanPdfGroup[] = [
  { label: "Alfa", tasks: makeTasks(8, "A") },
  { label: "Beta", tasks: makeTasks(14, "B") },
];

function build(diagnostics: boolean) {
  return buildKanbanPdf(
    { jsPDF, autoTable: autoTable as unknown as (doc: any, opts: any) => void },
    {
      groups: GROUPS,
      columns: COLUMNS,
      groupBy: "company",
      groupByLabel: { company: "Firma" },
      metaLines: ["test"],
      diagnostics,
    },
  );
}

describe("serializeKanbanLayoutForExport", () => {
  it("auto-detection: diagnostics:true → mode='diagnostic'", () => {
    const { layout } = build(true);
    expect(isLayoutDiagnostic(layout)).toBe(true);
    const out = serializeKanbanLayoutForExport(layout);
    expect(out._meta.mode).toBe("diagnostic");
    expect(out._meta.omittedFields).toEqual([]);
    expect(out._meta.omittedSectionFields).toEqual([]);
    expect(out.pages).toBeDefined();
    expect(out.totals).toBeDefined();
    // Pola sekcji obecne w komplecie.
    expect(out.sections[0]).toHaveProperty("headerHeight");
    expect(out.sections[0]).toHaveProperty("startsNewPage");
    expect(out.sections[0]).toHaveProperty("gapBeforeHeader");
  });

  it("auto-detection: diagnostics:false → mode='raw'", () => {
    const { layout } = build(false);
    expect(isLayoutDiagnostic(layout)).toBe(false);
    const out = serializeKanbanLayoutForExport(layout);
    expect(out._meta.mode).toBe("raw");
  });

  it("raw mode: zawiera tylko surowe pola sekcji, bez pages/totals", () => {
    const { layout } = build(false);
    const out = serializeKanbanLayoutForExport(layout);

    // Top-level — brak pages/totals.
    expect(out).not.toHaveProperty("pages");
    expect(out).not.toHaveProperty("totals");
    expect(out._meta.omittedFields).toEqual(["pages", "totals"]);

    // Surowe pola top-level pozostają.
    expect(out.pageWidth).toBe(layout.pageWidth);
    expect(out.pageHeight).toBe(layout.pageHeight);
    expect(out.spacing).toEqual(layout.spacing);
    expect(out.totalPages).toBe(layout.totalPages);

    // Sekcje — TYLKO surowe pola.
    const expectedKeys = [
      "groupIndex",
      "groupLabel",
      "page",
      "headerTop",
      "headerBottom",
      "tableStartY",
      "tableFinalY",
      "tableEndPage",
      "taskCount",
    ].sort();
    for (const s of out.sections) {
      expect(Object.keys(s as object).sort()).toEqual(expectedKeys);
    }

    // omittedSectionFields wymienia dokładnie pola pochodne.
    expect(out._meta.omittedSectionFields.sort()).toEqual(
      [
        "headerHeight",
        "tableHeightFirstPage",
        "tablePageSpan",
        "sectionHeightOnStartPage",
        "gapBeforeHeader",
        "startsNewPage",
        "indexOnPage",
      ].sort(),
    );
  });

  it("raw mode: _meta.hint wyjaśnia, jak uzyskać pełny raport", () => {
    const { layout } = build(false);
    const out = serializeKanbanLayoutForExport(layout);
    expect(out._meta.hint).toMatch(/diagnostics=false/i);
    expect(out._meta.hint).toMatch(/tryb diagnostyczny/i);
  });

  it("forceMode=raw na raporcie diagnostycznym wymusza okrojony eksport", () => {
    const { layout } = build(true);
    const out = serializeKanbanLayoutForExport(layout, { forceMode: "raw" });
    expect(out._meta.mode).toBe("raw");
    expect(out).not.toHaveProperty("pages");
    expect(out).not.toHaveProperty("totals");
    // Sekcje też okrojone.
    for (const s of out.sections) {
      expect(s).not.toHaveProperty("headerHeight");
      expect(s).not.toHaveProperty("startsNewPage");
    }
  });

  it("forceMode=diagnostic na surowym raporcie nie wymyśla danych (puste pages, zerowe totals)", () => {
    const { layout } = build(false);
    const out = serializeKanbanLayoutForExport(layout, { forceMode: "diagnostic" });
    expect(out._meta.mode).toBe("diagnostic");
    // Te pola zostaną wystawione jak są — zerowe — ale meta nadal mówi 'diagnostic'.
    expect(out.pages).toEqual([]);
    expect(out.totals?.totalHeaderHeight).toBe(0);
  });

  it("_meta zawiera schemaVersion, generator i ISO exportedAt", () => {
    const { layout } = build(true);
    const out = serializeKanbanLayoutForExport(layout, {
      exportedAt: "2026-05-06T10:00:00.000Z",
    });
    expect(out._meta.schemaVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(out._meta.generator).toContain("kanbanPdfExport");
    expect(out._meta.exportedAt).toBe("2026-05-06T10:00:00.000Z");
  });

  it("serializeKanbanLayoutToJsonString zwraca poprawny, sformatowany JSON", () => {
    const { layout } = build(false);
    const json = serializeKanbanLayoutToJsonString(layout);
    expect(json.startsWith("{")).toBe(true);
    expect(json).toContain('"_meta"');
    expect(json).toContain('"mode": "raw"');
    // Sformatowany (zawiera nowe linie i wcięcia).
    expect(json.includes("\n  ")).toBe(true);
    // Roundtrip parsable.
    const parsed = JSON.parse(json);
    expect(parsed._meta.mode).toBe("raw");
    expect(parsed.sections.length).toBe(layout.sections.length);
  });
});
