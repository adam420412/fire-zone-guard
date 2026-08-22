/**
 * Testy strazujace ewidencje pozycji cyklicznych obiektu i publiczny
 * formularz zgloszen.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("wlasne pozycje cykliczne obiektu", () => {
  it("hook zapisuje szablon przypisany do obiektu, nie globalny", () => {
    const src = read("src/hooks/useBuildingData.ts");
    expect(src).toMatch(/export function useCreateTaskTemplate/);
    expect(src).toMatch(/export function useDeleteTaskTemplate/);
    const blok = src.slice(src.indexOf("useCreateTaskTemplate"), src.indexOf("useDeleteTaskTemplate"));
    expect(blok).toMatch(/building_id: input\.building_id/);
    expect(blok).toMatch(/is_global: false/);
    expect(blok).toMatch(/recurrence_days: input\.recurrence_days/);
  });

  it("karta obiektu ma przycisk dodania pozycji i formularz", () => {
    const src = read("src/pages/BuildingDetailPage.tsx");
    expect(src).toMatch(/Nowa pozycja cykliczna/);
    expect(src).toMatch(/setNewTemplateOpen\(true\)/);
    expect(src).toMatch(/createTemplate\.mutateAsync\(\{\s*building_id: id!/);
  });

  it("nie pozwala skasowac pozycji globalnej", () => {
    const src = read("src/pages/BuildingDetailPage.tsx");
    expect(src).toMatch(/canEditBuilding && !tpl\.is_global/);
  });

  it("pusty stan podpowiada, co tu wpisac", () => {
    const src = read("src/pages/BuildingDetailPage.tsx");
    expect(src).toMatch(/aktualizacja IBP/i);
  });
});

describe("publiczny formularz zgloszen", () => {
  it("anonimowy zapis nie prosi o zwrotke z bazy", () => {
    const src = read("src/hooks/useSlaTickets.ts");
    // tylko galaz anonimowa, bez galezi dla zalogowanego uzytkownika
    const start = src.indexOf("if (!user) {");
    const end = src.indexOf("ticket_number: null", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const blok = src.slice(start, end);
    expect(blok).toMatch(/insert\(payload\)/);
    // brak .select() w sciezce anonimowej - inaczej Postgres sprawdza
    // polityki SELECT przy RETURNING i wycofuje cale zgloszenie
    expect(blok).not.toMatch(/\.select\(\)/);
  });

  it("ekran sukcesu radzi sobie bez numeru zgloszenia", () => {
    const src = read("src/pages/PublicSlaIntakePage.tsx");
    expect(src).toMatch(/number: string \| null; id: string \| null/);
    expect(src).not.toMatch(/submitted\.id\.slice/);
  });
});

describe("migracja utwardzajaca funkcje automatyzacji", () => {
  const plik = "20260821170000_trigger_search_path.sql";

  it("istnieje", () => {
    expect(readdirSync(join(process.cwd(), "supabase/migrations"))).toContain(plik);
  });

  it("ustawia search_path na czterech funkcjach i weryfikuje wynik", () => {
    const sql = read(`supabase/migrations/${plik}`);
    for (const fn of ["fzg_on_task_insert", "fzg_on_task_update",
                      "fzg_on_sla_ticket_insert", "fzg_on_audit_insert"]) {
      expect(sql).toContain(fn);
    }
    expect(sql).toMatch(/ALTER FUNCTION/i);
    expect(sql).toMatch(/RAISE EXCEPTION/i);
    expect(sql).toMatch(/prosecdef/);
  });
});
