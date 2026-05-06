/**
 * Custom matchery Vitest dla snapshotów `KanbanPdfLayoutReport`.
 *
 * 1) `toMatchKanbanLayoutSnapshot()` — działa jak `toMatchSnapshot`, ale przy
 *    niezgodności zamiast surowego JSON-diffa drukuje czytelny raport
 *    różnic z `diffKanbanLayouts` (groupowane: geometria / strony / sekcje).
 *
 * 2) `toMatchKanbanLayout(expected)` — porównanie ad-hoc dwóch obiektów layoutu
 *    z tym samym czytelnym raportem różnic w komunikacie błędu.
 */

import { expect } from "vitest";
import {
  diffKanbanLayouts,
  type AnyLayoutSnapshot,
} from "@/test/utils/kanbanLayoutDiff";

declare module "vitest" {
  interface Assertion<T = any> {
    toMatchKanbanLayoutSnapshot(hint?: string): T;
    toMatchKanbanLayout(expected: AnyLayoutSnapshot): T;
  }
  interface AsymmetricMatchersContaining {
    toMatchKanbanLayoutSnapshot(hint?: string): unknown;
    toMatchKanbanLayout(expected: AnyLayoutSnapshot): unknown;
  }
}

expect.extend({
  toMatchKanbanLayoutSnapshot(received: AnyLayoutSnapshot, hint?: string) {
    // Delegujemy do natywnego toMatchSnapshot — przechwytujemy jego wynik.
    try {
      // @ts-expect-error — `this` ma pełny kontekst matchera Vitest.
      const result = (expect(received) as any).toMatchSnapshot(hint);
      // Synchroniczny przebieg: jeśli nie rzuciło, snapshot się zgadza.
      return {
        pass: true,
        message: () => "snapshot zgadza się",
      };
    } catch (err: any) {
      // Próbujemy wyciągnąć "expected" snapshot z wiadomości błędu Vitest, jeśli to możliwe.
      // Jeżeli się nie uda — zwracamy oryginalny komunikat + hint do regeneracji.
      const original = String(err?.message ?? err);
      const expectedSnapshot: AnyLayoutSnapshot | null = (() => {
        // Vitest dorzuca `actual` i `expected` do błędu jako stringi JSON-podobne.
        const exp = err?.expected;
        if (!exp || typeof exp !== "string") return null;
        try {
          // Snapshoty jsona-podobne — usuwamy ewentualny outer cudzysłów.
          return JSON.parse(exp) as AnyLayoutSnapshot;
        } catch {
          return null;
        }
      })();

      const diffText = expectedSnapshot
        ? diffKanbanLayouts(expectedSnapshot, received)
        : "";
      return {
        pass: false,
        message: () =>
          [
            "Snapshot układu PDF nie zgadza się.",
            diffText
              ? diffText
              : "(nie udało się sparsować poprzedniego snapshotu — zobacz oryginalny diff Vitest poniżej)",
            "",
            "Aby zaakceptować nowy układ jako poprawny, uruchom: `bunx vitest -u`.",
            "",
            "── Oryginalny komunikat Vitest ──",
            original,
          ].join("\n"),
      };
    }
  },

  toMatchKanbanLayout(received: AnyLayoutSnapshot, expected: AnyLayoutSnapshot) {
    const diffText = diffKanbanLayouts(expected, received);
    if (!diffText) {
      return {
        pass: true,
        message: () => "Layouty są identyczne",
      };
    }
    return {
      pass: false,
      message: () =>
        [
          "Layouty PDF różnią się:",
          diffText,
        ].join("\n"),
    };
  },
});
