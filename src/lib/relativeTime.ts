/**
 * Lokalne, strefa-czasowa-świadome formatowanie „ostatniej aktualizacji”.
 *
 * Obsługuje:
 *  - pełne ISO timestampy (`2026-05-06T07:31:14Z`, `...+02:00`) — `new Date()` poprawnie
 *    interpretuje strefę z napisu i zwraca instant; różnice liczymy w lokalnej TZ.
 *  - „date-only” z Postgresa (`2026-05-06`) — `new Date('2026-05-06')` daje północ UTC
 *    (w PL = 02:00 lokalnie poprzedniego dnia w zimie / dnia bieżącego), co psuje
 *    obliczenia „dziś/wczoraj”. Parsujemy je jako lokalną północ.
 *  - format wyświetlania zawsze w strefie czasowej przeglądarki użytkownika
 *    (mobile + web), z polskim locale.
 */

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDbTimestamp(value?: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // 'YYYY-MM-DD' → traktuj jako lokalną północ (nie UTC).
  if (DATE_ONLY_RE.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Liczba pełnych dni kalendarzowych pomiędzy dwoma datami w lokalnej TZ (b - a). */
function calendarDayDiff(a: Date, b: Date): number {
  const startA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const startB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((startB - startA) / 86_400_000);
}

const RTF =
  typeof Intl !== "undefined" && typeof Intl.RelativeTimeFormat === "function"
    ? new Intl.RelativeTimeFormat("pl-PL", { numeric: "auto" })
    : null;

/**
 * Zwraca skrócony, lokalizowany opis „kiedy” (np. „dziś”, „wczoraj”, „3 dni temu”,
 * „za 2 dni”, „05.05.26”). Liczy dni kalendarzowo w strefie czasowej użytkownika.
 */
export function formatRelative(value?: string | Date | null, now: Date = new Date()): string | null {
  const d = parseDbTimestamp(value);
  if (!d) return null;

  const diffMs = d.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 3_600_000;

  // < 60 s
  if (absMs < minute) return diffMs >= 0 ? "za chwilę" : "przed chwilą";

  // Tego samego dnia kalendarzowego — pokaż minuty/godziny
  const dayDiff = calendarDayDiff(now, d);
  if (dayDiff === 0) {
    if (absMs < hour) {
      const mins = Math.round(absMs / minute);
      return RTF
        ? RTF.format(diffMs >= 0 ? mins : -mins, "minute")
        : `${diffMs >= 0 ? "za " : ""}${mins} min${diffMs < 0 ? " temu" : ""}`;
    }
    const hrs = Math.round(absMs / hour);
    return RTF
      ? RTF.format(diffMs >= 0 ? hrs : -hrs, "hour")
      : `${diffMs >= 0 ? "za " : ""}${hrs} h${diffMs < 0 ? " temu" : ""}`;
  }

  // Dni / tygodnie kalendarzowo
  const absDays = Math.abs(dayDiff);
  if (absDays === 1) return dayDiff < 0 ? "wczoraj" : "jutro";
  if (absDays < 7) {
    return RTF ? RTF.format(dayDiff, "day") : `${absDays} dni ${dayDiff < 0 ? "temu" : ""}`.trim();
  }
  if (absDays < 30) {
    const weeks = Math.round(absDays / 7) * (dayDiff < 0 ? -1 : 1);
    return RTF ? RTF.format(weeks, "week") : `${Math.abs(weeks)} tyg. ${weeks < 0 ? "temu" : ""}`.trim();
  }

  // Dawniej / dalej w przyszłości — pełna data w lokalnej TZ.
  return d.toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/** Pełna data + godzina w lokalnej strefie użytkownika (do tooltipów). */
export function formatLocalDateTime(value?: string | Date | null): string | null {
  const d = parseDbTimestamp(value);
  if (!d) return null;
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
