/**
 * Testy regresyjne hooka useAuth.
 *
 * Pokrywaja trzy bledy zgloszone przez klienta:
 *   1. "aplikacja wiesza sie po dodaniu obiektu" -> deadlock auth locka
 *      (async callback w onAuthStateChange).
 *   2. "klient nie laduje danych" -> profileId zawsze null, bo profil byl
 *      wyszukiwany po profiles.id zamiast profiles.user_id.
 *   3. uzytkownik z dwiema rolami dostawal role === null (maybeSingle na
 *      tabeli z UNIQUE(user_id, role), a nie UNIQUE(user_id)).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { createSupabaseMock, withTimeout, type QueryCall } from "./supabaseAuthLockMock";

const AUTH_UID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const COMPANY_ID = "33333333-3333-4333-8333-333333333333";

const h = vi.hoisted(() => {
  const ref: { impl: any } = { impl: null };
  const supabase = {
    from: (t: string) => ref.impl.supabase.from(t),
    auth: {
      getSession: () => ref.impl.supabase.auth.getSession(),
      onAuthStateChange: (cb: any) => ref.impl.supabase.auth.onAuthStateChange(cb),
      signInWithPassword: (a: any) => ref.impl.supabase.auth.signInWithPassword(a),
      signUp: (a: any) => ref.impl.supabase.auth.signUp(a),
      signOut: () => ref.impl.supabase.auth.signOut(),
    },
  };
  return { ref, supabase };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: h.supabase }));

import { AuthProvider, useAuth, pickPrimaryRole } from "@/hooks/useAuth";

const SESSION = { user: { id: AUTH_UID, email: "klient@example.com" } };

function makeDb(roles: string[] = ["employee", "admin"]) {
  return {
    profiles: [{ id: PROFILE_ID, user_id: AUTH_UID, company_id: COMPANY_ID, name: "Klient" }],
    user_roles: roles.map((role) => ({ user_id: AUTH_UID, role })),
    buildings: [{ id: "b1", name: "Obiekt A" }],
  };
}

let mock: ReturnType<typeof createSupabaseMock>;

function setup(db = makeDb(), session: unknown = SESSION) {
  mock = createSupabaseMock(db, session);
  h.ref.impl = mock;
  return mock;
}

let seen: { role: string | null; profileId: string | null; loading: boolean };

function Probe() {
  const { role, profileId, loading } = useAuth();
  seen = { role, profileId, loading };
  return null;
}

function renderAuth() {
  seen = { role: null, profileId: null, loading: true };
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

async function emituj(event: string, session: unknown, label: string) {
  await act(async () => {
    await withTimeout(mock.emit(event, session), 1500, label);
  });
}

beforeEach(() => {
  setup();
});

describe("pickPrimaryRole", () => {
  it("wybiera najsilniejsza role, gdy uzytkownik ma ich kilka", () => {
    expect(pickPrimaryRole([{ role: "employee" }, { role: "admin" }])).toBe("admin");
    expect(pickPrimaryRole([{ role: "client" }, { role: "super_admin" }])).toBe("super_admin");
    expect(pickPrimaryRole([{ role: "client" }, { role: "employee" }])).toBe("employee");
  });

  it("zwraca null dla pustego wejscia", () => {
    expect(pickPrimaryRole([])).toBeNull();
    expect(pickPrimaryRole(null)).toBeNull();
    expect(pickPrimaryRole(undefined)).toBeNull();
    expect(pickPrimaryRole([{ role: null }])).toBeNull();
  });

  it("nie gubi roli spoza znanej listy", () => {
    expect(pickPrimaryRole([{ role: "koordynator" }])).toBe("koordynator");
  });
});

describe("useAuth - deadlock auth locka", () => {
  it("callback onAuthStateChange oddaje zamek natychmiast", async () => {
    renderAuth();
    await emituj("SIGNED_IN", SESSION, "onAuthStateChange nie oddal auth locka (callback jest async?)");
    expect(mock.isLockHeld()).toBe(false);
  });

  it("po zdarzeniu auth kolejne zapytania nadal przechodza (objaw: wieszanie po dodaniu obiektu)", async () => {
    renderAuth();
    await emituj("SIGNED_IN", SESSION, "emit SIGNED_IN");

    // Odpowiednik invalidateQueries po useCreateBuilding: kilka zapytan naraz.
    const parallel = Promise.all([
      mock.supabase.from("buildings").select("*"),
      mock.supabase.from("profiles").select("id").eq("user_id", AUTH_UID).maybeSingle(),
      mock.supabase.from("user_roles").select("role").eq("user_id", AUTH_UID),
    ]);
    const results = await withTimeout(parallel, 1500, "zapytania po dodaniu obiektu zawisly");
    expect(results).toHaveLength(3);
  });

  it("nie odpala zapytan do bazy w trakcie trzymania auth locka", async () => {
    renderAuth();
    await emituj("SIGNED_IN", SESSION, "emit SIGNED_IN");
    await waitFor(() => expect(seen.profileId).toBe(PROFILE_ID));

    const inside = mock.calls.filter((c: QueryCall) => c.duringAuthCallback);
    expect(inside.map((c: QueryCall) => c.table)).toEqual([]);
  });
});

describe("useAuth - profil i rola", () => {
  it("ustawia profileId na profiles.id, a nie null i nie auth uid", async () => {
    renderAuth();
    await emituj("SIGNED_IN", SESSION, "emit SIGNED_IN");
    await waitFor(() => expect(seen.profileId).toBe(PROFILE_ID));
    expect(seen.profileId).not.toBe(AUTH_UID);
    expect(seen.profileId).not.toBeNull();
  });

  it("szuka profilu po kolumnie user_id (profiles.id to wlasny UUID)", async () => {
    renderAuth();
    await emituj("SIGNED_IN", SESSION, "emit SIGNED_IN");
    await waitFor(() => expect(seen.profileId).toBe(PROFILE_ID));

    const profileCalls = mock.calls.filter((c: QueryCall) => c.table === "profiles");
    expect(profileCalls.length).toBeGreaterThan(0);
    for (const call of profileCalls) {
      const cols = call.filters.map(([c]) => c);
      expect(cols).toContain("user_id");
      expect(call.filters.some(([c, v]) => c === "id" && v === AUTH_UID)).toBe(false);
    }
  });

  it("radzi sobie z uzytkownikiem majacym dwie role", async () => {
    renderAuth();
    await emituj("SIGNED_IN", SESSION, "emit SIGNED_IN");
    await waitFor(() => expect(seen.role).toBe("admin"));

    const roleCalls = mock.calls.filter((c: QueryCall) => c.table === "user_roles");
    expect(roleCalls.length).toBeGreaterThan(0);
    // .maybeSingle() na user_roles rzuca PGRST116 przy dwoch rolach.
    expect(roleCalls.every((c: QueryCall) => c.single === false)).toBe(true);
  });

  it("dziala tez dla pojedynczej roli client", async () => {
    setup(makeDb(["client"]));
    renderAuth();
    await emituj("SIGNED_IN", SESSION, "emit SIGNED_IN");
    await waitFor(() => expect(seen.role).toBe("client"));
  });

  it("konczy ladowanie i czysci stan po wylogowaniu", async () => {
    renderAuth();
    await emituj("SIGNED_IN", SESSION, "emit SIGNED_IN");
    await waitFor(() => expect(seen.profileId).toBe(PROFILE_ID));

    await emituj("SIGNED_OUT", null, "emit SIGNED_OUT");
    await waitFor(() => {
      expect(seen.role).toBeNull();
      expect(seen.profileId).toBeNull();
      expect(seen.loading).toBe(false);
    });
  });

  it("odsubskrybowuje sie przy odmontowaniu", async () => {
    const { unmount } = renderAuth();
    await waitFor(() => expect(mock.hasListener()).toBe(true));
    unmount();
    expect(mock.hasListener()).toBe(false);
  });
});
