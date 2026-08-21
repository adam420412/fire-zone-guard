/**
 * Testy strazujace dostepnosc karty obiektu.
 *
 * Zgloszenie: "wchodze na obiekt i nie ma opcji dodawania urzadzen ppoz",
 * "klikam nowe zlecenie i przenosi mnie do kanbana".
 *
 * Przyczyna nie byla brakiem funkcji - ewidencja urzadzen istnieje i dziala.
 * Kafelek na liscie obiektow otwieral wylacznie panel boczny, a panel nie
 * mial zadnego wejscia do karty obiektu (poza linkiem ukrytym za warunkiem
 * "wiecej niz 4 urzadzenia po terminie"). Karta byla wiec osiagalna
 * praktycznie tylko przez Mape obiektow.
 *
 * Testy sa na zrodlach - pilnuja, zeby ta droga nie zniknela ponownie.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("lista obiektow", () => {
  const src = read("src/pages/BuildingsPage.tsx");

  it("kafelek obiektu prowadzi do karty obiektu, a nie tylko do panelu", () => {
    expect(src).toMatch(/onClick=\{\(\)\s*=>\s*navigate\(`\/buildings\/\$\{building\.id\}`\)\}/);
    expect(src).not.toMatch(/onClick=\{\(\)\s*=>\s*openPanel\("building"/);
  });

  it("nie zostawia martwego odwolania do panelu kontekstowego", () => {
    expect(src).not.toMatch(/openPanel/);
    expect(src).not.toMatch(/useContextPanel/);
  });
});

describe("panel kontekstowy obiektu", () => {
  const src = read("src/components/ContextPanel.tsx");

  it("ma wejscie do karty obiektu widoczne zawsze, nie tylko przy zaleglych urzadzeniach", () => {
    expect(src).toMatch(/Otwórz kartę obiektu/);
    expect(src).toMatch(/navigate\(`\/buildings\/\$\{buildingId\}`\)/);
  });

  it("przycisk 'Zlecenie' otwiera formularz zamiast przerzucac na Kanban", () => {
    // Ikona plusa musi znaczyc "utworz", a nie "przejdz gdzie indziej".
    expect(src).toMatch(/onClick=\{\(\)\s*=>\s*setCreateTaskOpen\(true\)\}/);
    expect(src).toMatch(/<CreateTaskDialog/);
    expect(src).toMatch(/defaultValues=\{\{\s*buildingId\s*\}\}/);
  });

  it("nie przerzuca juz na Kanban z przycisku tworzenia zlecenia", () => {
    const akcje = src.slice(src.indexOf("{/* Akcje */}"));
    expect(akcje).not.toMatch(/navigate\(`\/kanban/);
  });

  it("linki do zlecen sa filtrowane po obiekcie", () => {
    // Tylko sekcja obiektu - TaskContent ma wlasny link do tablicy i to jest OK.
    const start = src.indexOf("function BuildingContent");
    const end = src.indexOf("function CompanyContent");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const sekcjaObiektu = src.slice(start, end);
    expect(sekcjaObiektu).not.toMatch(/to="\/kanban"/);
    expect(sekcjaObiektu).toMatch(/to=\{`\/kanban\?building=\$\{buildingId\}`\}/);
  });
});

describe("karta obiektu prowadzi do ewidencji urzadzen", () => {
  it("BuildingDetailPage ma przejscie do /buildings/:id/devices", () => {
    const src = read("src/pages/BuildingDetailPage.tsx");
    expect(src).toMatch(/navigate\(`\/buildings\/\$\{id\}\/devices`\)/);
  });

  it("trasa ewidencji urzadzen jest zarejestrowana", () => {
    const src = read("src/App.tsx");
    expect(src).toMatch(/path="\/buildings\/:id\/devices"/);
    expect(src).toMatch(/path="\/buildings\/:id"/);
  });
});
