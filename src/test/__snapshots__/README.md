# PDF Layout Snapshots — przewodnik operacyjny

Snapshoty układu eksportu PDF Kanban są **strażnikiem regresji** — każda
nieudokumentowana zmiana w odstępach, paginacji, wysokościach nagłówków
lub strukturze sekcji powoduje **fail w CI** (zob.
`.github/workflows/pdf-snapshot-tests.yml`).

## Pliki snapshotów

```
src/test/__snapshots__/
  kanbanPdfExport.snapshot.test.ts.snap
  kanbanPdfExport.edgecases.test.ts.snap
```

Snapshoty NIE zawierają binarnego PDF — zawierają znormalizowany
`KanbanPdfLayoutReport` (zaokrąglony do 1pt, deterministyczny).

## Komendy

| Cel | Komenda |
| --- | --- |
| Uruchom wszystkie testy PDF (lokalnie, jak w CI) | `bun run test:snapshots` |
| Uruchom CI-mode dla całego repo | `bun run test:ci` |
| **Zaakceptuj nowy układ jako poprawny** (po świadomej zmianie) | `bun run test:snapshots:update` |
| Watch mode podczas refaktoru | `bun run test:watch` |

## Zachowanie w CI

- Workflow `pdf-snapshot-tests.yml` uruchamia testy z `CI=true`.
- Vitest w trybie CI **NIE zapisuje nowych snapshotów** — brak snapshotu = fail.
- Po testach workflow weryfikuje `git diff` na katalogu snapshotów —
  jeśli cokolwiek zostało zmodyfikowane, build pada z jasnym komunikatem.
- Workflow triggeruje się tylko gdy zmienione są pliki PDF/test/snapshot
  (paths-filter w `on:`).

## Diagnostyka różnic

Custom matcher `toMatchKanbanLayoutSnapshot` (w
`src/test/setup/kanbanLayoutMatcher.ts`) drukuje czytelny raport różnic:

```
┌── KanbanPdfLayout DIFF ──────────────────────────────
│ sekcji zmienionych: 1 | dodanych: 0 | usuniętych: 0 | stron: 2 → 3
▼ Geometria strony / spacing
  spacing.tableToNextHeader: 18pt → 24pt  (Δ +6pt)
▼ Sekcje (per-grupa)
  • sekcja [1|Beta] (page 1):
    tableFinalY: 500pt → 510pt  (Δ +10pt)
└──────────────────────────────────────────────────────
```

W logach CI szukaj nagłówka `▼ Sekcje (per-grupa)` — od razu widać,
która grupa się przesunęła i o ile.

## Workflow akceptacji zmiany

1. Zmień kod w `src/lib/kanbanPdfExport.ts`.
2. Lokalnie: `bun run test:snapshots` → patrz na DIFF, zweryfikuj że
   zmiany są zgodne z intencją.
3. Jeśli OK: `bun run test:snapshots:update`.
4. Scommituj zmiany w `src/test/__snapshots__/**` razem z kodem.
5. Push → CI przejdzie (snapshoty pasują do nowego kodu).

**Nigdy nie commituj zmian snapshotów bez intencji** — to oznacza
ukrytą regresję układu PDF.
