// =============================================================================
// trainingCertificates — helpery: upload podpisu (data URL → storage) oraz
// generowanie PDF certyfikatu uczestnictwa w szkoleniu PPOŻ.
// =============================================================================
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

const BUCKET = "protocol-signatures";

// ----- Upload podpisu (base64 PNG → bucket) ----------------------------------
export async function uploadSignature(
  dataUrl: string,
  folder: "trainer" | "participant",
  ownerId: string,
): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `trainings/${folder}/${ownerId}_${Date.now()}.png`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/png", upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ----- Dane do certyfikatu ---------------------------------------------------
export interface CertificateData {
  participantName: string;
  trainingTitle: string;
  trainingType: string;       // ludzka etykieta
  buildingName: string;
  buildingAddress?: string | null;
  performedAt: string;        // ISO
  durationMinutes?: number | null;
  trainerName?: string | null;
  trainerSignatureUrl?: string | null;
  participantSignatureUrl?: string | null;
  certificateNumber?: string;
}

// ----- Generuj i pobierz PDF -------------------------------------------------
export async function generateAndDownloadCertificate(d: CertificateData) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  // Ramka
  doc.setDrawColor(180, 30, 30);
  doc.setLineWidth(2);
  doc.rect(8, 8, w - 16, h - 16);
  doc.setLineWidth(0.4);
  doc.rect(11, 11, w - 22, h - 22);

  // Nagłówek
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(120, 20, 20);
  doc.text("CERTYFIKAT UCZESTNICTWA", w / 2, 32, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text("w szkoleniu z zakresu ochrony przeciwpozarowej", w / 2, 40, { align: "center" });

  if (d.certificateNumber) {
    doc.setFontSize(10);
    doc.text(`Nr: ${d.certificateNumber}`, w / 2, 46, { align: "center" });
  }

  // Imie i nazwisko
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
  doc.text("Niniejszym zaswiadcza sie, ze:", w / 2, 60, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(stripDiacritics(d.participantName), w / 2, 72, { align: "center" });

  // Opis
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  const desc1 = "ukonczyl(a) szkolenie w zakresie:";
  doc.text(desc1, w / 2, 84, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(stripDiacritics(`"${d.trainingTitle}"`), w / 2, 93, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(stripDiacritics(`Typ: ${d.trainingType}`), w / 2, 100, { align: "center" });

  // Miejsce / data
  const placeLine = stripDiacritics(
    `Miejsce: ${d.buildingName}${d.buildingAddress ? `, ${d.buildingAddress}` : ""}`,
  );
  doc.text(placeLine, w / 2, 110, { align: "center" });

  const performedLabel = format(new Date(d.performedAt), "d MMMM yyyy", { locale: pl });
  let when = stripDiacritics(`Data szkolenia: ${performedLabel}`);
  if (d.durationMinutes) when += stripDiacritics(`  ·  Czas trwania: ${d.durationMinutes} min`);
  doc.text(when, w / 2, 117, { align: "center" });

  // Podpisy
  const lineY = h - 40;
  const trainerX = w / 4;
  const partX = (w * 3) / 4;

  // Podpis trenera
  if (d.trainerSignatureUrl) {
    try {
      const img = await urlToDataUrl(d.trainerSignatureUrl);
      doc.addImage(img, "PNG", trainerX - 30, lineY - 22, 60, 20);
    } catch { /* ignore */ }
  }
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.3);
  doc.line(trainerX - 35, lineY, trainerX + 35, lineY);
  doc.setFontSize(10);
  doc.text(stripDiacritics(d.trainerName || "Prowadzacy"), trainerX, lineY + 5, { align: "center" });
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("Podpis prowadzacego", trainerX, lineY + 10, { align: "center" });

  // Podpis uczestnika
  doc.setTextColor(40, 40, 40);
  if (d.participantSignatureUrl) {
    try {
      const img = await urlToDataUrl(d.participantSignatureUrl);
      doc.addImage(img, "PNG", partX - 30, lineY - 22, 60, 20);
    } catch { /* ignore */ }
  }
  doc.line(partX - 35, lineY, partX + 35, lineY);
  doc.setFontSize(10);
  doc.text(stripDiacritics(d.participantName), partX, lineY + 5, { align: "center" });
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("Podpis uczestnika", partX, lineY + 10, { align: "center" });

  // Stopka
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    stripDiacritics(`Wygenerowano: ${format(new Date(), "d MMM yyyy, HH:mm", { locale: pl })} · Fire Zone`),
    w / 2,
    h - 14,
    { align: "center" },
  );

  const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
  doc.save(`certyfikat_${safe(d.participantName)}_${safe(d.trainingTitle)}.pdf`);
}

// jsPDF z domyslna czcionka nie wspiera polskich znakow → odsuwamy diakrytyki.
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l").replace(/Ł/g, "L");
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
