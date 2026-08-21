import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isUuid, asUuidOrNull } from "@/lib/uuid";

describe("isUuid / asUuidOrNull", () => {
  it("akceptuje poprawny UUID", () => {
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(asUuidOrNull("11111111-1111-4111-8111-111111111111"))
      .toBe("11111111-1111-4111-8111-111111111111");
  });

  it("odrzuca nazwe obiektu wpisana recznie", () => {
    expect(isUuid("Biurowiec Krakowska 12")).toBe(false);
    expect(asUuidOrNull("Biurowiec Krakowska 12")).toBeNull();
  });

  it("odrzuca pusty string, null i undefined", () => {
    expect(asUuidOrNull("")).toBeNull();
    expect(asUuidOrNull(null)).toBeNull();
    expect(asUuidOrNull(undefined)).toBeNull();
    expect(asUuidOrNull(123)).toBeNull();
  });
});

describe("publiczny formularz zgloszen", () => {
  const src = readFileSync(
    join(process.cwd(), "src/pages/PublicSlaIntakePage.tsx"),
    "utf8",
  );

  it("nie wysyla wolnego tekstu do kolumny building_id (uuid + FK)", () => {
    expect(src).toMatch(/building_id:\s*asUuidOrNull\(buildingId\)/);
    expect(src).not.toMatch(/building_id:\s*buildingId\s*\|\|\s*null/);
  });

  it("pole tekstowe fallbacku zapisuje do osobnego stanu", () => {
    // Gdy anonim nie widzi listy obiektow, input musi pisac do buildingText,
    // a nie nadpisywac buildingId nazwa budynku.
    const fallback = /placeholder="Nazwa lub adres obiektu"[\s\S]{0,500}?\/>/.exec(src);
    expect(fallback).not.toBeNull();
    expect(fallback![0]).toMatch(/setBuildingText/);
    expect(fallback![0]).not.toMatch(/setBuildingId/);
  });
});
