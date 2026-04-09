import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanies } from "@/hooks/useSupabaseData";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Loader2, Users, Shield, Building2, Save, User, Lock, Bell,
  CheckCircle2, Eye, EyeOff, Mail, Phone, AlertTriangle,
  Settings as SettingsIcon, ChevronRight, Send, Link2, Copy, RefreshCw
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// ---------- ADMIN: Users with Roles ----------
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

      const { data: roles } = await supabase.from("user_roles").select("*");

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

function useMyProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my_profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

const rolesList = [
  { value: "super_admin", label: "Super Admin", color: "text-critical" },
  { value: "admin", label: "Admin", color: "text-warning" },
  { value: "employee", label: "Serwisant", color: "text-primary" },
  { value: "client", label: "Klient", color: "text-muted-foreground" },
];

const TABS = [
  { id: "profile", label: "Mój profil", icon: User },
  { id: "password", label: "Zmiana hasła", icon: Lock },
  { id: "notifications", label: "Powiadomienia", icon: Bell },
  { id: "users", label: "Użytkownicy", icon: Users, adminOnly: true },
];

// ---------- TAB: My Profile ----------
function ProfileTab() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useMyProfile();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (profile && !initialized) {
    setName(profile.name ?? "");
    setPhone((profile as any).phone ?? "");
    setTelegramChatId((profile as any).telegram_chat_id ?? "");
    setInitialized(true);
  }

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Brak sesji");
      const { error } = await supabase
        .from("profiles")
        .update({ name, phone, telegram_chat_id: telegramChatId || null } as any)
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_profile"] });
      toast({ title: "✅ Profil zaktualizowany!" });
    },
    onError: (e: any) => toast({ title: "Błąd", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="max-w-md space-y-5">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-2xl font-bold text-primary-foreground shadow-lg">
          {(name || user?.email || "?")[0].toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-card-foreground">{name || "—"}</p>
          <p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />{user?.email}</p>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-secondary/30 p-5">
        <div className="space-y-1.5">
          <Label>Imię i nazwisko</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jan Kowalski" />
        </div>
        <div className="space-y-1.5">
          <Label>Numer telefonu</Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+48 000 000 000" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Telegram Chat ID</Label>
          <div className="relative">
            <Send className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8" value={telegramChatId} onChange={e => setTelegramChatId(e.target.value)} placeholder="np. 123456789" />
          </div>
          <p className="text-[10px] text-muted-foreground">Obecnie możesz wpisać Chat ID ręcznie. Automatyczne podpinanie przez <b>/start</b> będzie dostępne po wdrożeniu backendowego powiązania konta.</p>
        </div>
        <p className="text-xs text-muted-foreground">E-mail: <span className="font-medium text-foreground">{user?.email}</span> (zmiana e-mail przez obsługę)</p>
      </div>

      <Button
        onClick={() => saveProfile.mutate()}
        disabled={saveProfile.isPending}
        className="fire-gradient"
      >
        {saveProfile.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Zapisz profil
      </Button>
    </div>
  );
}

// ---------- TAB: Change Password ----------
function PasswordTab() {
  const { toast } = useToast();
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const strength = newPass.length === 0 ? 0 : newPass.length < 6 ? 1 : newPass.length < 10 ? 2 : /[A-Z]/.test(newPass) && /[0-9]/.test(newPass) ? 4 : 3;
  const strengthLabel = ["", "Słabe", "Średnie", "Dobre", "Silne"];
  const strengthColor = ["", "bg-critical", "bg-warning", "bg-primary", "bg-success"];

  const handleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass !== confirmPass) { toast({ title: "Hasła nie pasują!", variant: "destructive" }); return; }
    if (newPass.length < 6) { toast({ title: "Hasło musi mieć minimum 6 znaków", variant: "destructive" }); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setLoading(false);
    if (error) { toast({ title: "Błąd", description: error.message, variant: "destructive" }); return; }
    toast({ title: "✅ Hasło zostało zmienione!" });
    setNewPass(""); setConfirmPass("");
  };

  return (
    <form onSubmit={handleChange} className="max-w-md space-y-5">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <p>Po zmianie hasła zostaniesz automatycznie wylogowany ze wszystkich urządzeń.</p>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-secondary/30 p-5">
        <div className="space-y-1.5">
          <Label>Nowe hasło</Label>
          <div className="relative">
            <Input
              type={showNew ? "text" : "password"}
              value={newPass}
              onChange={e => setNewPass(e.target.value)}
              placeholder="min. 8 znaków"
              className="pr-10"
            />
            <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {newPass.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1">
                {[1,2,3,4].map(i => (
                  <div key={i} className={cn("h-1.5 flex-1 rounded-full transition-all", i <= strength ? strengthColor[strength] : "bg-border")} />
                ))}
              </div>
              <p className={cn("text-[10px] font-semibold", strength === 1 ? "text-critical" : strength === 2 ? "text-warning" : strength === 3 ? "text-primary" : "text-success")}>
                {strengthLabel[strength]}
              </p>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Potwierdź hasło</Label>
          <div className="relative">
            <Input
              type={showConfirm ? "text" : "password"}
              value={confirmPass}
              onChange={e => setConfirmPass(e.target.value)}
              placeholder="Powtórz hasło"
              className={cn("pr-10", confirmPass.length > 0 && (confirmPass === newPass ? "border-success" : "border-critical"))}
            />
            <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {confirmPass.length > 0 && confirmPass === newPass && (
            <p className="text-[10px] text-success flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Hasła są zgodne</p>
          )}
        </div>
      </div>

      <Button type="submit" disabled={loading} className="fire-gradient">
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
        Zmień hasło
      </Button>
    </form>
  );
}

// ---------- TAB: Notification Settings ----------
const defaultNotifSettings = {
  overdueTasks: true,
  newTasks: true,
  auditReminders: true,
  protocolExpiry: true,
  certExpiry: true,
  emailDigest: false,
  sound: true,
};

type NotifKey = keyof typeof defaultNotifSettings;

function NotificationsTab() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(() => {
    try {
      const s = localStorage.getItem("fzg_notif_settings");
      return s ? { ...defaultNotifSettings, ...JSON.parse(s) } : defaultNotifSettings;
    } catch { return defaultNotifSettings; }
  });

  const toggle = (key: NotifKey) => setSettings((s: typeof defaultNotifSettings) => ({ ...s, [key]: !s[key] }));

  const save = () => {
    localStorage.setItem("fzg_notif_settings", JSON.stringify(settings));
    toast({ title: "✅ Ustawienia powiadomień zapisane!" });
  };

  const options: { key: NotifKey; label: string; desc: string }[] = [
    { key: "overdueTasks", label: "Przeterminowane zadania", desc: "Powiadamiaj gdy zadanie przekroczy termin" },
    { key: "newTasks", label: "Nowe zadania", desc: "Powiadamiaj gdy zostanie przypisane nowe zadanie" },
    { key: "auditReminders", label: "Przypomnienia o audytach", desc: "Powiadamiaj 7 dni przed planowanym audytem" },
    { key: "protocolExpiry", label: "Wygasające protokoły", desc: "Powiadamiaj gdy protokół serwisowy wymaga odnowienia" },
    { key: "certExpiry", label: "Wygasające certyfikaty", desc: "Powiadamiaj 30 dni przed wygaśnięciem certyfikatu" },
    { key: "emailDigest", label: "Dzienny raport e-mail", desc: "Wysyłaj podsumowanie dnia na e-mail (godz. 8:00)" },
    { key: "sound", label: "Dźwięki powiadomień", desc: "Odtwarzaj dźwięk przy nowych powiadomieniach" },
  ];

  return (
    <div className="max-w-md space-y-5">
      <div className="rounded-xl border border-border bg-secondary/30 divide-y divide-border overflow-hidden">
        {options.map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors">
            <div className="pr-4">
              <p className="text-sm font-medium text-card-foreground">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
            <button
              onClick={() => toggle(key)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                settings[key] ? "bg-primary" : "bg-border"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out",
                settings[key] ? "translate-x-4" : "translate-x-0"
              )} />
            </button>
          </div>
        ))}
      </div>
      <Button onClick={save} className="fire-gradient">
        <Save className="mr-2 h-4 w-4" />
        Zapisz ustawienia
      </Button>
    </div>
  );
}

