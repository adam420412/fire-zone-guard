// Wyszukiwarka firmy w wykazie podatników VAT (Biała Lista MF)
// + uzupełnienie danych z KRS (Ministerstwo Sprawiedliwości)
// https://wl-api.mf.gov.pl/  |  https://api-krs.ms.gov.pl/

export interface NipLookupResult {
  name: string;
  address: string;
  nip: string;
  regon?: string;
  krs?: string;
  legalForm?: string;
  registrationDate?: string;
  source: "biala-lista" | "biala-lista+krs";
}

/** Czyści NIP z białych znaków, kropek i myślników. */
export function normalizeNip(nip: string): string {
  return (nip || "").replace(/[\s.\-_]/g, "");
}

/** Walidacja formatu (10 cyfr) i sumy kontrolnej NIP. */
export function validateNip(nip: string): { ok: true } | { ok: false; reason: string } {
  const clean = normalizeNip(nip);
  if (!clean) return { ok: false, reason: "Pole NIP jest puste." };
  if (!/^\d+$/.test(clean)) return { ok: false, reason: "NIP może zawierać wyłącznie cyfry." };
  if (clean.length !== 10) return { ok: false, reason: `NIP musi mieć dokładnie 10 cyfr (podano ${clean.length}).` };

  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(clean[i]), 0);
  const checksum = sum % 11;
  if (checksum === 10) return { ok: false, reason: "NIP jest nieprawidłowy (suma kontrolna = 10)." };
  if (checksum !== Number(clean[9])) return { ok: false, reason: "Nieprawidłowa suma kontrolna NIP." };
  return { ok: true };
}

/** Pobiera dodatkowe dane z rejestru KRS (rejestr przedsiębiorców). */
async function fetchKrsDetails(krs: string): Promise<Partial<NipLookupResult> | null> {
  const padded = krs.padStart(10, "0");
  for (const rejestr of ["P", "S"]) {
    try {
      const res = await fetch(
        `https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${padded}?rejestr=${rejestr}&format=json`,
      );
      if (!res.ok) continue;
      const data = await res.json();
      const dane = data?.odpis?.dane?.dzial1?.danePodmiotu;
      const naglowek = data?.odpis?.naglowekA;
      if (!dane) continue;
      return {
        regon: dane?.identyfikatory?.regon,
        legalForm: dane?.formaPrawna,
        krs: padded,
        registrationDate: naglowek?.dataRejestracjiWKRS,
      };
    } catch {
      // ignoruj — KRS jest fallbackiem
    }
  }
  return null;
}

/** Główna funkcja: pobiera firmę po NIP z Białej Listy + uzupełnia z KRS. */
export async function fetchCompanyByNIP(nip: string): Promise<NipLookupResult> {
  const v = validateNip(nip);
  if (!v.ok) throw new Error(v.reason);

  const cleanNip = normalizeNip(nip);
  const today = new Date().toISOString().split("T")[0];

  let res: Response;
  try {
    res = await fetch(`https://wl-api.mf.gov.pl/api/search/nip/${cleanNip}?date=${today}`);
  } catch {
    throw new Error("Brak połączenia z rejestrem Biała Lista MF.");
  }
  if (res.status === 400) throw new Error("Biała Lista odrzuciła zapytanie (zły format NIP).");
  if (res.status === 429) throw new Error("Przekroczono limit zapytań do Białej Listy. Spróbuj za chwilę.");
  if (!res.ok) throw new Error(`Błąd Białej Listy (HTTP ${res.status}).`);

  const data = await res.json();
  const subject = data?.result?.subject;
  if (!subject) throw new Error("Nie znaleziono firmy o podanym NIP w Białej Liście MF.");

  const base: NipLookupResult = {
    name: subject.name as string,
    address: (subject.workingAddress || subject.residenceAddress || "") as string,
    nip: cleanNip,
    regon: subject.regon,
    krs: subject.krs,
    source: "biala-lista",
  };

  if (subject.krs) {
    const krsDetails = await fetchKrsDetails(subject.krs);
    if (krsDetails) {
      return { ...base, ...krsDetails, source: "biala-lista+krs" };
    }
  }
  return base;
}
