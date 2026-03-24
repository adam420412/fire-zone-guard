import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();

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

        {isLogin && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-center space-y-1">
            <p className="text-xs font-semibold text-primary">Konto demo</p>
            <p className="text-xs text-muted-foreground">Email: <span className="font-mono text-foreground">admin@firezone.pl</span></p>
            <p className="text-xs text-muted-foreground">Hasło: <span className="font-mono text-foreground">Test123!</span></p>
          </div>
        )}

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
            minLength={6}
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
            {loading ? "..." : isLogin ? "Zaloguj się" : "Zarejestruj się"}
          </button>

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
      </div>
    </div>
  );
}