// ---------- TAB: Users (Admin Only) ----------
function UsersTab() {
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
        const { error } = await supabase.from("user_roles").update({ role: newRole as any }).eq("id", roleId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole as any });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_users"] }),
  });

  const updateCompany = useMutation({
    mutationFn: async ({ profileId, companyId }: { profileId: string; companyId: string | null }) => {
      const { error } = await supabase.from("profiles").update({ company_id: companyId }).eq("id", profileId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_users"] }),
  });

  const handleSave = async (u: UserWithRole) => {
    try {
      if (editRole && editRole !== u.role) await updateRole.mutateAsync({ userId: u.user_id, roleId: u.roleId, newRole: editRole });
      const newCompany = editCompany === "" ? null : editCompany;
      if (newCompany !== u.company_id) await updateCompany.mutateAsync({ profileId: u.id, companyId: newCompany });
      toast({ title: "✅ Użytkownik zaktualizowany" });
      setEditingUser(null);
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  const inputCls = "rounded-md border border-border bg-secondary px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3 bg-secondary/20">
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
              const roleConf = rolesList.find((r) => r.value === u.role);
              return (
                <tr key={u.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-3 font-medium text-card-foreground">{u.name}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{u.email}</td>
                  <td className="px-5 py-3">
                    {isEditing ? (
                      <select value={editRole} onChange={e => setEditRole(e.target.value)} className={inputCls}>
                        {rolesList.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    ) : (
                      <span className={cn("flex items-center gap-1.5 text-xs font-semibold", roleConf?.color)}>
                        <Shield className="h-3 w-3" />{roleConf?.label ?? u.role}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {isEditing ? (
                      <select value={editCompany} onChange={e => setEditCompany(e.target.value)} className={inputCls}>
                        <option value="">Brak firmy</option>
                        {(companies ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Building2 className="h-3 w-3" />{u.companyName}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleSave(u)} disabled={updateRole.isPending || updateCompany.isPending}
                          className="flex items-center gap-1 rounded-md fire-gradient px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                          <Save className="h-3 w-3" />Zapisz
                        </button>
                        <button onClick={() => setEditingUser(null)}
                          className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
                          Anuluj
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingUser(u.id); setEditRole(u.role); setEditCompany(u.company_id ?? ""); }}
                        className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors">
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
  );
}

// ---------- MAIN PAGE ----------
export default function SettingsPage() {
  const { role: currentRole } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");

  const tabs = TABS.filter(t => !t.adminOnly || currentRole === "super_admin");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <SettingsIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ustawienia</h1>
          <p className="text-sm text-muted-foreground">Profil, bezpieczeństwo i powiadomienia</p>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-52 shrink-0 space-y-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                activeTab === id
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" />
                {label}
              </div>
              {activeTab !== id && <ChevronRight className="h-3.5 w-3.5 opacity-50" />}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeTab === "profile" && <ProfileTab />}
          {activeTab === "password" && <PasswordTab />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "users" && currentRole === "super_admin" && <UsersTab />}
        </div>
      </div>
    </div>
  );
}
