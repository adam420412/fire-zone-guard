/**
 * Production helper: structured comparison of two `KanbanPdfLayoutReport`s.
 *
 * Use it for fast regression debugging: feed in a baseline layout (e.g. from a
 * snapshot or previous build) and the current layout, and get a categorized
 * delta covering geometry, page-breaks, gaps, sections and per-page summaries.
 *
 * This is the "machine readable" sibling of the textual diff in
 * `src/test/utils/kanbanLayoutDiff.ts` (which renders a human report for
 * Vitest snapshot failures). Both can coexist; this one is consumed by the
 * Kanban export debug dialog and any future runtime diagnostics.
 */

import type {
  KanbanPdfLayoutReport,
  KanbanPdfLayoutSection,
  KanbanPdfPageSummary,
} from "@/lib/kanbanPdfExport";

/** A single numeric delta. `null` on either side means "field missing". */
export type NumberDelta = {
  before: number | null;
  after: number | null;
  /** after - before. `null` when either side is null. */
  delta: number | null;
};

/** Per-section delta. `before`/`after` are null when the section appears/disappears. */
export type KanbanLayoutSectionDiff = {
  /** Stable key: `${groupIndex}|${groupLabel}`. */
  key: string;
  groupIndex: number | null;
  groupLabel: string;
  before: KanbanPdfLayoutSection | null;
  after: KanbanPdfLayoutSection | null;
  status: "added" | "removed" | "changed" | "unchanged";

  // Heights (the most common regression dimension).
  headerHeight: NumberDelta;
  tableHeightFirstPage: NumberDelta;
  sectionHeightOnStartPage: NumberDelta;

  // Page-break dimensions.
  page: NumberDelta;
  tableEndPage: NumberDelta;
  tablePageSpan: NumberDelta;
  /** True iff `startsNewPage` flipped between baseline and current. */
  startsNewPageFlipped: boolean;
  startsNewPageBefore: boolean | null;
  startsNewPageAfter: boolean | null;

  // Vertical positions.
  headerTop: NumberDelta;
  headerBottom: NumberDelta;
  tableStartY: NumberDelta;
  tableFinalY: NumberDelta;

  // Gaps.
  gapBeforeHeader: NumberDelta;

  // Helpful metadata.
  taskCount: NumberDelta;
  indexOnPage: NumberDelta;
};

export type KanbanLayoutPageDiff = {
  page: number;
  before: KanbanPdfPageSummary | null;
  after: KanbanPdfPageSummary | null;
  status: "added" | "removed" | "changed" | "unchanged";
  sectionsStarting: NumberDelta;
  sectionsEnding: NumberDelta;
  firstUsedY: NumberDelta;
  lastUsedY: NumberDelta;
  trailingWhitespace: NumberDelta;
};

