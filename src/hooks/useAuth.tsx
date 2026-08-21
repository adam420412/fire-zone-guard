import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

interface AuthContext {
  user: User | null;
  loading: boolean;
  role: string | null;
  profileId: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthContext | null>(null);

/**
 * user_roles ma UNIQUE(user_id, role) - a NIE UNIQUE(user_id).
 * Jeden uzytkownik moze wiec miec kilka rol naraz. Wybieramy najsilniejsza.
 * Nizszy indeks = wyzsze uprawnienia.
 */
export const ROLE_PRIORITY = ["super_admin", "admin", "employee", "client"] as const;

export function pickPrimaryRole(rows: Array<{ role: string | null }> | null | undefined): string | null {
  if (!rows || rows.length === 0) return null;
  const roles = rows.map((r) => r?.role).filter(Boolean) as string[];
  if (roles.length === 0) return null;
  for (const candidate of ROLE_PRIORITY) {
    if (roles.includes(candidate)) return candidate;
  }
  // Rola spoza znanej listy (np. dodana pozniej w enumie) - bierzemy pierwsza.
  return roles[0];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchRole = async (userId: string) => {
    try {
      // 1. Role. Bez .maybeSingle() - przy dwoch rolach rzucaloby PGRST116
      //    i uzytkownik zostawal z role === null (czyli bez dostepu do niczego).
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (roleError) console.error("Error fetching role:", roleError);
      if (!mountedRef.current) return;
      setRole(pickPrimaryRole(roleRows as Array<{ role: string | null }> | null));

      // 2. Profil. profiles.id to wlasny UUID (gen_random_uuid()), a powiazanie
      //    z auth.users idzie przez profiles.user_id - patrz migracja
      //    20260218090315, tabela profiles. Filtrowanie po "id" zwracalo
      //    zawsze pusty wynik BEZ bledu, wiec profileId byl na stale null.
      const { data: profile, error: profError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (profError) console.error("Error fetching profile:", profError);
      if (!mountedRef.current) return;
      setProfileId(profile?.id ?? null);
    } catch (e) {
      console.error("fetchRole unexpected error:", e);
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const u = session?.user ?? null;
        if (!mountedRef.current) return;
        setUser(u);
        if (u) {
          await fetchRole(u.id);
        }
      } catch (e) {
        console.error("Auth init error:", e);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    initAuth();

    // UWAGA: callback MUSI byc synchroniczny.
    // supabase-js trzyma wewnetrzny auth lock przez caly czas trwania
    // callbacka. Kazde wywolanie supabase.from(...) / getSession() w srodku
    // czeka na ten sam lock -> deadlock i wieczny spinner. Dlatego stan
    // ustawiamy od razu, a zapytania do bazy odpalamy dopiero POZA
    // callbackiem (setTimeout 0).
    // Dokumentacja Supabase: "Do not use async functions as the callback".
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setLoading(false);
      if (u) {
        setTimeout(() => {
          if (mountedRef.current) void fetchRole(u.id);
        }, 0);
      } else {
        setRole(null);
        setProfileId(null);
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthCtx.Provider value={{ user, loading, role, profileId, signIn, signUp, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
