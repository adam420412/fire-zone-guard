/**
 * Pelna macierz uprawnien UI. To ten hook decyduje, kto widzi przyciski
 * dodawania, finanse, analitykę i bota AI - a wlasnie na tym wywrocil sie
 * projekt (rola null chowala wszystko).
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const h = vi.hoisted(() => ({ rola: { current: null as string | null } }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: h.rola.current ? { id: "u1" } : null,
    loading: false,
    role: h.rola.current,
    profileId: "p1",
    signIn: async () => {}, signUp: async () => {}, signOut: async () => {},
  }),
}));

import { usePermissions } from "@/hooks/usePermissions";

function dla(rola: string | null) {
  h.rola.current = rola;
  return renderHook(() => usePermissions()).result.current;
}

describe("usePermissions - macierz rol", () => {
  const OCZEKIWANE: Record<string, Record<string, boolean>> = {
    super_admin: { canEdit: true,  canManageOperations: true,  canViewFinance: true,  canViewAnalytics: true,  canUseAiBot: true,  isReadOnly: false },
    admin:       { canEdit: true,  canManageOperations: true,  canViewFinance: true,  canViewAnalytics: true,  canUseAiBot: true,  isReadOnly: false },
    koordynator: { canEdit: false, canManageOperations: true,  canViewFinance: false, canViewAnalytics: true,  canUseAiBot: true,  isReadOnly: true  },
    serviceman:  { canEdit: false, canManageOperations: false, canViewFinance: false, canViewAnalytics: false, canUseAiBot: true,  isReadOnly: true  },
    pracownik:   { canEdit: false, canManageOperations: false, canViewFinance: false, canViewAnalytics: false, canUseAiBot: false, isReadOnly: true  },
    client:      { canEdit: false, canManageOperations: false, canViewFinance: false, canViewAnalytics: false, canUseAiBot: false, isReadOnly: true  },
  };

  for (const [rola, oczekiwane] of Object.entries(OCZEKIWANE)) {
    it(`rola ${rola}`, () => {
      const p = dla(rola) as any;
      for (const [klucz, wartosc] of Object.entries(oczekiwane)) {
        expect({ [klucz]: p[klucz] }).toEqual({ [klucz]: wartosc });
      }
    });
  }

  it("brak roli = brak jakichkolwiek uprawnien", () => {
    const p = dla(null);
    expect(p.canEdit).toBe(false);
    expect(p.canManageOperations).toBe(false);
    expect(p.canViewFinance).toBe(false);
    expect(p.canViewAnalytics).toBe(false);
    expect(p.isReadOnly).toBe(true);
    expect(p.role).toBeNull();
  });

  it("nieznana rola nie daje przypadkiem uprawnien", () => {
    const p = dla("kierowca");
    expect(p.canEdit).toBe(false);
    expect(p.canViewFinance).toBe(false);
    expect(p.isSuperAdmin).toBe(false);
  });

  it("tylko jedna flaga rozpoznania roli jest prawdziwa naraz", () => {
    for (const rola of ["super_admin", "admin", "koordynator", "serviceman", "pracownik", "client"]) {
      const p = dla(rola) as any;
      const flagi = ["isSuperAdmin", "isCompanyAdmin", "isKoordynator", "isServiceman", "isPracownik", "isClient"];
      expect(flagi.filter((f) => p[f]).length).toBe(1);
    }
  });

  it("klient i pracownik nie maja dostepu do bota AI", () => {
    expect(dla("client").canUseAiBot).toBe(false);
    expect(dla("pracownik").canUseAiBot).toBe(false);
  });

  it("isReadOnly jest dokladnie zaprzeczeniem canEdit", () => {
    for (const rola of ["super_admin", "admin", "koordynator", "client", null]) {
      const p = dla(rola);
      expect(p.isReadOnly).toBe(!p.canEdit);
    }
  });
});
