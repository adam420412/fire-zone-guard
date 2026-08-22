/**
 * Testy zachowania hookow zapisujacych do bazy.
 * Sprawdzaja, CO leci do Supabase - nie tylko czy sie nie wywalilo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { createWriteMock } from "./supabaseWriteMock";

const h = vi.hoisted(() => {
  const ref: { impl: any } = { impl: null };
  return {
    ref,
    supabase: {
      from: (t: string) => ref.impl.supabase.from(t),
      auth: {
        getUser: () => ref.impl.supabase.auth.getUser(),
        getSession: () => ref.impl.supabase.auth.getSession(),
        onAuthStateChange: (cb: any) => ref.impl.supabase.auth.onAuthStateChange(cb),
      },
    },
  };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: h.supabase }));

import { useAddDevice, useBulkAddDevices, useCreateTaskTemplate, useDeleteTaskTemplate } from "@/hooks/useBuildingData";
import { useCreateSlaTicket } from "@/hooks/useSlaTickets";

const BUDYNEK = "11111111-1111-4111-8111-111111111111";
const TYP = "22222222-2222-4222-8222-222222222222";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function ustaw(fixtures: Record<string, any> = {}, user: any = null) {
  const m = createWriteMock(fixtures, user);
  h.ref.impl = m;
  return m;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 10, 12, 0, 0)); // 10.01.2026
});
afterEach(() => vi.useRealTimers());

describe("useAddDevice", () => {
  it("wylicza termin przegladu z interwalu typu urzadzenia", async () => {
    const m = ustaw({
      device_types: { service_interval_days: 180 },
      devices: { id: "d1" },
    });
    const { result } = renderHook(() => useAddDevice(), { wrapper });
    await result.current.mutateAsync({ building_id: BUDYNEK, device_type_id: TYP, name: "Gaśnica" });

    const wstawienie = m.ops.find((o) => o.table === "devices" && o.kind === "insert")!;
    expect(wstawienie.payload.next_service_date).toBe("2026-07-09"); // 10.01 + 180 dni
    expect(wstawienie.payload.building_id).toBe(BUDYNEK);
  });

  it("uzywa domyslnych 365 dni, gdy typ nie ma interwalu", async () => {
    const m = ustaw({ device_types: {}, devices: { id: "d1" } });
    const { result } = renderHook(() => useAddDevice(), { wrapper });
    await result.current.mutateAsync({ building_id: BUDYNEK, device_type_id: TYP, name: "Hydrant" });
    const w = m.ops.find((o) => o.table === "devices" && o.kind === "insert")!;
    expect(w.payload.next_service_date).toBe("2027-01-10");
  });

  it("NIE nadpisuje terminu podanego recznie", async () => {
    const m = ustaw({ device_types: { service_interval_days: 180 }, devices: { id: "d1" } });
    const { result } = renderHook(() => useAddDevice(), { wrapper });
    await result.current.mutateAsync({
      building_id: BUDYNEK, device_type_id: TYP, name: "Czujka", next_service_date: "2026-03-01",
    });
    const w = m.ops.find((o) => o.table === "devices" && o.kind === "insert")!;
    expect(w.payload.next_service_date).toBe("2026-03-01");
  });
});

describe("useBulkAddDevices", () => {
  it("tworzy dokladnie tyle sztuk, ile podano, z numeracja od 1", async () => {
    const m = ustaw({ device_types: { service_interval_days: 365 }, devices: [{ id: "a" }] });
    const { result } = renderHook(() => useBulkAddDevices(), { wrapper });
    await result.current.mutateAsync({
      building_id: BUDYNEK, device_type_id: TYP, base_name: "Gaśnica GP6", quantity: 3,
    });
    const w = m.ops.find((o) => o.table === "devices" && o.kind === "insert")!;
    expect(Array.isArray(w.payload)).toBe(true);
    expect(w.payload).toHaveLength(3);
    expect(w.payload.map((r: any) => r.name)).toEqual(["Gaśnica GP6 #1", "Gaśnica GP6 #2", "Gaśnica GP6 #3"]);
    expect(w.payload.every((r: any) => r.next_service_date === "2027-01-10")).toBe(true);
    expect(w.payload.every((r: any) => r.building_id === BUDYNEK)).toBe(true);
  });

  it("ilosc 1 daje jeden wiersz", async () => {
    const m = ustaw({ device_types: { service_interval_days: 365 }, devices: [{ id: "a" }] });
    const { result } = renderHook(() => useBulkAddDevices(), { wrapper });
    await result.current.mutateAsync({ building_id: BUDYNEK, device_type_id: TYP, base_name: "X", quantity: 1 });
    const w = m.ops.find((o) => o.table === "devices" && o.kind === "insert")!;
    expect(w.payload).toHaveLength(1);
  });
});

describe("useCreateTaskTemplate", () => {
  it("zapisuje pozycje przypisana do obiektu, nie globalna", async () => {
    const m = ustaw({ task_templates: { id: "t1" } });
    const { result } = renderHook(() => useCreateTaskTemplate(), { wrapper });
    await result.current.mutateAsync({
      building_id: BUDYNEK, name: "  Aktualizacja IBP  ", type: "przegląd",
      priority: "wysoki", recurrence_days: 365,
    });
    const w = m.ops.find((o) => o.table === "task_templates" && o.kind === "insert")!;
    expect(w.payload.building_id).toBe(BUDYNEK);
    expect(w.payload.is_global).toBe(false);
    expect(w.payload.name).toBe("Aktualizacja IBP"); // przycięte spacje
    expect(w.payload.recurrence_days).toBe(365);
    expect(w.payload.priority).toBe("wysoki");
  });

  it("blad z bazy jest przekazywany dalej, a nie polykany", async () => {
    ustaw({ task_templates: new Error("brak uprawnien") });
    const { result } = renderHook(() => useCreateTaskTemplate(), { wrapper });
    await expect(result.current.mutateAsync({
      building_id: BUDYNEK, name: "X", type: "przegląd", priority: "średni", recurrence_days: 30,
    })).rejects.toBeTruthy();
  });
});

describe("useDeleteTaskTemplate", () => {
  it("kasuje po id", async () => {
    const m = ustaw({ task_templates: null });
    const { result } = renderHook(() => useDeleteTaskTemplate(), { wrapper });
    await result.current.mutateAsync({ id: "tpl-1", building_id: BUDYNEK });
    const w = m.ops.find((o) => o.table === "task_templates" && o.kind === "delete")!;
    expect(w.filters).toEqual([["id", "tpl-1"]]);
  });
});

describe("useCreateSlaTicket", () => {
  const payload = {
    building_id: null, type: "usterka" as const, priority: "normal" as const,
    description: "Nie działa hydrant", reporter_name: "Jan", reporter_email: "jan@example.com",
    photo_urls: [],
  };

  it("ANONIM: zapisuje bez RETURNING (bez .select)", async () => {
    const m = ustaw({ sla_tickets: null }, null);
    const { result } = renderHook(() => useCreateSlaTicket(), { wrapper });
    const created = await result.current.mutateAsync(payload as any);

    const w = m.ops.find((o) => o.table === "sla_tickets" && o.kind === "insert")!;
    expect(w.wolanoSelect).toBe(false);
    expect(w.single).toBe(false);
    expect(created.id).toBeNull();
    expect(created.ticket_number).toBeNull();
  });

  it("ZALOGOWANY: prosi o zwrotke z numerem zgloszenia", async () => {
    const m = ustaw(
      { sla_tickets: { id: "s1", ticket_number: "SLA/2026/001" } },
      { id: "u1", email: "adam@example.com" },
    );
    const { result } = renderHook(() => useCreateSlaTicket(), { wrapper });
    const created = await result.current.mutateAsync(payload as any);

    const w = m.ops.find((o) => o.table === "sla_tickets" && o.kind === "insert")!;
    expect(w.wolanoSelect).toBe(true);
    expect(w.single).toBe(true);
    expect(created.ticket_number).toBe("SLA/2026/001");
    expect(w.payload.reporter_user_id).toBe("u1");
  });

  it("blad zapisu anonimowego nie jest cicho polykany", async () => {
    ustaw({ sla_tickets: new Error("RLS") }, null);
    const { result } = renderHook(() => useCreateSlaTicket(), { wrapper });
    await expect(result.current.mutateAsync(payload as any)).rejects.toBeTruthy();
  });
});
