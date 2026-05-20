## Cel

Stworzyć jedno miejsce w aplikacji, gdzie użytkownik (Admin Firmy, Serwisant, Klient) widzi **cały proces pracy w systemie** ułożony w logicznej kolejności: od dodania firmy/obiektu → przez urządzenia, pracowników, zadania, audyty, SLA → aż po raporty i certyfikaty. Z każdego kroku można od razu przejść do odpowiedniej sekcji i widać, czy etap jest "uzupełniony".

Obecnie istnieje już `OnboardingPage` (wizard początkowy: firma → obiekt → urządzenia → pracownicy → zadania), ale brakuje:
- trwałego "centrum nauki" dostępnego zawsze (nie tylko na start),
- widoku procesu **end-to-end** (nie tylko setup),
- śledzenia postępu i podpowiedzi "co dalej",
- samouczków per-rola.

## Co dodajemy

### 1. Strona `/workflow` — Centrum Workflow

Nowy `WorkflowGuidePage` z trzema zakładkami:

**a) Mapa procesu (default)**
- Wizualna oś pionowa (timeline) z fazami:
  1. **Setup firmy** — firma, obiekty, kontakty, dokumenty
  2. **Inwentaryzacja** — urządzenia ppoż., plany pięter, QR kody
  3. **Zespół** — pracownicy, role, szkolenia, badania
  4. **Praca operacyjna** — zadania (Kanban), zlecenia SLA, kalendarz
  5. **Audyty i protokoły** — audyty cykliczne, checklisty, protokoły
  6. **Raporty i certyfikaty** — PDF, bloki certyfikacyjne, panel klienta
  7. **Automatyzacja** — AI Agent, automatyczne intervale, powiadomienia
- Każda faza = karta z: opisem celu, listą "co tu robisz", linkami do stron, miniaturą **statusu uzupełnienia** (np. "3/5 obiektów ma plany pięter") liczonego z istniejących danych.
- Strzałki/connectory pokazujące zależności (np. "Urządzenia → wymagane zanim odpalisz audyt").

**b) Samouczek krok-po-kroku**
- Lista 8–12 kroków (Akordeon) opartych o realne ścieżki:
  - "Dodaj pierwszą firmę", "Wgraj plan piętra", "Zeskanuj QR urządzenia", "Utwórz zadanie cykliczne z szablonu", "Odpowiedz na zgłoszenie SLA", "Wygeneruj raport miesięczny" itp.
- Każdy krok ma: krótki opis, screenshot/ikonę, przycisk "Otwórz" (deep-link), checkbox "zrobione" (zapisywany lokalnie w `localStorage`, klucz per-user).
- Filtr per rola: Admin / Serwisant / Klient — pokazuje tylko istotne kroki.

**c) Schematy flow zadaniowych**
- Mermaid-style diagramy (renderowane jako SVG/komponenty) dla najczęstszych flow:
  - "Zgłoszenie SLA od klienta → przyjęcie → przypisanie serwisanta → realizacja → protokół → zamknięcie"
  - "Audyt cykliczny → checklist → wykryta usterka → zadanie naprawcze (młotek) → re-test"
  - "Nowy pracownik → onboarding → plan rozwoju → szkolenia → badania"
- Te same diagramy podpowiadają, **gdzie kliknąć** w systemie na każdym etapie.

### 2. Widget "Następny krok" na Dashboardzie

Mała karta na górze Dashboardu (Admin) z **dynamiczną sugestią** opartą o stan danych:
- Brak firm → "Dodaj pierwszą firmę" → `/onboarding`
- Firma bez obiektów → "Dodaj obiekt"
- Obiekty bez urządzeń → "Zinwentaryzuj urządzenia"
- Brak pracowników → "Dodaj zespół"
- Wszystko OK → "Zobacz pełny przewodnik" → `/workflow`
- Przycisk "Ukryj" (localStorage).

### 3. Wejścia do Centrum

- Pozycja w głównej nawigacji (Sidebar): **"Przewodnik"** z ikoną `BookOpen` (obok Dashboardu).
- Link "?" w headerze AiBotPanel → "Zobacz przewodnik workflow".
- Po ukończeniu `OnboardingPage` → CTA "Przejdź do pełnego przewodnika" zamiast tylko Dashboard.

### 4. Liczenie postępu (read-only)

Hook `useWorkflowProgress()`:
- Zlicza z istniejących tabel: ile firm/obiektów/urządzeń/pracowników/zadań/audytów ma użytkownik (w obrębie swojej firmy, RLS).
- Zwraca `{ phase: 'setup'|'inventory'|..., completion: 0..100, nextStep: {...} }`.
- Bez zmian w DB — sam SELECT na istniejących tabelach.

## Sekcja techniczna

- **Nowe pliki:**
  - `src/pages/WorkflowGuidePage.tsx` — strona z 3 zakładkami (Tabs z shadcn).
  - `src/components/workflow/ProcessMap.tsx` — timeline faz.
  - `src/components/workflow/StepByStepGuide.tsx` — akordeon kroków z localStorage.
  - `src/components/workflow/FlowDiagrams.tsx` — diagramy SVG/Mermaid (statyczne komponenty React, bez biblioteki — kilka box+arrow w Tailwind).
  - `src/components/workflow/NextStepWidget.tsx` — widget na Dashboard.
  - `src/hooks/useWorkflowProgress.ts` — agregacja stanu danych.
  - `src/lib/workflowSteps.ts` — definicje kroków/faz/diagramów (data-only, łatwe do edycji).
- **Edycje:**
  - `src/App.tsx` — route `/workflow` (lazy import).
  - `src/components/AppSidebar.tsx` (lub odpowiednik) — pozycja "Przewodnik".
  - `src/pages/Dashboard.tsx` — wstaw `<NextStepWidget />` na górze.
  - `src/pages/OnboardingPage.tsx` — w kroku "done" CTA na `/workflow`.
- **Bez migracji DB**, bez nowych edge functions. Wszystko frontend + odczyty z istniejących tabel.
- **Stan ukończenia kroków** trzymany w `localStorage` pod kluczem `fz:workflow:progress:{userId}` — proste, bez nowej tabeli. Jeśli później chcemy synchronizować między urządzeniami, można dodać tabelę `user_workflow_progress` w osobnym kroku.
- **Style:** istniejące semantic tokens (fire theme, dark mode), ikony lucide, Tailwind.
- **Responsywność:** timeline na mobile zwija się w stack, na desktop oś po lewej + treść po prawej.

## Co świadomie pomijam (na razie)

- Interaktywny in-app tour z tooltipami (typu react-joyride) — zostawiamy diagramy + deep-linki, bo są tańsze i bardziej elastyczne.
- Zapisywanie postępu w DB — `localStorage` wystarczy na MVP.
- Tłumaczenia EN — treści po polsku, zgodnie z resztą aplikacji.
