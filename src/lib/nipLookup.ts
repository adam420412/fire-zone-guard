// Wyszukiwarka firmy w wykazie podatników VAT (Biała Lista MF)
// https://wl-api.mf.gov.pl/

export interface NipLookupResult {
  name: string;
  address: string;
  nip: string;
}

export async function fetchCompanyByNIP(nip: string): Promise<NipLookupResult> {
  const cleanNip = nip.replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(cleanNip)) {
    throw new Error("NIP musi mieć 10 cyfr.");
  }
  const today = new Date().toISOString().split("T")[0];
  const res = await fetch(`https://wl-api.mf.gov.pl/api/search/nip/${cleanNip}?date=${today}`);
  if (!res.ok) throw new Error("Błąd pobierania danych z Białej Listy.");
  const data = await res.json();
  const subject = data?.result?.subject;
  if (!subject) throw new Error("Nie znaleziono firmy o podanym NIP.");
  return {
    name: subject.name as string,
    address: (subject.workingAddress || subject.residenceAddress || "") as string,
    nip: cleanNip,
  };
}
