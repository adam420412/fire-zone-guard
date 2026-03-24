# Fire Zone Guard V2 - System Zarządzania PPOŻ

Witaj w projekcie **Fire Zone Guard V2** – nowoczesnej platformie klasy Enterprise do monitorowania, audytowania i zarządzania bezpieczeństwem pożarowym obiektów.

## 🚀 Kluczowe Technologie
Projekt został zbudowany przy użyciu najnowocześniejszego stosu technologicznego:

- **React 18** + **TypeScript**
- **Vite** (Szybkie budowanie i HMR)
- **Supabase** (Real-time Database, Auth, Storage, Edge Functions)
- **TanStack Query** (Zarządzanie stanem i cache'owanie danych)
- **Tailwind CSS** + **shadcn-ui** (Nowoczesny, responsywny interfejs)
- **Lucide React** (Zestaw ikon premium)

## 🏛️ Główne Moduły Systemu
1. **Dashboard Premium**: Wizualny podgląd "Safety Score" oraz strumień aktywności w czasie rzeczywistym.
2. **Administracja Obiektami**: Pełne CRUD dla budynków, przypisywanie do firm i zarządzanie IBP.
3. **Ewidencja Urządzeń PPOŻ**: Baza urządzeń z automatycznym generowaniem kodów QR.
4. **Moduł HR i Szkolenia**: Zarządzanie zespołem, monitorowanie ważności badań lekarskich i szkoleń BHP.
5. **Kanban Operacyjny**: Przejrzysty widok zadań serwisowych i naprawczych.
6. **Raportowanie**: Eksport danych do formatów CSV oraz generowanie profesjonalnych protokołów PDF.

## 🛠️ Jak uruchomić projekt lokalnie?

1. **Sklonuj repozytorium**:
   ```sh
   git clone <URL_REPOZYTORIUM>
   cd fire-zone-guard-main
   ```

2. **Zainstaluj zależności**:
   ```sh
   npm install
   ```

3. **Skonfiguruj zmienne środowiskowe**:
   Stwórz plik `.env` i dodaj:
   ```env
   VITE_SUPABASE_URL=twoj_url
   VITE_SUPABASE_PUBLISHABLE_KEY=twoj_klucz
   ```

4. **Uruchom serwer deweloperski**:
   ```sh
   npm run dev
   ```

## 🔐 Bezpieczeństwo (RBAC)
System wykorzystuje mechanizmy **Row Level Security (RLS)** w Supabase, zapewniając pełną izolację danych między Super Administratorami a Klientami.

---
*Dokumentacja projektu Fire Zone Guard V2 - 2026*
