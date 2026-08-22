/**
 * Spojnosc slownikow UI z enumami w bazie oraz integralnosc danych
 * przewodnika workflow. Brakujaca etykieta = puste pole w interfejsie,
 * a nadmiarowa = pozycja, ktorej baza nie przyjmie.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  kanbanStatuses, taskTypeLabels, priorityColors, statusColors,
  safetyStatusConfig, taskTypes, priorities,
  DEVICE_CATEGORIES, DEVICE_TYPE_TO_CATEGORY, BUILDING_CLASSES,
} from "@/lib/constants";
import { PHASES, TUTORIAL_STEPS, FLOWS } from "@/lib/workflowSteps";
import { buildLastActivityTooltip } from "@/lib/lastActivity";

/** Wyciaga wartosci enuma prosto z migracji bazowej. */
function enumZBazy(nazwa: string): string[] {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20260218090315_e28a51c6-adfa-436c-a772-6638fa66c2ff.sql"),
    "utf8",
  );
  const m = new RegExp(`CREATE TYPE public\\.${nazwa} AS ENUM \\(([^)]+)\\)`).exec(sql);
  if (!m) throw new Error(`Nie znaleziono enuma ${nazwa} w migracji`);
  return m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
}

describe("slowniki zgodne z enumami w bazie", () => {
  it("statusy zadan pokrywaja sie co do wartosci i kolejnosci", () => {
    expect(kanbanStatuses).toEqual(enumZBazy("task_status"));
  });

  it("kazdy status ma kolor", () => {
    for (const s of enumZBazy("task_status")) {
      expect(Object.keys(statusColors)).toContain(s);
    }
  });

  it("kazdy typ zadania ma etykiete i pozycje na liscie wyboru", () => {
    const zBazy = enumZBazy("task_type");
    for (const t of zBazy) {
      expect(Object.keys(taskTypeLabels)).toContain(t);
      expect(taskTypes.map((x) => x.value)).toContain(t);
    }
    // i nic ponad to, czego baza nie przyjmie
    expect(Object.keys(taskTypeLabels).sort()).toEqual([...zBazy].sort());
  });

  it("kazdy priorytet ma kolor i pozycje na liscie wyboru", () => {
    const zBazy = enumZBazy("task_priority");
    for (const p of zBazy) {
      expect(Object.keys(priorityColors)).toContain(p);
      expect(priorities.map((x) => x.value)).toContain(p);
    }
    expect(Object.keys(priorityColors).sort()).toEqual([...zBazy].sort());
  });

  it("kazdy status bezpieczenstwa ma konfiguracje z etykieta i ikona", () => {
    for (const s of enumZBazy("safety_status")) {
      const conf = (safetyStatusConfig as any)[s];
      expect(conf, `brak konfiguracji dla ${s}`).toBeTruthy();
      expect(typeof conf.label).toBe("string");
      expect(conf.icon).toBeTruthy();
    }
  });
});

describe("slownik urzadzen ppoz", () => {
  it("kazda kategoria ma unikalny kod i nazwe", () => {
    const kody = DEVICE_CATEGORIES.map((c: any) => c.code);
    expect(new Set(kody).size).toBe(kody.length);
    for (const c of DEVICE_CATEGORIES as any[]) {
      expect(c.code).toBeTruthy();
      expect(c.name || c.label).toBeTruthy();
    }
  });

  it("mapa typ -> kategoria wskazuje wylacznie na istniejace kategorie", () => {
    const kody = new Set(DEVICE_CATEGORIES.map((c: any) => c.code));
    for (const [typ, kod] of Object.entries(DEVICE_TYPE_TO_CATEGORY)) {
      expect(kody.has(kod), `typ ${typ} wskazuje na nieznana kategorie ${kod}`).toBe(true);
    }
  });

  it("klasy budynku maja unikalne wartosci", () => {
    const v = BUILDING_CLASSES.map((b) => b.value);
    expect(new Set(v).size).toBe(v.length);
  });
});

describe("przewodnik workflow", () => {
  it("fazy maja unikalne identyfikatory", () => {
    const ids = PHASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("zaleznosci miedzy fazami wskazuja na istniejace fazy", () => {
    const ids = new Set(PHASES.map((p) => p.id));
    for (const p of PHASES) {
      for (const r of p.requires ?? []) {
        expect(ids.has(r), `faza ${p.id} wymaga nieistniejacej ${r}`).toBe(true);
      }
    }
  });

  it("zadna faza nie wymaga sama siebie", () => {
    for (const p of PHASES) {
      expect(p.requires ?? []).not.toContain(p.id);
    }
  });

  it("kazda faza ma cel, ikone i co najmniej jedno zadanie", () => {
    for (const p of PHASES) {
      expect(p.title).toBeTruthy();
      expect(p.goal).toBeTruthy();
      expect(p.icon).toBeTruthy();
      expect(p.tasks.length).toBeGreaterThan(0);
    }
  });

  it("sciezki w zadaniach zaczynaja sie od ukosnika", () => {
    for (const p of PHASES) {
      for (const t of p.tasks) {
        if (t.path) expect(t.path.startsWith("/"), `${p.id}: ${t.path}`).toBe(true);
      }
    }
  });

  it("kroki samouczka i diagramy maja unikalne identyfikatory", () => {
    const kroki = TUTORIAL_STEPS.map((s: any) => s.id);
    expect(new Set(kroki).size).toBe(kroki.length);
    const flows = FLOWS.map((f: any) => f.id ?? f.title);
    expect(new Set(flows).size).toBe(flows.length);
  });
});

describe("ostatnia aktywnosc zadania", () => {
  it("wygrywa nowsza z dwoch dat", () => {
    const i = buildLastActivityTooltip({
      created_at: "2026-01-01T10:00:00Z",
      quoteUpdatedAt: "2026-02-01T10:00:00Z",
    });
    expect(i.source).toBe("quote");
    expect(i.winnerLabel).toBe("Aktualizacja oferty");
  });

  it("gdy oferta jest starsza, wygrywa utworzenie zadania", () => {
    const i = buildLastActivityTooltip({
      created_at: "2026-03-01T10:00:00Z",
      quoteUpdatedAt: "2026-02-01T10:00:00Z",
    });
    expect(i.source).toBe("created");
    expect(i.winnerLabel).toBe("Utworzenie zadania");
  });

  it("brak obu dat daje stan 'none' bez wysypki", () => {
    const i = buildLastActivityTooltip({});
    expect(i.source).toBe("none");
    expect(i.winnerLabel).toBe("Brak danych");
    expect(i.winnerRelative).toBeNull();
    expect(i.tooltip).toContain("Brak danych");
  });

  it("tooltip zawsze wymienia obie pozycje", () => {
    const i = buildLastActivityTooltip({ created_at: "2026-01-01T10:00:00Z" });
    expect(i.tooltip).toContain("Utworzenie zadania");
    expect(i.tooltip).toContain("Aktualizacja oferty");
    expect(i.tooltip).toContain("—"); // brakujaca data oznaczona myslnikiem
  });
});
