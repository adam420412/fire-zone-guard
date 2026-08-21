/**
 * Testy strazujace poprawki bezpieczenstwa.
 *
 * Sa to swiadomie testy na zrodlach: pilnuja, zeby usunieta dziura nie
 * wrocila przy nastepnym "szybkim fixie". Nie zastepuja weryfikacji na
 * produkcji - ta jest wbudowana w sama migracje (blok DO ... RAISE EXCEPTION).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const HARDENING = "20260820120000_security_hardening.sql";

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function migrationFiles() {
  return readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
}

describe("migracja hardeningowa", () => {
  it("istnieje i jest ostatnia w kolejnosci", () => {
    const files = migrationFiles();
    expect(files).toContain(HARDENING);
    expect(files[files.length - 1]).toBe(HARDENING);
  });

  it("zamyka anonimowy odczyt tabeli buildings", () => {
    const sql = read(`supabase/migrations/${HARDENING}`);
    expect(sql).toMatch(/DROP\s+POLICY\s+IF\s+EXISTS\s+"buildings_anon_read"\s+ON\s+public\.buildings/i);
  });

  it("usuwa wadliwe funkcje auth.user_role / auth.user_company_id", () => {
    const sql = read(`supabase/migrations/${HARDENING}`);
    expect(sql).toMatch(/DROP\s+FUNCTION\s+IF\s+EXISTS\s+auth\.user_role\(\)\s+CASCADE/i);
    expect(sql).toMatch(/DROP\s+FUNCTION\s+IF\s+EXISTS\s+auth\.user_company_id\(\)\s+CASCADE/i);
  });

  it("ma wbudowana weryfikacje, ktora rzuca wyjatkiem przy nieudanym wdrozeniu", () => {
    const sql = read(`supabase/migrations/${HARDENING}`);
    expect(sql).toMatch(/RAISE\s+EXCEPTION/i);
    expect(sql).toMatch(/pg_policies/i);
    expect(sql).toMatch(/pg_proc/i);
  });

  it("zadna pozniejsza migracja nie przywraca polityki anon na buildings", () => {
    const after = migrationFiles().filter((f) => f > HARDENING);
    for (const f of after) {
      const sql = readFileSync(join(MIGRATIONS, f), "utf8");
      expect(
        /CREATE\s+POLICY[\s\S]{0,200}ON\s+public\.buildings[\s\S]{0,80}TO\s+anon/i.test(sql),
      ).toBe(false);
    }
  });
});

describe("klient Supabase", () => {
  it("nie podmienia auth locka na no-op", () => {
    const src = read("src/integrations/supabase/client.ts");
    // Sam komentarz o locku jest OK - chodzi o realna opcje `lock:` w konfiguracji.
    const withoutComments = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(withoutComments).not.toMatch(/\block\s*:/);
    expect(withoutComments).not.toMatch(/noopLock/);
  });
});

describe("useAuth - ksztalt kodu", () => {
  it("callback onAuthStateChange nie jest funkcja async", () => {
    const src = read("src/hooks/useAuth.tsx");
    expect(src).toMatch(/onAuthStateChange\(/);
    expect(src).not.toMatch(/onAuthStateChange\(\s*async/);
  });
});

describe("zapytania o profil w calym src/", () => {
  it("nigdzie nie filtruje profiles po kolumnie id przy uzyciu auth uid", () => {
    const offenders: string[] = [];
    const authUidVars = [
      "user.id",
      "user?.id",
      "userId",
      "u.id",
      "session.user.id",
      "auth.uid",
    ];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "test") continue;
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const src = readFileSync(full, "utf8");
        const re = /from\(\s*["']profiles["']\s*\)([\s\S]{0,300}?)(?:maybeSingle|single|\)\s*;|\n\n)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          const chunk = m[1];
          const eqId = /\.eq\(\s*["']id["']\s*,\s*([^)]+)\)/.exec(chunk);
          if (!eqId) continue;
          const arg = eqId[1].trim();
          if (authUidVars.some((v) => arg === v || arg.startsWith(v))) {
            offenders.push(`${full.replace(ROOT + "/", "")}: .eq("id", ${arg})`);
          }
        }
      }
    };

    walk(join(ROOT, "src"));
    expect(offenders).toEqual([]);
  });
});

describe("edge function provision-admin-accounts", () => {
  const src = read("supabase/functions/provision-admin-accounts/index.ts");

  it("ma kill-switch wylaczajacy funkcje domyslnie", () => {
    expect(src).toMatch(/ALLOW_ADMIN_PROVISIONING/);
    expect(src).toMatch(/!==\s*["']true["']/);
  });

  it("weryfikuje, ze wolajacy jest zalogowanym super_adminem", () => {
    expect(src).toMatch(/auth\.getUser\(\s*token\s*\)/);
    expect(src).toMatch(/from\(\s*["']user_roles["']\s*\)/);
    expect(src).toMatch(/super_admin/);
  });

  it("bramki stoja przed jakimkolwiek resetem hasla", () => {
    const guardIdx = src.indexOf("ALLOW_ADMIN_PROVISIONING");
    const roleIdx = src.indexOf('from("user_roles")');
    const resetIdx = src.indexOf("admin.auth.admin.createUser");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(roleIdx).toBeGreaterThan(-1);
    expect(resetIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(resetIdx);
    expect(roleIdx).toBeLessThan(resetIdx);
  });
});

describe("repozytorium", () => {
  it(".gitignore obejmuje plik .env", () => {
    const ignore = read(".gitignore").split("\n").map((l) => l.trim());
    expect(ignore).toContain(".env");
  });
});
