import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  buildKanbanPdf,
  type KanbanPdfColumn,
  type KanbanPdfGroup,
} from "@/lib/kanbanPdfExport";

// Helper to fabricate N tasks
const makeTasks = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, i) => ({
    title: `${prefix} zadanie ${i + 1}`,
    company: `${prefix} sp. z o.o.`,
    building: `Obiekt ${prefix}-${i + 1}`,
    assignee: `Pracownik ${prefix}-${(i % 3) + 1}`,
    deadline: `2026-0${(i % 9) + 1}-15`,
    description:
      "Opis zadania, wystarczająco długi żeby zajmować realną wysokość komórki w tabeli i wymuszać paginację.",
  }));

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

function runBuild(groups: KanbanPdfGroup[], groupBy = "company") {
  return buildKanbanPdf(
    { jsPDF, autoTable: autoTable as unknown as (doc: any, opts: any) => void },
    {
      groups,
      columns: COLUMNS,
      groupBy,
      groupByLabel: GROUP_BY_LABEL,
      metaLines: [
        "Wygenerowano: 2026-05-06",
        "Filtry: status=wszystkie",
        "Liczba zadań: testowa",
      ],
    },
  );
}

describe("buildKanbanPdf — paginacja wielu grup", () => {
  it("nagłówek grupy nigdy nie nakłada się na startY tabeli", () => {
    const groups: KanbanPdfGroup[] = [
      { label: "Alfa", tasks: makeTasks(8, "A") },
      { label: "Beta", tasks: makeTasks(12, "B") },
      { label: "Gamma", tasks: makeTasks(20, "C") },
      { label: "Delta", tasks: makeTasks(15, "D") },
      { label: "Epsilon", tasks: makeTasks(25, "E") },
    ];

    const { layout } = runBuild(groups);

    expect(layout.sections).toHaveLength(groups.length);

    for (const s of layout.sections) {
      // Tabela musi się zaczynać NA LUB POD dolną krawędzią nagłówka (na tej samej stronie).
      expect(s.tableStartY).toBeGreaterThanOrEqual(s.headerBottom);
      // Nagłówek musi mieć dodatnią wysokość.
      expect(s.headerBottom).toBeGreaterThan(s.headerTop);
      // Tabela ma zawartość: jeśli skończyła na tej samej stronie, finalY rośnie;
      // jeśli przeszła na nową stronę, finalY jest mierzone od góry nowej strony.
      if (s.tableEndPage === s.page) {
        expect(s.tableFinalY).toBeGreaterThan(s.tableStartY);
      } else {
        expect(s.tableEndPage).toBeGreaterThan(s.page);
        expect(s.tableFinalY).toBeGreaterThanOrEqual(layout.marginTop);
      }
      // Nagłówek mieści się w obszarze użytkowym strony.
      expect(s.headerTop).toBeGreaterThanOrEqual(layout.marginTop - 1);
      expect(s.headerBottom).toBeLessThanOrEqual(layout.pageHeight - layout.marginBottom);
      // Tabela kończy się powyżej dolnego marginesu.
      expect(s.tableFinalY).toBeLessThanOrEqual(layout.pageHeight - layout.marginBottom + 1);
    }
  });

  it("kolejne grupy nie nakładają się: nagłówek następnej grupy zaczyna się pod końcem poprzedniej tabeli (lub na nowej stronie)", () => {
    const groups: KanbanPdfGroup[] = [
      { label: "Grupa-1", tasks: makeTasks(10, "G1") },
      { label: "Grupa-2", tasks: makeTasks(10, "G2") },
      { label: "Grupa-3", tasks: makeTasks(10, "G3") },
      { label: "Grupa-4", tasks: makeTasks(10, "G4") },
    ];

    const { layout } = runBuild(groups);

    for (let i = 1; i < layout.sections.length; i++) {
      const prev = layout.sections[i - 1];
      const curr = layout.sections[i];

      if (curr.page === prev.tableEndPage) {
        // Ta sama strona: nagłówek bieżącej grupy musi być pod końcem poprzedniej tabeli.
        expect(curr.headerTop).toBeGreaterThanOrEqual(prev.tableFinalY);
      } else {
        // Inna strona: nagłówek zaczyna się od marginesu górnego.
        expect(curr.page).toBeGreaterThan(prev.tableEndPage);
        expect(curr.headerTop).toBeGreaterThanOrEqual(layout.marginTop - 1);
      }
    }
  });

  it("wymusza nową stronę gdy w bieżącej zostało za mało miejsca na nagłówek + min. wiersz tabeli", () => {
    // Dużo małych grup wymusi co najmniej kilka page-breaków.
    const groups: KanbanPdfGroup[] = Array.from({ length: 10 }, (_, i) => ({
      label: `Sekcja-${i + 1}`,
      tasks: makeTasks(6, `S${i + 1}`),
    }));

    const { layout } = runBuild(groups);

    expect(layout.totalPages).toBeGreaterThan(1);

    // Żaden nagłówek nie może być narysowany w strefie stopki.
    const footerZone = layout.pageHeight - layout.marginBottom;
    for (const s of layout.sections) {
      expect(s.headerBottom).toBeLessThanOrEqual(footerZone);
      // I musi zostawić miejsce na minimum: nagłówek tabeli (~16) + 1 wiersz (~14)
      expect(s.tableStartY).toBeLessThanOrEqual(footerZone - 14);
    }
  });

  it("działa bez grupowania (groupBy='none') — jedna sekcja, brak nagłówka grupy", () => {
    const groups: KanbanPdfGroup[] = [
      { label: "wszystkie", tasks: makeTasks(30, "X") },
    ];

    const { layout } = runBuild(groups, "none");

    expect(layout.sections).toHaveLength(1);
    const s = layout.sections[0];
    // Brak nagłówka grupy => headerTop === headerBottom (zerowa wysokość).
    expect(s.headerBottom).toBe(s.headerTop);
    expect(s.tableStartY).toBeGreaterThanOrEqual(s.headerBottom);
    expect(s.tableFinalY).toBeGreaterThan(s.tableStartY);
  });

  it("obsługuje pustą grupę bez nakładania na sąsiednie sekcje", () => {
    const groups: KanbanPdfGroup[] = [
      { label: "Pełna", tasks: makeTasks(5, "P") },
      { label: "Pusta", tasks: [] },
      { label: "Kolejna", tasks: makeTasks(5, "K") },
    ];

    const { layout } = runBuild(groups);

    expect(layout.sections).toHaveLength(3);
    for (let i = 0; i < layout.sections.length; i++) {
      const s = layout.sections[i];
      expect(s.tableStartY).toBeGreaterThanOrEqual(s.headerBottom);
      if (s.tableEndPage === s.page) {
        expect(s.tableFinalY).toBeGreaterThan(s.tableStartY);
      }
      if (i > 0) {
        const prev = layout.sections[i - 1];
        if (s.page === prev.tableEndPage) {
          expect(s.headerTop).toBeGreaterThanOrEqual(prev.tableFinalY);
        }
      }
    }
  });
});
