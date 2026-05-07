// ResetPasswordPage — strona resetu hasła otwierana z linka w mailu (#type=recovery).
// Musi być public route. Po ustawieniu nowego hasła wylogowuje sesję recovery i kieruje do logowania.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [isRecovery, setIsRecovery] = useState<boolean | null>(null);

  useEffect(() => {
    // Supabase emits PASSWORD_RECOVERY when arriving from a recovery link.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setIsRecovery(true);
    });
    // Fallback: detect type=recovery in hash
    if (window.location.hash.includes("type=recovery")) setIsRecovery(true);
    // Otherwise, after a short tick, check if we have a session at all
    const t = setTimeout(async () => {
      if (isRecovery === null) {
        const { data } = await supabase.auth.getSession();
        setIsRecovery(!!data.session);
      }
    }, 800);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkPasswordLeaked = async (pwd: string) => {
    const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(pwd));
    const hashArray = Array.from(new Uint8Array(hash));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const prefix = hashHex.substring(0, 5);
    const suffix = hashHex.substring(5);
    
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    const data = await response.text();
    return data.includes(suffix);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Hasło zbyt krótkie", description: "Min. 8 znaków.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Hasła się różnią", variant: "destructive" });
      return;
    }
    
    setLoading(true);
    try {
      const isLeaked = await checkPasswordLeaked(password);
      if (isLeaked) {
        toast({ title: "Hasło niebezpieczne", description: "To hasło znajduje się w bazie wycieków. Wybierz inne.", variant: "destructive" });
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Hasło zmienione", description: "Możesz się teraz zalogować." });
      await supabase.auth.signOut();
      navigate("/auth", { replace: true });
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
            <h1 className="text-xl font-bold text-foreground">Ustaw nowe hasło</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Wybierz silne, unikalne hasło. Min. 8 znaków.
            </p>
          </div>
        </div>

        {isRecovery === false ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-sm text-foreground">
            <p className="font-semibold mb-1">Link nieprawidłowy lub wygasł</p>
            <p className="text-xs text-muted-foreground mb-3">
              Wróć do logowania i poproś o nowy link resetu hasła.
            </p>
            <button onClick={() => navigate("/auth")}
              className="rounded-md fire-gradient text-primary-foreground px-4 py-2 text-sm">
              Powrót do logowania
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-6">
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" />
              <span>Hasła sprawdzane w bazie wycieków (HIBP)</span>
            </div>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                placeholder="Nowe hasło"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-secondary px-3 py-2 pr-10 text-sm text-foreground outline-none focus:border-primary"
                minLength={8}
                required
              />
              <button type="button" onClick={() => setShow(!show)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <input
              type={show ? "text" : "password"}
              placeholder="Powtórz hasło"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              minLength={8}
              required
            />
            <button
              type="submit"
              disabled={loading || isRecovery === null}
              className={cn(
                "w-full rounded-md py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2",
                "fire-gradient text-primary-foreground hover:opacity-90 disabled:opacity-50"
              )}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Zapisz nowe hasło
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
