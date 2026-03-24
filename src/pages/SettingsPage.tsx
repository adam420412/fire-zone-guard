import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanies } from "@/hooks/useSupabaseData";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, Users, Shield, Building2, Save } from "lucide-react";

interface UserWithRole {
  id: string;
  user_id: string;
  name: string;
  email: string;
  company_id: string | null;
  companyName: string;
  role: string;
  roleId: string;
}

function useUsersWithRoles() {
  return useQuery({
    queryKey: ["admin_users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*, companies(name)")
        .order("name");
      if (error) throw error;

      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("*");
      if (rolesErr) throw rolesErr;

      return (profiles ?? []).map((p: any) => {
        const r = (roles ?? []).find((r: any) => r.user_id === p.user_id);
        return {
          id: p.id,
          user_id: p.user_id,
          name: p.name,
          email: p.email,
          company_id: p.company_id,
          companyName: p.companies?.name ?? "—",
          role: r?.role ?? "employee",
          roleId: r?.id ?? "",
        } as UserWithRole;
      });
    },
  });
}

const roles = [
  { value: "super_admin", label: "Super Admin", color: "text-critical" },
  { value: "admin", label: "Admin", color: "text-warning" },
  { value: "employee", label: "Serwisant", color: "text-primary" },
  { value: "client", label: "Klient", color: "text-muted-foreground" },
];

export default function SettingsPage() {
  const { role: currentRole } = useAuth();
  const { data: users, isLoading } = useUsersWithRoles();
  const { data: companies } = useCompanies();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editCompany, setEditCompany] = useState("");

  const updateRole = useMutation({
    mutationFn: async ({ userId, roleId, newRole }: { userId: string; roleId: string; newRole: string }) => {
      if (roleId) {
        const { error } = await supabase
          .from("user_roles")
          .update({ role: newRole as any })
          .eq("id", roleId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: newRole as any });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_users"] }),
  });

  const updateCompany = useMutation({
    mutationFn: async ({ profileId, companyId }: { profileId: string; companyId: string | null }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ company_id: companyId })
        .eq("id", profileId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_users"] }),
  });

  const handleSave = async (user: UserWithRole) => {
    try {
      if (editRole && editRole !== user.role) {
        await updateRole.mutateAsync({ userId: user.user_id, roleId: user.roleId, newRole: editRole });
      }
      const newCompany = editCompany === "" ? null : editCompany;
      if (newCompany !== user.company_id) {
        await updateCompany.mutateAsync({ profileId: user.id, companyId: newCompany });
      }
      toast({ title: "Użytkownik zaktualizowany" });
      setEditingUser(null);
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  if (currentRole !== "super_admin") {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Brak uprawnień do zarządzania użytkownikami.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const inputCls = "rounded-md border border-border bg-secondary px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ustawienia</h1>
        <p className="text-sm text-muted-foreground">Zarządzanie użytkownikami i rolami</p>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Użytkownicy ({(users ?? []).length})</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">Imię</th>
                <th className="px-5 py-3 text-left font-medium">Email</th>
                <th className="px-5 py-3 text-left font-medium">Rola</th>
                <th className="px-5 py-3 text-left font-medium">Firma</th>
                <th className="px-5 py-3 text-right font-medium">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(users ?? []).map((u) => {
                const isEditing = editingUser === u.id;
                const roleConf = roles.find((r) => r.value === u.role);

                return (
                  <tr key={u.id} className="card-hover">
                    <td className="px-5 py-3 font-medium text-card-foreground">{u.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className={inputCls}
                        >
                          {roles.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={cn("flex items-center gap-1.5 text-xs font-semibold", roleConf?.color)}>
                          <Shield className="h-3 w-3" />
                          {roleConf?.label ?? u.role}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <select
                          value={editCompany}
                          onChange={(e) => setEditCompany(e.target.value)}
                          className={inputCls}
                        >
                          <option value="">Brak firmy</option>
                          {(companies ?? []).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Building2 className="h-3 w-3" />
                          {u.companyName}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {isEditing ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleSave(u)}
                            disabled={updateRole.isPending || updateCompany.isPending}
                            className="flex items-center gap-1 rounded-md fire-gradient px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            <Save className="h-3 w-3" />
                            Zapisz
                          </button>
                          <button
                            onClick={() => setEditingUser(null)}
                            className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            Anuluj
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingUser(u.id);
                            setEditRole(u.role);
                            setEditCompany(u.company_id ?? "");
                          }}
                          className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                        >
                          Edytuj
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
