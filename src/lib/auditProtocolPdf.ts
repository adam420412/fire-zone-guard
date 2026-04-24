// =============================================================================
// auditProtocolPdf — generator PDF protokołu z checklisty audytowej (iter 8).
//
// Używa jsPDF + jspdf-autotable, mirror'uje styl pdfGenerator.ts.
// Zwraca Blob — nie zapisuje na dysk; ChecklistRunPage uploaduje to do storage.
//
// Zawartość:
//   - nagłówek FIRE ZONE
//   - tytuł szablonu + dane budynku
//   - tabela podsumowująca (#OK / #NIE OK / #N/D / #pending)
//   - punkt po punkcie z sekcjami; status + notatka + ile zdjęć
//   - podsumowanie audytora
//   - stopka z numerem strony
// =============================================================================
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import type { ChecklistRunWithItems } from "@/hooks/useChecklists";

const STATUS_PL: Record<string, string> = {
  ok: "OK",
  nie_ok: "NIE OK",
  na: "N/D",
  pending: "—",
};

const STATUS_RGB: Record<string, [number, number, number]> = {
  ok: [16, 185, 129],
  nie_ok: [220, 38, 38],
  na: [148, 163, 184],
  pending: [120, 120, 120],
};

export async function generateAuditProtocolPdf(
  run: ChecklistRunWithItems,
): Promise<Blob> {
  const doc = new jsPDF();

  // ---- HEADER ----
  doc.setFontSize(22);
  doc.setTextColor(220, 38, 38);
  doc.text("FIRE ZONE", 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text("OCHRONA PRZECIWPOŻAROWA", 14, 25);

  // ---- TITLE ----
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text("PROTOKÓŁ Z CHECKLISTY", 105, 35, { align: "center" });
  doc.setFontSize(13);
  doc.text(run.template_name, 105, 43, { align: "center" });

  // ---- METADATA ----
  doc.setFontSize(10);
  let y = 55;
  const meta: [string, string][] = [
    ["Obiekt:", run.building_name ?? "—"],
    ["Adres:", run.building_address ?? "—"],
    ["Wykonawca:", run.performer_name ?? "—"],
    ["Rozpoczęto:", run.started_at ? fmtDate(run.started_at) : "—"],
    ["Zakończono:", run.completed_at ? fmtDate(run.completed_at) : "—"],
    ["Kod szablonu:", run.template_code],
  ];
  for (const [label, value] of meta) {
    doc.setFont("", "bold");
    doc.text(label, 14, y);
    doc.setFont("", "normal");
    doc.text(value, 50, y);
    y += 6;
  }

  // ---- LICZNIKI ----
  const total = run.items.length;
  const counters = { ok: 0, nie_ok: 0, na: 0, pending: 0 };
  for (const it of run.items) {
    if (it.status in counters) counters[it.status as keyof typeof counters]++;
  }
  y += 4;
  autoTable(doc, {
    startY: y,
    head: [["Łącznie", "OK", "NIE OK", "N/D", "Do sprawdzenia"]],
    body: [[
      String(total),
      String(counters.ok),
      String(counters.nie_ok),
      String(counters.na),
      String(counters.pending),
    ]],
    theme: "grid",
    headStyles: { fillColor: [220, 38, 38], halign: "center" },
    styles: { fontSize: 9, halign: "center" },
  });
  y = (doc as any).lastAutoTable?.finalY ?? y + 20;

  // ---- ITEMY pogrupowane po sekcji ----
  // Konwertujemy do tabeli z sekcjami jako sub-headers.
  const order: string[] = [];
  const grouped: Record<string, typeof run.items> = {};
  for (const it of run.items) {
    const key = it.section ?? "Bez sekcji";
    if (!(key in grouped)) {
      grouped[key] = [];
      order.push(key);
    }
    grouped[key].push(it);
  }

  for (const section of order) {
    const items = grouped[section];
    y += 8;
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFont("", "bold");
    doc.setFontSize(11);
    doc.setTextColor(220, 38, 38);
    doc.text(section, 14, y);
    doc.setTextColor(0);
    doc.setFont("", "normal");
    y += 2;

    autoTable(doc, {
      startY: y + 2,
      head: [["#", "Punkt", "Status", "Notatka", "Foto"]],
      body: items.map((it, idx) => [
        String(idx + 1),
        it.label,
        STATUS_PL[it.status] ?? it.status,
        it.note ?? "",
        it.photo_urls.length > 0 ? `${it.photo_urls.length}` : "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: [55, 65, 81] },
      styles: { fontSize: 8, valign: "top", cellPadding: 1.5 },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 80 },
        2: { cellWidth: 22, halign: "center", fontStyle: "bold" },
        3: { cellWidth: 60 },
        4: { cellWidth: 12, halign: "center" },
      },
      didParseCell: (data) => {
        // koloruj komórkę "Status"
        if (data.column.index === 2 && data.section === "body") {
          const item = items[data.row.index];
          const rgb = STATUS_RGB[item.status];
          if (rgb) {
            data.cell.styles.textColor = rgb;
          }
        }
      },
    });
    y = (doc as any).lastAutoTable?.finalY ?? y + 20;
  }

  // ---- PODSUMOWANIE AUDYTORA ----
  if (run.summary) {
    y += 8;
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFont("", "bold");
    doc.setFontSize(11);
    doc.text("Podsumowanie audytora", 14, y);
    y += 6;
    doc.setFont("", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(run.summary, 180);
    doc.text(lines, 14, y);
    y += lines.length * 5;
  }

  // ---- INFO O AUTO-NAPRAWACH ----
  if (counters.nie_ok > 0) {
    y += 6;
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(
      `Wykryto ${counters.nie_ok} ${counters.nie_ok === 1 ? "punkt NIE OK" : "punktów NIE OK"} — utworzono odpowiednie zadania w module Naprawy.`,
      14, y,
    );
    doc.setTextColor(0);
  }

  // ---- STOPKA ----
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(
      `Wygenerowano automatycznie • Fire Zone • ${format(new Date(), "d MMM yyyy, HH:mm", { locale: pl })}`,
      14, 290,
    );
    doc.text(`Strona ${i} z ${pageCount}`, 195, 290, { align: "right" });
  }

  return doc.output("blob");
}

function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy, HH:mm", { locale: pl });
  } catch {
    return iso;
  }
}
