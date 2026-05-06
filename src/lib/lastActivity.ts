import { formatRelative, formatLocalDateTime, parseDbTimestamp } from "@/lib/relativeTime";

/**
 * "Ostatnia aktywność" = nowsze z: utworzenie zadania (created_at) i aktualizacja oferty (quoteUpdatedAt).
 * Zwraca strukturę pomocną przy rozbudowanym tooltipie / pop-overze.
 */
export type LastActivitySource = "created" | "quote" | "none";

export interface LastActivityInfo {
  source: LastActivitySource;
  /** Wartość, która "wygrała" — najnowsza data. */
  winnerLabel: string;            // np. "Aktualizacja oferty" / "Utworzenie zadania" / "Brak danych"
  winnerRelative: string | null;  // np. "wczoraj"
  winnerExact: string | null;     // np. "05.05.2026, 14:32"
  createdRelative: string | null;
  createdExact: string | null;
  quoteRelative: string | null;
  quoteExact: string | null;
  /** Gotowy, wielowierszowy tekst do atrybutu `title=""`. */
  tooltip: string;
}

export function buildLastActivityTooltip(task: {
  created_at?: string | Date | null;
  quoteUpdatedAt?: string | Date | null;
}): LastActivityInfo {
  const createdDate = parseDbTimestamp(task.created_at ?? null);
  const quoteDate = parseDbTimestamp(task.quoteUpdatedAt ?? null);

  const createdMs = createdDate?.getTime() ?? 0;
  const quoteMs = quoteDate?.getTime() ?? 0;

  const createdRelative = formatRelative(task.created_at ?? null);
  const createdExact = formatLocalDateTime(task.created_at ?? null);
  const quoteRelative = formatRelative(task.quoteUpdatedAt ?? null);
  const quoteExact = formatLocalDateTime(task.quoteUpdatedAt ?? null);

  let source: LastActivitySource = "none";
  let winnerLabel = "Brak danych";
  let winnerRelative: string | null = null;
  let winnerExact: string | null = null;

  if (createdMs === 0 && quoteMs === 0) {
    source = "none";
  } else if (quoteMs >= createdMs) {
    source = "quote";
    winnerLabel = "Aktualizacja oferty";
    winnerRelative = quoteRelative;
    winnerExact = quoteExact;
  } else {
    source = "created";
    winnerLabel = "Utworzenie zadania";
    winnerRelative = createdRelative;
    winnerExact = createdExact;
  }

  const lines: string[] = [];
  lines.push(
    `Ostatnia aktywność: ${winnerLabel}${winnerRelative ? ` (${winnerRelative})` : ""}`
  );
  if (winnerExact) lines.push(`  ${winnerExact}`);
  lines.push("");
  lines.push(
    `• Utworzenie zadania: ${createdExact ?? "—"}${createdRelative ? ` (${createdRelative})` : ""}`
  );
  lines.push(
    `• Aktualizacja oferty: ${quoteExact ?? "—"}${quoteRelative ? ` (${quoteRelative})` : ""}`
  );

  return {
    source,
    winnerLabel,
    winnerRelative,
    winnerExact,
    createdRelative,
    createdExact,
    quoteRelative,
    quoteExact,
    tooltip: lines.join("\n"),
  };
}
