import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  buildKanbanPdf,
  type KanbanPdfColumn,
  type KanbanPdfGroup,
  type KanbanPdfLayoutReport,
} from "@/lib/kanbanPdfExport";

/**
 * Snapshot układu PDF (NIE binarnego pliku).
 *
 * Snapshotujemy strukturalny `KanbanPdfLayoutReport` zwracany przez
 * buildKanbanPdf, zaokrąglony do 1pt. Dzięki temu:
 *  - test jest deterministyczny (PDF binarnie zawiera timestamp/ID),
 *  - wykrywa każdą subtelną zmianę odstępów / paginacji,
 *  - przy intencjonalnej zmianie wystarczy `vitest -u` aby zaktualizować.
 */

const COLUMNS: KanbanPdfColumn[] = [
  { label: "Tytuł", accessor: (t) => t.title, pdfWidth: 180 },
  { label: "Firma", accessor: (t) => t.company, pdfWidth: 120 },
  { label: "Obiekt", accessor: (t) => t.building, pdfWidth: 120 },
  { label: "Osoba", accessor: (t) => t.assignee, pdfWidth: 100 },
  { label: "Termin", accessor: (t) => t.deadline, pdfWidth: 70 },
  { label: "Opis", accessor: (t) => t.description, pdfWidth: 200 },
];

const GROUP_BY_LABEL: Record<string, string> = {
  company: "Firma",
  building: "Obiekt",
  person: "Osoba",
};

// Deterministyczne dane (stała długość opisu, brak randomizacji).
const FIXED_DESCRIPTION =
  "Opis zadania o stałej długości na potrzeby snapshotów układu PDF.";

const makeTasks = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, i) => ({
    title: `${prefix}-zadanie-${String(i + 1).padStart(3, "0")}`,
    company: `${prefix}-Firma`,
    building: `${prefix}-Obiekt-${(i % 5) + 1}`,
    assignee: `${prefix}-Osoba-${(i % 3) + 1}`,
    deadline: `2026-05-${String((i % 28) + 1).padStart(2, "0")}`,
    description: FIXED_DESCRIPTION,
  }));

/** Zaokrąglenie wszystkich liczb w raporcie do 1pt — eliminuje szum FP. */
function normalizeLayout(layout: KanbanPdfLayoutReport) {
  const r = (n: number) => Math.round(n);
  return {
    pageWidth: r(layout.pageWidth),
    pageHeight: r(layout.pageHeight),
    marginTop: r(layout.marginTop),
    marginBottom: r(layout.marginBottom),
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
    })),
  };
}

function build(groups: KanbanPdfGroup[], groupBy: string) {
  const { layout } = buildKanbanPdf(
    { jsPDF, autoTable: autoTable as unknown as (doc: any, opts: any) => void },
    {
      groups,
      columns: COLUMNS,
      groupBy,
      groupByLabel: GROUP_BY_LABEL,
      metaLines: ["Snapshot test"],
    },
  );
  return normalizeLayout(layout);
}

describe("buildKanbanPdf — snapshot układu", () => {
  it("snapshot: 1 grupa × 5 zadań (mały zestaw, jedna strona)", () => {
    const snap = build(
      [{ label: "Małe", tasks: makeTasks(5, "S") }],
      "company",
    );
    expect(snap).toMatchSnapshot();
  });

  it("snapshot: 3 grupy × 8 zadań (mieści się na 1-2 stronach)", () => {
    const snap = build(
      [
        { label: "Alfa", tasks: makeTasks(8, "A") },
        { label: "Beta", tasks: makeTasks(8, "B") },
        { label: "Gamma", tasks: makeTasks(8, "C") },
      ],
      "company",
    );
    expect(snap).toMatchSnapshot();
  });

  it("snapshot: 5 grup × 15 zadań (wymusza wiele page-breaków)", () => {
    const snap = build(
      [
        { label: "G1", tasks: makeTasks(15, "G1") },
        { label: "G2", tasks: makeTasks(15, "G2") },
        { label: "G3", tasks: makeTasks(15, "G3") },
        { label: "G4", tasks: makeTasks(15, "G4") },
        { label: "G5", tasks: makeTasks(15, "G5") },
      ],
      "building",
    );
    expect(snap).toMatchSnapshot();
  });

  it("snapshot: 1 ogromna grupa bez grupowania (autoTable sam dzieli na strony)", () => {
    const snap = build(
      [{ label: "wszystkie", tasks: makeTasks(80, "X") }],
      "none",
    );
    expect(snap).toMatchSnapshot();
  });

  it("snapshot: grupy o mieszanej wielkości (1, 0, 25, 3, 12)", () => {
    const snap = build(
      [
        { label: "Singleton", tasks: makeTasks(1, "S") },
        { label: "Pusta", tasks: [] },
        { label: "Duża", tasks: makeTasks(25, "D") },
        { label: "Tri", tasks: makeTasks(3, "T") },
        { label: "Średnia", tasks: makeTasks(12, "M") },
      ],
      "person",
    );
    expect(snap).toMatchSnapshot();
  });
});
