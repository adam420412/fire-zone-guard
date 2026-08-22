/**
 * Walidacja NIP - suma kontrolna wg algorytmu MF.
 * Uzywana przy dodawaniu firm; zly NIP oznacza smieci w rejestrze klientow.
 */
import { describe, it, expect } from "vitest";
import { normalizeNip, validateNip } from "@/lib/nipLookup";

// NIP-y realnie wystepujace w bazie Fire Zone
const POPRAWNE = [
  "7810040816", // ENVIROTECH
  "7811975472", // FENIX VET
  "5223051451", // KONSTRPOL
  "7861735020", // KWASIZUR ENTERPRISE
  "9512520799", // NAPOLLO 41
  "6991966289", // SVI
];

describe("normalizeNip", () => {
  it("usuwa spacje, kropki, myslniki i podkreslniki", () => {
    expect(normalizeNip(" 781-004-08-16 ")).toBe("7810040816");
    expect(normalizeNip("781.004.08.16")).toBe("7810040816");
    expect(normalizeNip("781_004_0816")).toBe("7810040816");
  });

  it("radzi sobie z pustym wejsciem", () => {
    expect(normalizeNip("")).toBe("");
    expect(normalizeNip(undefined as unknown as string)).toBe("");
  });
});

describe("validateNip", () => {
  it.each(POPRAWNE)("przyjmuje poprawny NIP %s", (nip) => {
    expect(validateNip(nip)).toEqual({ ok: true });
  });

  it("przyjmuje NIP zapisany z myslnikami", () => {
    expect(validateNip("781-004-08-16")).toEqual({ ok: true });
  });

  it("odrzuca pusty", () => {
    const r = validateNip("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/pust/i);
  });

  it("odrzuca litery", () => {
    const r = validateNip("78100408AB");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cyfry/i);
  });

  it("odrzuca zla dlugosc i mowi ile podano", () => {
    const r = validateNip("781004081");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/10 cyfr.*9/);
  });

  it("odrzuca zla sume kontrolna", () => {
    // ostatnia cyfra podmieniona
    const r = validateNip("7810040817");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/suma kontrolna/i);
  });

  it("nie wywala sie na ciagach powtorzonych cyfr", () => {
    // Uwaga: 1111111111 i 0000000000 maja poprawna sume kontrolna wg
    // algorytmu MF - sam algorytm ich nie odrzuca i to jest zgodne z norma.
    for (const n of ["0000000000", "1111111111", "9999999999"]) {
      expect(typeof validateNip(n).ok).toBe("boolean");
    }
  });

  it("wykrywa bledny NIP obecny w bazie produkcyjnej (B&D Hotels)", () => {
    // Znalezione podczas przegladu: wartosc zapisana przy firmie
    // "B&D Hotels S.A." nie przechodzi sumy kontrolnej MF.
    // Test pilnuje, ze walidator to lapie - poprawa samych danych
    // jest po stronie uzytkownika.
    const r = validateNip("5220601116");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/suma kontrolna/i);
  });

  it("kazda pojedyncza podmiana cyfry psuje sume kontrolna albo daje reszte 10", () => {
    const bazowy = "7810040816";
    let wykrytych = 0;
    for (let i = 0; i < 10; i++) {
      for (let c = 0; c <= 9; c++) {
        if (Number(bazowy[i]) === c) continue;
        const zepsuty = bazowy.slice(0, i) + c + bazowy.slice(i + 1);
        if (!validateNip(zepsuty).ok) wykrytych++;
      }
    }
    // 90 wariantow; algorytm wagowy wykrywa kazda pojedyncza podmiane
    expect(wykrytych).toBe(90);
  });
});