export type KanbanLayoutCompareResult = {
  /** Overall verdict — `true` iff every category is byte-identical. */
  identical: boolean;

  // Geometry / global config.
  geometry: {
    pageWidth: NumberDelta;
    pageHeight: NumberDelta;
    marginTop: NumberDelta;
    marginBottom: NumberDelta;
    marginLeft: NumberDelta;
    spacing: {
      headerToTable: NumberDelta;
      tableToNextHeader: NumberDelta;
    };
  };

  // Pagination.
  pagination: {
    totalPages: NumberDelta;
    /** True iff at least one section's `page` or `tableEndPage` changed. */
    pageBreaksChanged: boolean;
    /** Sections whose `startsNewPage` flag flipped (new page-break or removed one). */
    pageBreakFlips: KanbanLayoutSectionDiff[];
  };

  // Aggregated section/page deltas.
  sections: {
    added: KanbanLayoutSectionDiff[];
    removed: KanbanLayoutSectionDiff[];
    changed: KanbanLayoutSectionDiff[];
    unchanged: KanbanLayoutSectionDiff[];
    /** All section diffs in baseline-then-added order. */
    all: KanbanLayoutSectionDiff[];
  };
  pages: {
    added: KanbanLayoutPageDiff[];
    removed: KanbanLayoutPageDiff[];
    changed: KanbanLayoutPageDiff[];
    unchanged: KanbanLayoutPageDiff[];
    all: KanbanLayoutPageDiff[];
  };

  // Totals (reusing `KanbanPdfLayoutReport["totals"]` fields).
  totals: {
    sectionsCount: NumberDelta;
    totalHeaderHeight: NumberDelta;
    totalTableHeightOnStartPage: NumberDelta;
    totalGapBeforeHeader: NumberDelta;
    avgTrailingWhitespace: NumberDelta;
  };

  /** Convenience focused buckets — same diffs surfaced by category. */
  highlights: {
    /** Sections where any height field changed (header / first-page table / total). */
    heightChanges: KanbanLayoutSectionDiff[];
    /** Sections where `gapBeforeHeader` changed. */
    gapChanges: KanbanLayoutSectionDiff[];
    /** Sections that moved to a different start page or end page. */
    pageMoves: KanbanLayoutSectionDiff[];
  };
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const FLOAT_TOLERANCE = 0.0005;

function nearlyEqual(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= FLOAT_TOLERANCE;
}

function delta(before: number | null | undefined, after: number | null | undefined): NumberDelta {
  const b = before === undefined ? null : before;
  const a = after === undefined ? null : after;
  return {
    before: b,
    after: a,
    delta: b === null || a === null ? null : a - b,
  };
}

function deltaChanged(d: NumberDelta): boolean {
  return !nearlyEqual(d.before, d.after);
}

function sectionKey(s: { groupIndex: number; groupLabel: string }): string {
  return `${s.groupIndex}|${s.groupLabel}`;
}

function emptySection(key: string, ref: KanbanPdfLayoutSection | null): {
  groupIndex: number | null;
  groupLabel: string;
} {
  if (ref) return { groupIndex: ref.groupIndex, groupLabel: ref.groupLabel };
  // Parse key fallback (used only when both sides are null, which never happens).
  const idx = key.indexOf("|");
  return {
    groupIndex: idx >= 0 ? Number(key.slice(0, idx)) : null,
    groupLabel: idx >= 0 ? key.slice(idx + 1) : key,
  };
}

function diffSection(
  key: string,
  before: KanbanPdfLayoutSection | null,
  after: KanbanPdfLayoutSection | null,
): KanbanLayoutSectionDiff {
  const meta = emptySection(key, after ?? before);
  const headerHeight = delta(before?.headerHeight, after?.headerHeight);
  const tableHeightFirstPage = delta(before?.tableHeightFirstPage, after?.tableHeightFirstPage);
  const sectionHeightOnStartPage = delta(
    before?.sectionHeightOnStartPage,
    after?.sectionHeightOnStartPage,
  );
  const page = delta(before?.page, after?.page);
  const tableEndPage = delta(before?.tableEndPage, after?.tableEndPage);
  const tablePageSpan = delta(before?.tablePageSpan, after?.tablePageSpan);
  const headerTop = delta(before?.headerTop, after?.headerTop);
  const headerBottom = delta(before?.headerBottom, after?.headerBottom);
  const tableStartY = delta(before?.tableStartY, after?.tableStartY);
  const tableFinalY = delta(before?.tableFinalY, after?.tableFinalY);
  const gapBeforeHeader = delta(
    before?.gapBeforeHeader ?? null,
    after?.gapBeforeHeader ?? null,
  );
  const taskCount = delta(before?.taskCount, after?.taskCount);
  const indexOnPage = delta(before?.indexOnPage, after?.indexOnPage);

  const startsNewPageBefore = before ? before.startsNewPage : null;
  const startsNewPageAfter = after ? after.startsNewPage : null;
  const startsNewPageFlipped =
    startsNewPageBefore !== null &&
    startsNewPageAfter !== null &&
    startsNewPageBefore !== startsNewPageAfter;

  let status: KanbanLayoutSectionDiff["status"];
  if (!before && after) status = "added";
  else if (before && !after) status = "removed";
  else {
    const anyChanged =
      deltaChanged(headerHeight) ||
      deltaChanged(tableHeightFirstPage) ||
      deltaChanged(sectionHeightOnStartPage) ||
      deltaChanged(page) ||
      deltaChanged(tableEndPage) ||
      deltaChanged(tablePageSpan) ||
      deltaChanged(headerTop) ||
      deltaChanged(headerBottom) ||
      deltaChanged(tableStartY) ||
      deltaChanged(tableFinalY) ||
      deltaChanged(gapBeforeHeader) ||
      deltaChanged(taskCount) ||
      deltaChanged(indexOnPage) ||
      startsNewPageFlipped;
    status = anyChanged ? "changed" : "unchanged";
  }

  return {
    key,
    groupIndex: meta.groupIndex,
    groupLabel: meta.groupLabel,
    before,
    after,
    status,
    headerHeight,
    tableHeightFirstPage,
    sectionHeightOnStartPage,
    page,
    tableEndPage,
    tablePageSpan,
    startsNewPageFlipped,
    startsNewPageBefore,
    startsNewPageAfter,
    headerTop,
    headerBottom,
    tableStartY,
    tableFinalY,
    gapBeforeHeader,
    taskCount,
    indexOnPage,
  };
}

function diffPage(
  page: number,
  before: KanbanPdfPageSummary | null,
  after: KanbanPdfPageSummary | null,
): KanbanLayoutPageDiff {
  const sectionsStarting = delta(before?.sectionsStarting, after?.sectionsStarting);
  const sectionsEnding = delta(before?.sectionsEnding, after?.sectionsEnding);
  const firstUsedY = delta(before?.firstUsedY ?? null, after?.firstUsedY ?? null);
  const lastUsedY = delta(before?.lastUsedY ?? null, after?.lastUsedY ?? null);
  const trailingWhitespace = delta(before?.trailingWhitespace, after?.trailingWhitespace);

  let status: KanbanLayoutPageDiff["status"];
  if (!before && after) status = "added";
  else if (before && !after) status = "removed";
  else {
    const anyChanged =
      deltaChanged(sectionsStarting) ||
      deltaChanged(sectionsEnding) ||
      deltaChanged(firstUsedY) ||
      deltaChanged(lastUsedY) ||
      deltaChanged(trailingWhitespace);
    status = anyChanged ? "changed" : "unchanged";
  }

  return {
    page,
    before,
    after,
    status,
    sectionsStarting,
    sectionsEnding,
    firstUsedY,
    lastUsedY,
    trailingWhitespace,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Compare two `KanbanPdfLayoutReport`s and return a structured delta.
 *
 * - Section matching is done by `${groupIndex}|${groupLabel}`. Re-ordering
 *   within the same key is detected via `indexOnPage`/`page` deltas.
 * - All numbers are compared with a 5e-4 pt tolerance to ignore float noise
 *   from autoTable.
 * - The result is safe to JSON.stringify and ship to logs / debug dialogs.
 */
export function compareKanbanLayouts(
  baseline: KanbanPdfLayoutReport,
  current: KanbanPdfLayoutReport,
): KanbanLayoutCompareResult {
  // Geometry.
  const geometry = {
    pageWidth: delta(baseline.pageWidth, current.pageWidth),
    pageHeight: delta(baseline.pageHeight, current.pageHeight),
    marginTop: delta(baseline.marginTop, current.marginTop),
    marginBottom: delta(baseline.marginBottom, current.marginBottom),
    marginLeft: delta(baseline.marginLeft, current.marginLeft),
    spacing: {
      headerToTable: delta(baseline.spacing.headerToTable, current.spacing.headerToTable),
      tableToNextHeader: delta(
        baseline.spacing.tableToNextHeader,
        current.spacing.tableToNextHeader,
      ),
    },
  };

  // Sections — matched by stable key, baseline order first, then any added.
  const beforeMap = new Map<string, KanbanPdfLayoutSection>();
  baseline.sections.forEach((s) => beforeMap.set(sectionKey(s), s));
  const afterMap = new Map<string, KanbanPdfLayoutSection>();
  current.sections.forEach((s) => afterMap.set(sectionKey(s), s));

  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  baseline.sections.forEach((s) => {
    const k = sectionKey(s);
    if (!seen.has(k)) {
      seen.add(k);
      orderedKeys.push(k);
    }
  });
  current.sections.forEach((s) => {
    const k = sectionKey(s);
    if (!seen.has(k)) {
      seen.add(k);
      orderedKeys.push(k);
    }
  });

  const allSectionDiffs = orderedKeys.map((k) =>
    diffSection(k, beforeMap.get(k) ?? null, afterMap.get(k) ?? null),
  );

  const sectionsBuckets = {
    added: allSectionDiffs.filter((d) => d.status === "added"),
    removed: allSectionDiffs.filter((d) => d.status === "removed"),
    changed: allSectionDiffs.filter((d) => d.status === "changed"),
    unchanged: allSectionDiffs.filter((d) => d.status === "unchanged"),
    all: allSectionDiffs,
  };

  // Pages — matched by page number, 1..max(totalPages).
  const maxPages = Math.max(baseline.totalPages, current.totalPages);
  const beforePages = new Map<number, KanbanPdfPageSummary>();
  baseline.pages.forEach((p) => beforePages.set(p.page, p));
  const afterPages = new Map<number, KanbanPdfPageSummary>();
  current.pages.forEach((p) => afterPages.set(p.page, p));

  const allPageDiffs: KanbanLayoutPageDiff[] = [];
  for (let p = 1; p <= maxPages; p++) {
    allPageDiffs.push(diffPage(p, beforePages.get(p) ?? null, afterPages.get(p) ?? null));
  }
  const pagesBuckets = {
    added: allPageDiffs.filter((d) => d.status === "added"),
    removed: allPageDiffs.filter((d) => d.status === "removed"),
    changed: allPageDiffs.filter((d) => d.status === "changed"),
    unchanged: allPageDiffs.filter((d) => d.status === "unchanged"),
    all: allPageDiffs,
  };

  // Pagination summary.
  const totalPagesDelta = delta(baseline.totalPages, current.totalPages);
  const pageBreaksChanged =
    deltaChanged(totalPagesDelta) ||
    allSectionDiffs.some(
      (d) =>
        deltaChanged(d.page) ||
        deltaChanged(d.tableEndPage) ||
        deltaChanged(d.tablePageSpan) ||
        d.startsNewPageFlipped,
    );
  const pageBreakFlips = allSectionDiffs.filter(
    (d) =>
      d.startsNewPageFlipped || deltaChanged(d.page) || deltaChanged(d.tableEndPage),
  );

  // Totals.
  const totals = {
    sectionsCount: delta(baseline.totals.sectionsCount, current.totals.sectionsCount),
    totalHeaderHeight: delta(
      baseline.totals.totalHeaderHeight,
      current.totals.totalHeaderHeight,
    ),
    totalTableHeightOnStartPage: delta(
      baseline.totals.totalTableHeightOnStartPage,
      current.totals.totalTableHeightOnStartPage,
    ),
    totalGapBeforeHeader: delta(
      baseline.totals.totalGapBeforeHeader,
      current.totals.totalGapBeforeHeader,
    ),
    avgTrailingWhitespace: delta(
      baseline.totals.avgTrailingWhitespace,
      current.totals.avgTrailingWhitespace,
    ),
  };

  // Highlights — focused buckets for the most common debugging questions.
  const heightChanges = sectionsBuckets.changed.filter(
    (d) =>
      deltaChanged(d.headerHeight) ||
      deltaChanged(d.tableHeightFirstPage) ||
      deltaChanged(d.sectionHeightOnStartPage),
  );
  const gapChanges = sectionsBuckets.changed.filter((d) => deltaChanged(d.gapBeforeHeader));
  const pageMoves = sectionsBuckets.changed.filter(
    (d) => deltaChanged(d.page) || deltaChanged(d.tableEndPage) || d.startsNewPageFlipped,
  );

  // Identity verdict — every dimension stable.
  const identical =
    !deltaChanged(geometry.pageWidth) &&
    !deltaChanged(geometry.pageHeight) &&
    !deltaChanged(geometry.marginTop) &&
    !deltaChanged(geometry.marginBottom) &&
    !deltaChanged(geometry.marginLeft) &&
    !deltaChanged(geometry.spacing.headerToTable) &&
    !deltaChanged(geometry.spacing.tableToNextHeader) &&
    !deltaChanged(totalPagesDelta) &&
    !deltaChanged(totals.sectionsCount) &&
    !deltaChanged(totals.totalHeaderHeight) &&
    !deltaChanged(totals.totalTableHeightOnStartPage) &&
    !deltaChanged(totals.totalGapBeforeHeader) &&
    !deltaChanged(totals.avgTrailingWhitespace) &&
    sectionsBuckets.added.length === 0 &&
    sectionsBuckets.removed.length === 0 &&
    sectionsBuckets.changed.length === 0 &&
    pagesBuckets.added.length === 0 &&
    pagesBuckets.removed.length === 0 &&
    pagesBuckets.changed.length === 0;

  return {
    identical,
    geometry,
    pagination: {
      totalPages: totalPagesDelta,
      pageBreaksChanged,
      pageBreakFlips,
    },
    sections: sectionsBuckets,
    pages: pagesBuckets,
    totals,
    highlights: {
      heightChanges,
      gapChanges,
      pageMoves,
    },
  };
}

// ─── Pretty-printer ─────────────────────────────────────────────────────────

function fmt(n: number | null): string {
  if (n === null) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function fmtDelta(d: NumberDelta): string {
  if (!deltaChanged(d)) return `${fmt(d.before)} (=)`;
  const before = fmt(d.before);
  const after = fmt(d.after);
  if (d.delta === null) return `${before} → ${after}`;
  const sign = d.delta > 0 ? "+" : "";
  return `${before} → ${after}  (Δ ${sign}${fmt(d.delta)}pt)`;
}

/**
 * Render a compact, human-readable summary of the diff. Designed for log
 * lines and the debug dialog — kept short so it fits in a notification.
 */
export function formatKanbanLayoutCompare(result: KanbanLayoutCompareResult): string {
  if (result.identical) {
    return "KanbanPdfLayout: identyczny (brak różnic w geometrii, sekcjach, stronach i totalach).";
  }

  const lines: string[] = [];
  lines.push("┌── KanbanPdfLayout COMPARE ──────────────────────────────");
  const s = result.sections;
  const p = result.pages;
  lines.push(
    `│ sekcje: +${s.added.length} / -${s.removed.length} / Δ${s.changed.length} / =${s.unchanged.length}` +
      ` | strony: +${p.added.length} / -${p.removed.length} / Δ${p.changed.length} / =${p.unchanged.length}` +
      ` | totalPages: ${fmtDelta(result.pagination.totalPages)}`,
  );

  // Geometry / spacing.
  const g = result.geometry;
  const geomChanges = [
    ["pageWidth", g.pageWidth],
    ["pageHeight", g.pageHeight],
    ["marginTop", g.marginTop],
    ["marginBottom", g.marginBottom],
    ["marginLeft", g.marginLeft],
    ["spacing.headerToTable", g.spacing.headerToTable],
    ["spacing.tableToNextHeader", g.spacing.tableToNextHeader],
  ].filter(([, d]) => deltaChanged(d as NumberDelta)) as [string, NumberDelta][];
  if (geomChanges.length) {
    lines.push("▼ Geometria");
    geomChanges.forEach(([name, d]) => lines.push(`  • ${name}: ${fmtDelta(d)}`));
  }

  // Heights.
  if (result.highlights.heightChanges.length) {
    lines.push("▼ Wysokości sekcji");
    result.highlights.heightChanges.forEach((d) => {
      const parts: string[] = [];
      if (deltaChanged(d.headerHeight))
        parts.push(`headerHeight ${fmtDelta(d.headerHeight)}`);
      if (deltaChanged(d.tableHeightFirstPage))
        parts.push(`tableHeightFirstPage ${fmtDelta(d.tableHeightFirstPage)}`);
      if (deltaChanged(d.sectionHeightOnStartPage))
        parts.push(`sectionHeight ${fmtDelta(d.sectionHeightOnStartPage)}`);
      lines.push(`  • [${d.groupIndex}|${d.groupLabel}] ${parts.join(", ")}`);
    });
  }

  // Page-breaks.
  if (result.pagination.pageBreakFlips.length) {
    lines.push("▼ Page-breaki");
    result.pagination.pageBreakFlips.forEach((d) => {
      const flagInfo = d.startsNewPageFlipped
        ? ` startsNewPage: ${d.startsNewPageBefore} → ${d.startsNewPageAfter}`
        : "";
      lines.push(
        `  • [${d.groupIndex}|${d.groupLabel}] page ${fmtDelta(d.page)}, endPage ${fmtDelta(d.tableEndPage)}, span ${fmtDelta(d.tablePageSpan)}${flagInfo}`,
      );
    });
  }

  // Gaps.
  if (result.highlights.gapChanges.length) {
    lines.push("▼ Gaps (tabela → kolejny nagłówek)");
    result.highlights.gapChanges.forEach((d) => {
      lines.push(`  • [${d.groupIndex}|${d.groupLabel}] gapBeforeHeader ${fmtDelta(d.gapBeforeHeader)}`);
    });
  }

  // Per-page summary changes.
  const changedPages = result.pages.changed;
  if (changedPages.length) {
    lines.push("▼ Per-strona");
    changedPages.forEach((pd) => {
      const parts: string[] = [];
      if (deltaChanged(pd.sectionsStarting))
        parts.push(`start ${fmtDelta(pd.sectionsStarting)}`);
      if (deltaChanged(pd.sectionsEnding))
        parts.push(`end ${fmtDelta(pd.sectionsEnding)}`);
      if (deltaChanged(pd.lastUsedY))
        parts.push(`lastUsedY ${fmtDelta(pd.lastUsedY)}`);
      if (deltaChanged(pd.trailingWhitespace))
        parts.push(`trailing ${fmtDelta(pd.trailingWhitespace)}`);
      lines.push(`  • page ${pd.page}: ${parts.join(", ")}`);
    });
  }

  // Totals.
  const t = result.totals;
  const totalChanges = [
    ["sectionsCount", t.sectionsCount],
    ["totalHeaderHeight", t.totalHeaderHeight],
    ["totalTableHeightOnStartPage", t.totalTableHeightOnStartPage],
    ["totalGapBeforeHeader", t.totalGapBeforeHeader],
    ["avgTrailingWhitespace", t.avgTrailingWhitespace],
  ].filter(([, d]) => deltaChanged(d as NumberDelta)) as [string, NumberDelta][];
  if (totalChanges.length) {
    lines.push("▼ Totals");
    totalChanges.forEach(([name, d]) => lines.push(`  • ${name}: ${fmtDelta(d)}`));
  }

  lines.push("└──────────────────────────────────────────────────────");
  return lines.join("\n");
}
