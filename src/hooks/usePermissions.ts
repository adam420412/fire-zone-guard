import { useAuth } from "@/hooks/useAuth";

/**
 * Centralna logika uprawnień UI.
 * Reguła: edytować dane operacyjne (firmy, obiekty, kontakty, opisy)
 * mogą wyłącznie super_admin oraz admin firmy.
 */
export function usePermissions() {
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const isCompanyAdmin = role === "admin";
  const canEdit = isSuperAdmin || isCompanyAdmin;

  return {
    role,
    isSuperAdmin,
    isCompanyAdmin,
    /** Czy użytkownik może edytować dane (firma/obiekt/kontakt/opisy). */
    canEdit,
    /** Czy użytkownik widzi wyłącznie odczyt (klient, serwisant, employee). */
    isReadOnly: !canEdit,
  };
}
