import { useAuth } from "@/hooks/useAuth";

export type AppRole = "super_admin" | "admin" | "koordynator" | "serviceman" | "pracownik" | "client";

/**
 * Centralna logika uprawnień UI.
 *
 * Hierarchia ról:
 *   super_admin  → pełny dostęp
 *   admin        → pełny operacyjny + finanse (bez super admin panelu)
 *   koordynator  → operacje bez finansów i ustawień
 *   serviceman   → tylko swoje zlecenia, checklisty, protokoły
 *   pracownik    → zadania biurowe, kalendarz, biblioteka
 *   client       → panel klienta (tylko swoje obiekty i zgłoszenia)
 */
export function usePermissions() {
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const isCompanyAdmin = role === "admin";
  const isKoordynator = role === "koordynator";
  const isServiceman = role === "serviceman";
  const isPracownik = role === "pracownik";
  const isClient = role === "client";

  const canEdit = isSuperAdmin || isCompanyAdmin;
  const canManageOperations = canEdit || isKoordynator;
  const canViewFinance = isSuperAdmin || isCompanyAdmin;
  const canViewAnalytics = isSuperAdmin || isCompanyAdmin || isKoordynator;
  const canUseAiBot = !isClient && !isPracownik;

  return {
    role: role as AppRole | null,
    isSuperAdmin,
    isCompanyAdmin,
    isKoordynator,
    isServiceman,
    isPracownik,
    isClient,
    /** Może edytować dane operacyjne (firmy, obiekty, kontakty). */
    canEdit,
    /** Może zarządzać operacjami (tworzyć/przypisywać zlecenia). */
    canManageOperations,
    /** Może widzieć moduł finansowy. */
    canViewFinance,
    /** Może widzieć analitykę i raporty. */
    canViewAnalytics,
    /** Może korzystać z AI Bota. */
    canUseAiBot,
    /** Widzi tylko odczyt. */
    isReadOnly: !canEdit,
  };
}
