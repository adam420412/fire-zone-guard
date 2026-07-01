import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Flame, MailCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [forgot, setForgot] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotSent(true);
      toast({ title: "Sprawdź skrzynkę", description: "Wysłaliśmy link do resetu hasła." });
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    if (!isLogin && !name.trim()) return;

    setLoading(true);
    try {
      if (isLogin) {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, name.trim());
      }
      toast({ title: isLogin ? "Zalogowano!" : "Konto utworzone!" });
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl fire-gradient">
            <Flame className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">Fire Zone</h1>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Operator PPOŻ</p>
          </div>
        </div>

        {forgot ? (
          <form onSubmit={handleForgot} className="space-y-4 rounded-lg border border-border bg-card p-6">
            <h2 className="text-center text-sm font-semibold text-card-foreground">Reset hasła</h2>
            {forgotSent ? (
              <div className="rounded-md border border-success/30 bg-success/10 p-3 text-center text-xs text-foreground">
                <MailCheck className="h-5 w-5 mx-auto mb-2 text-success" />
                Wysłaliśmy link do resetu hasła na <span className="font-mono">{email}</span>.
                Sprawdź skrzynkę (oraz folder Spam).
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground text-center">
                  Podaj swój e-mail, wyślemy link do ustawienia nowego hasła.
                </p>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  maxLength={255}
                  required
                />
                <button
                  type="submit"
                  disabled={loading}
                  className={cn(
                    "w-full rounded-md py-2.5 text-sm font-semibold transition-colors",
                    "fire-gradient text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  )}
                >
                  {loading ? "..." : "Wyślij link resetu"}
                </button>
              </>
            )}
            <p className="text-center text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => { setForgot(false); setForgotSent(false); }}
                className="text-primary hover:underline"
              >
                ← Wróć do logowania
              </button>
            </p>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-6">
          <h2 className="text-center text-sm font-semibold text-card-foreground">
            {isLogin ? "Logowanie" : "Rejestracja"}
          </h2>

          {!isLogin && (
            <input
              type="text"
              placeholder="Imię i nazwisko"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              maxLength={100}
              required={!isLogin}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            maxLength={255}
            required
          />
          <input
            type="password"
            placeholder="Hasło"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            minLength={8}
            required
          />
          {!isLogin && (
            <p className="text-[11px] text-muted-foreground -mt-2">
              Min. 8 znaków. Hasła sprawdzamy w bazie wycieków (HIBP).
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full rounded-md py-2.5 text-sm font-semibold transition-colors",
              "fire-gradient text-primary-foreground hover:opacity-90 disabled:opacity-50"
            )}
          >
            {loading ? "..." : isLogin ? "Zaloguj się" : "Zarejestruj się"}
          </button>

          {isLogin && (
            <p className="text-center text-xs">
              <button
                type="button"
                onClick={() => { setForgot(true); setForgotSent(false); }}
                className="text-muted-foreground hover:text-primary hover:underline"
              >
                Zapomniałem hasła
              </button>
            </p>
          )}

          <p className="text-center text-xs text-muted-foreground">
            {isLogin ? "Nie masz konta?" : "Masz już konto?"}{" "}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline"
            >
              {isLogin ? "Zarejestruj się" : "Zaloguj się"}
            </button>
          </p>
        </form>
        )}
      </div>
    </div>
  );
}
