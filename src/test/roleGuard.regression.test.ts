/**
 * Testy strazujace strony chronione rola (/admin, /admin/import).
 *
 * Objaw: wejscie na /admin z paska adresu wyrzucalo super_admina na pulpit,
 * choc wejscie tam z menu w aplikacji dzialalo poprawnie.
 *
 * Przyczyna: na zimnym starcie zapytanie o role potrafi trafic w moment
 * odswiezania tokena i wrocic bledem. Kod traktowal blad jak "brak roli",
 * ustawial role = null i oznaczal ja jako gotowa - a straz w AdminPage
 * przekierowywala, zanim poprawna rola zdazyla dojechac.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("useAuth - blad zapytania o role", () => {
  const src = read("src/hooks/useAuth.tsx");

  it("ponawia zapytanie zamiast uznac blad za brak roli", () => {
    expect(src).toMatch(/ROLE_MAX_ATTEMPTS/);
    expect(src).toMatch(/fetchRole\(userId,\s*attempt\s*\+\s*1\)/);
  });

  it("przy bledzie nie oznacza roli jako gotowej", () => {
    const blok = src.slice(src.indexOf("if (roleError)"), src.indexOf("setRole(pickPrimaryRole"));
    expect(blok).toMatch(/return;/);
    expect(blok).not.toMatch(/setRoleReady\(true\)/);
  });

  it("ma bezpiecznik, ktory i tak odblokuje UI", () => {
    expect(src).toMatch(/ROLE_TIMEOUT_MS/);
  });
});

describe("strony chronione rola", () => {
  for (const plik of ["src/pages/AdminPage.tsx", "src/pages/BulkImportPage.tsx"]) {
    it(`${plik} nie przekierowuje, dopoki trwa ustalanie tozsamosci`, () => {
      const src = read(plik);
      const idxLoading = src.indexOf("authLoading");
      const idxRedirect = src.indexOf('role !== "super_admin"');
      expect(idxLoading).toBeGreaterThan(-1);
      expect(idxRedirect).toBeGreaterThan(-1);
      // straz na loading MUSI stac przed przekierowaniem
      expect(idxLoading).toBeLessThan(idxRedirect);
      expect(src).toMatch(/loading:\s*authLoading/);
    });
  }
});
