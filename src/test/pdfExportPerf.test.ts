import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  recordPdfExportPerf,
  getPdfExportPerfEntries,
  clearPdfExportPerf,
  subscribePdfExportPerf,
  measure,
} from "@/lib/pdfExportPerf";

beforeEach(() => clearPdfExportPerf());

describe("pdfExportPerf store", () => {
  it("rejestruje wpis i loguje go w konsoli z prefiksem [PDF perf]", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const entry = recordPdfExportPerf({
      label: "test.pdf",
      diagnostics: true,
      totalMs: 123.45,
      buildMs: 80.5,
      buildCalls: 1,
      groupsCount: 2,
      tasksCount: 10,
      totalPages: 3,
      singleDoc: true,
    });
    expect(entry.id).toBeGreaterThan(0);
    expect(entry.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("[PDF perf]");
    expect(spy.mock.calls[0][0]).toContain("diag=on");
    expect(spy.mock.calls[0][0]).toContain("mode=single");
    spy.mockRestore();
  });

  it("przechowuje najnowsze wpisy na początku i zwraca kopię", () => {
    recordPdfExportPerf({
      label: "a", diagnostics: false, totalMs: 1, buildMs: 1, buildCalls: 1,
      groupsCount: 1, tasksCount: 1, totalPages: 1, singleDoc: true,
    });
    recordPdfExportPerf({
      label: "b", diagnostics: true, totalMs: 2, buildMs: 2, buildCalls: 1,
      groupsCount: 1, tasksCount: 1, totalPages: 1, singleDoc: true,
    });
    const xs = getPdfExportPerfEntries();
    expect(xs.map((e) => e.label)).toEqual(["b", "a"]);
    // Snapshot jest kopią — modyfikacja nie wpływa na store.
    xs.pop();
    expect(getPdfExportPerfEntries()).toHaveLength(2);
  });

  it("clearPdfExportPerf czyści store i powiadamia subskrybentów", () => {
    const seen: number[] = [];
    const unsub = subscribePdfExportPerf((snap) => seen.push(snap.length));
    recordPdfExportPerf({
      label: "x", diagnostics: false, totalMs: 1, buildMs: 1, buildCalls: 1,
      groupsCount: 1, tasksCount: 1, totalPages: 1, singleDoc: true,
    });
    clearPdfExportPerf();
    unsub();
    // [initial 0, after record 1, after clear 0]
    expect(seen).toEqual([0, 1, 0]);
  });

  it("subscribePdfExportPerf wywołuje listenera od razu z aktualnym snapshotem", () => {
    recordPdfExportPerf({
      label: "init", diagnostics: true, totalMs: 1, buildMs: 1, buildCalls: 1,
      groupsCount: 1, tasksCount: 1, totalPages: 1, singleDoc: true,
    });
    const calls: PdfExportPerfEntryLength[] = [];
    type PdfExportPerfEntryLength = number;
    const unsub = subscribePdfExportPerf((snap) => calls.push(snap.length));
    expect(calls).toEqual([1]);
    unsub();
  });

  it("measure() zwraca wartość i nieujemny ms", () => {
    const { value, ms } = measure(() => 7 * 6);
    expect(value).toBe(42);
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it("trzyma maksymalnie 50 ostatnich wpisów (FIFO na końcu)", () => {
    for (let i = 0; i < 55; i++) {
      recordPdfExportPerf({
        label: `e${i}`, diagnostics: i % 2 === 0,
        totalMs: i, buildMs: i, buildCalls: 1,
        groupsCount: 1, tasksCount: 1, totalPages: 1, singleDoc: true,
      });
    }
    const xs = getPdfExportPerfEntries();
    expect(xs).toHaveLength(50);
    // Najnowszy na początku.
    expect(xs[0].label).toBe("e54");
    // Najstarszy z zachowanych.
    expect(xs[xs.length - 1].label).toBe("e5");
  });
});
