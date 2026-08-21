/**
 * Testy strazujace sciezke "dodalem obiekt -> dodaje urzadzenia i uslugi".
 *
 * Zgloszenie: po dodaniu obiektu nie bylo jak dopisac urzadzen ppoz.
 * ani uslug (szkolenie, aktualizacja IBP), a przyciski na dole panelu
 * bocznego byly nieczytelne i nic nie dodawaly.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("dodanie obiektu prowadzi dalej", () => {
  const src = read("src/pages/BuildingsPage.tsx");

  it("po zapisaniu nowego obiektu przenosi na jego karte", () => {
    expect(src).toMatch(/onSuccess:\s*\(created: any\)\s*=>/);
    expect(src).toMatch(/navigate\(`\/buildings\/\$\{created\.id\}`\)/);
  });

  it("nadal nie zostawia dialogu otwartego po zapisie", () => {
    expect(src).toMatch(/onOpenChange\(false\)/);
  });
});

describe("karta obiektu pozwala zalozyc zlecenie", () => {
  const src = read("src/pages/BuildingDetailPage.tsx");

  it("ma przycisk 'Nowe zlecenie', a nie tylko zgloszenie usterki", () => {
    expect(src).toMatch(/Nowe zlecenie/);
    expect(src).toMatch(/setNewTaskOpen\(true\)/);
  });

  it("formularz zlecenia ma wybrany obiekt i firme", () => {
    const blok = src.slice(src.indexOf("Nowe zlecenie z karty obiektu"));
    expect(blok).toMatch(/open=\{newTaskOpen\}/);
    expect(blok).toMatch(/buildingId: id!/);
    expect(blok).toMatch(/companyId: building\.company_id/);
  });

  it("prowadzi do ewidencji urzadzen ppoz", () => {
    expect(src).toMatch(/navigate\(`\/buildings\/\$\{id\}\/devices`\)/);
  });
});

describe("panel boczny", () => {
  const src = read("src/components/ContextPanel.tsx");

  it("dolny pasek akcji nie chowa sie pod plakietka Lovable", () => {
    // Plakietka "Edit with Lovable" jest przyklejona do prawego dolnego rogu
    // i zaslaniala przyciski panelu.
    expect(src).toMatch(/pb-14/);
  });
});
