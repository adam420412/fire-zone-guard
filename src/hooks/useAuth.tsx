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

/** Bezpiecznik: po tylu ms przestajemy czekac na role i puszczamy UI dalej. */
export const ROLE_TIMEOUT_MS = 8000;

/** Ile razy ponowic zapytanie o role, gdy baza zwroci blad. */
export const ROLE_MAX_ATTEMPTS = 3;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  // loading = "nie wiem jeszcze, kim jest uzytkownik".
  // MUSI obejmowac takze pobranie roli. Wczesniej loading gaslo zaraz po
  // ustaleniu sesji, a rola dojezdzala chwile pozniej - przez co interfejs
  // zdazyl sie wyrenderowac z role === null i chowal wszystko, co jest
  // zabramkowane rola (przyciski "Dodaj obiekt", "Dodaj klienta", sekcja
  // SUPER ADMIN). Przy wolniejszym laczu to okno rozciagalo sie na tyle,
  // ze wygladalo jak trwale zniknieciecie funkcji.
  const [sessionReady, setSessionReady] = useState(false);
  const [roleReady, setRoleReady] = useState(false);
  const loading = !sessionReady || !roleReady;

  const mountedRef = useRef(true);
  // uid, dla ktorego rola jest pobrana albo wlasnie leci zapytanie
  const roleForUidRef = useRef<string | null>(null);

  const fetchRole = async (userId: string, attempt = 0) => {
    try {
      // 1. Role. Bez .maybeSingle() - przy dwoch rolach rzucaloby PGRST116
      //    i uzytkownik zostawal z role === null (czyli bez dostepu do niczego).
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (roleError) {
        console.error("Error fetching role:", roleError);
        // BLAD != "uzytkownik nie ma roli". Na zimnym starcie to zapytanie
        // potrafi trafic w moment odswiezania tokena i wrocic z 401. Gdyby
        // potraktowac to jako brak roli, strony chronione rola (np. /admin)
        // przekierowywalyby na pulpit, mimo ze uzytkownik ma uprawnienia.
        if (attempt + 1 < ROLE_MAX_ATTEMPTS) {
          setTimeout(() => {
            if (mountedRef.current && roleForUidRef.current === userId) {
              void fetchRole(userId, attempt + 1);
            }
          }, 300 * (attempt + 1));
          return; // celowo NIE oznaczamy roli jako gotowej
        }
      }
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
    } finally {
      // Nawet przy bledzie musimy odblokowac UI - inaczej aplikacja
      // zostaje na spinnerze na zawsze.
      if (mountedRef.current && roleForUidRef.current === userId) {
        setRoleReady(true);
      }
    }
  };

  /**
   * Pobiera role dokladnie raz na uzytkownika. Bez tego strazu
   * TOKEN_REFRESHED (co godzine) migalby spinnerem i odpalal zbedne
   * zapytania.
   */
  const ensureRole = (userId: string) => {
    if (roleForUidRef.current === userId) return;
    roleForUidRef.current = userId;
    setRoleReady(false);
    // Poza callbackiem auth - zeby nie trzymac auth locka (deadlock).
    setTimeout(() => {
      if (mountedRef.current) void fetchRole(userId);
    }, 0);
    // Bezpiecznik na wypadek, gdyby zapytanie nigdy nie wrocilo.
    setTimeout(() => {
      if (mountedRef.current && roleForUidRef.current === userId) {
        setRoleReady(true);
      }
    }, ROLE_TIMEOUT_MS);
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
          ensureRole(u.id);
        } else {
          setRoleReady(true);
        }
      } catch (e) {
        console.error("Auth init error:", e);
        if (mountedRef.current) setRoleReady(true);
      } finally {
        if (mountedRef.current) setSessionReady(true);
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
      setSessionReady(true);
      if (u) {
        ensureRole(u.id);
      } else {
        roleForUidRef.current = null;
        setRole(null);
        setProfileId(null);
        setRoleReady(true);
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
