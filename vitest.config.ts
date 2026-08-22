import { defineConfig } from "vitest/config";

// Testy MUSZA chodzic w strefie czasowej uzytkownika aplikacji, nie w UTC.
// Aplikacja jest polska, a Postgres oddaje daty bez strefy ('2026-05-06').
// Pod UTC blad "date-only czytane jako UTC zamiast lokalnej polnocy" jest
// niewykrywalny - obie implementacje daja ten sam wynik. Bez tego ustawienia
// CI przepusci klase bledow, ktora u uzytkownika przesuwa daty o jeden dzien.
process.env.TZ = process.env.TZ || "Europe/Warsaw";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
