import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface PdfOptions {
  title: string;
  subtitle?: string;
  metadata: { label: string; value: string }[];
  tableColumns: string[];
  tableData: (string | number)[][];
  notes?: string;
  result?: string;
  filename: string;
}

export function generateReportPDF(options: PdfOptions) {
  const doc = new jsPDF();

  // Company Logo / Header (Placeholder for future actual image)
  doc.setFontSize(22);
  doc.setTextColor(220, 38, 38); // red-600 roughly
  doc.text("FIRE ZONE", 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("OCHRONA PRZECIWPOŻAROWA", 14, 25);

  // Main Title
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  doc.text(options.title, 105, 40, { align: "center" });

  if (options.subtitle) {
    doc.setFontSize(14);
    doc.text(options.subtitle, 105, 48, { align: "center" });
  }

  // Metadata block
  doc.setFontSize(11);
  let currentY = options.subtitle ? 60 : 55;
  options.metadata.forEach((item) => {
    doc.setFont('', 'bold');
    doc.text(`${item.label}:`, 14, currentY);
    doc.setFont('', 'normal');
    // Align values properly
    doc.text(item.value, 60, currentY);
    currentY += 7;
  });

  // Data Table
  currentY += 10;
  autoTable(doc, {
    startY: currentY,
    head: [options.tableColumns],
    body: options.tableData,
    theme: 'grid',
    headStyles: { fillColor: [220, 38, 38] }, // Red header to match brand
    styles: { fontSize: 9 },
  });

  // Post-table content
  const finalY = (doc as any).lastAutoTable.finalY || currentY + 30;
  
  if (options.notes) {
    doc.setFont('', 'bold');
    doc.text("Wnioski / Uwagi:", 14, finalY + 15);
    doc.setFont('', 'normal');
    
    // Auto wrap notes text
    const splitNotes = doc.splitTextToSize(options.notes, 180);
    doc.text(splitNotes, 14, finalY + 22);
  }

  if (options.result) {
    const resultY = finalY + (options.notes ? 40 : 20);
    doc.setFont('', 'bold');
    doc.text(`Wynik końcowy: `, 14, resultY);
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.text(options.result.toUpperCase(), 50, resultY);
  }

  // Footer (Page numbers)
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Strona ${i} z ${pageCount} - Wygenerowano w systemie Fire Zone Guard`,
      105,
      290,
      { align: "center" }
    );
  }

  doc.save(options.filename);
}
