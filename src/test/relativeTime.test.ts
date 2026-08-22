/**
 * Testy formatowania dat. Ta warstwa decyduje o tym, co uzytkownik widzi
 * przy zadaniach i terminach ("wczoraj", "za 2 dni", "3 tyg. temu"),
 * a jest wrazliwa na strefe czasowa - Postgres oddaje daty bez strefy
 * ('2026-05-06'), ktore new Date() interpretuje jako polnoc UTC.
 */
import { describe, it, expect } from "vitest";
import { parseDbTimestamp, formatRelative, formatLocalDateTime } from "@/lib/relativeTime";

describe("parseDbTimestamp", () => {
  it("date-only z Postgresa czyta jako LOKALNA polnoc, nie UTC", () => {
    const d = parseDbTimestamp("2026-05-06")!;
    expect(d).not.toBeNull();
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // maj
    expect(d.getDate()).toBe(6);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("pelny ISO ze strefa zachowuje ten sam moment w czasie", () => {
    const d = parseDbTimestamp("2026-05-06T07:31:14Z")!;
    expect(d.toISOString()).toBe("2026-05-06T07:31:14.000Z");
  });

  it("przepuszcza obiekt Date", () => {
    const src = new Date("2026-01-02T03:04:05Z");
    expect(parseDbTimestamp(src)?.getTime()).toBe(src.getTime());
  });

  it("zwraca null dla pustych i niepoprawnych wejsc", () => {
    expect(parseDbTimestamp(null)).toBeNull();
    expect(parseDbTimestamp(undefined)).toBeNull();
    expect(parseDbTimestamp("")).toBeNull();
    expect(parseDbTimestamp("   ")).toBeNull();
    expect(parseDbTimestamp("zupelnie nie data")).toBeNull();
    expect(parseDbTimestamp(new Date("nieprawidlowa"))).toBeNull();
    expect(parseDbTimestamp(12345 as unknown as string)).toBeNull();
  });
});

describe("formatRelative", () => {
  const teraz = new Date(2026, 4, 6, 12, 0, 0); // 6 maja 2026, 12:00 lokalnie

  it("ponizej minuty", () => {
    expect(formatRelative(new Date(2026, 4, 6, 11, 59, 30), teraz)).toBe("przed chwilą");
    expect(formatRelative(new Date(2026, 4, 6, 12, 0, 30), teraz)).toBe("za chwilę");
  });

  it("ten sam dzien - minuty i godziny", () => {
    expect(formatRelative(new Date(2026, 4, 6, 11, 30), teraz)).toMatch(/30 min/);
    expect(formatRelative(new Date(2026, 4, 6, 9, 0), teraz)).toMatch(/3 godz/);
  });

  it("wczoraj i jutro liczone kalendarzowo, nie po 24h", () => {
    // 23:00 poprzedniego dnia to tylko 13 godzin, ale kalendarzowo "wczoraj"
    expect(formatRelative(new Date(2026, 4, 5, 23, 0), teraz)).toBe("wczoraj");
    expect(formatRelative(new Date(2026, 4, 7, 1, 0), teraz)).toBe("jutro");
  });

  it("dni w obrebie tygodnia", () => {
    expect(formatRelative(new Date(2026, 4, 3, 12, 0), teraz)).toMatch(/3 dni temu/);
    expect(formatRelative(new Date(2026, 4, 9, 12, 0), teraz)).toMatch(/za 3 dni/);
  });

  it("tygodnie", () => {
    expect(formatRelative(new Date(2026, 3, 22, 12, 0), teraz)).toMatch(/tyg/);
  });

  it("powyzej 30 dni pokazuje konkretna date", () => {
    const wynik = formatRelative(new Date(2026, 0, 15, 12, 0), teraz)!;
    expect(wynik).toMatch(/^\d{2}\.\d{2}\.\d{2}$/);
    expect(wynik).toContain("15");
  });

  it("date-only nie przeskakuje o dzien przez strefe czasowa", () => {
    // Klasyczny blad: '2026-05-06' parsowane jako UTC daje 5 maja w PL zima.
    expect(formatRelative("2026-05-06", new Date(2026, 4, 6, 12, 0))).not.toBe("wczoraj");
  });

  it("null dla braku daty", () => {
    expect(formatRelative(null, teraz)).toBeNull();
    expect(formatRelative("", teraz)).toBeNull();
  });
});

describe("formatLocalDateTime", () => {
  it("zwraca date z godzina", () => {
    const wynik = formatLocalDateTime(new Date(2026, 4, 6, 14, 32))!;
    expect(wynik).toMatch(/06\.05\.2026/);
    expect(wynik).toMatch(/14[:.]32/);
  });

  it("null dla braku daty", () => {
    expect(formatLocalDateTime(null)).toBeNull();
  });
});
