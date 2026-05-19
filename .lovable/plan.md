## Plan: Moduł Checklisty + PDF podsumowanie aplikacji dla klienta

### Zakres
Dwa niezależne zadania:
1. Uruchomienie migracji modułu Checklisty/Audyty (już istnieje w repo, ale tabele nie są jeszcze w bazie).
2. Wygenerowanie/„skoroszytu" PDF dla klienta opisującego co aplikacja potrafi (moduł po module).

---

### 1. Migracja checklistów (priorytet)

Plik `supabase/migrations/20260424220000_iter8_checklists.sql` (452 linie) istnieje, ale tabele `checklist_templates`, `checklist_runs` itd. nie zostały jeszcze utworzone w bazie (sprawdzone: `to_regclass` zwraca NULL).

Migracja tworzy:
- `checklist_templates` + `checklist_template_items` — szablony (systemowe globalne + per firma)
- `checklist_runs` + `checklist_run_items` — wykonania audytu + snapshoty pozycji ze statusem OK/NIE_OK/N/A, notatką, zdjęciami
- Bucket `audit-photos` (public, do zdjęć z audytu) i `audit-protocols` (public, do PDF protokołów)
- Pełne RLS: super_admin / admin firmy / wykonawca / klient (read-only w firmie)
- 6 szablonów systemowych (audyt pełny PPOŻ, sprzęt G/H/SSP/DSO, BHP) — wstawiane na końcu pliku

Kroki:
1. Uruchomić migrację jednym wywołaniem `supabase--migration` (cały plik 1:1, idempotentny dzięki `IF NOT EXISTS` / `DROP POLICY IF EXISTS` / `ON CONFLICT DO NOTHING`).
2. Po zatwierdzeniu zweryfikować, że strony `src/pages/ChecklistsPage.tsx` i `src/pages/ChecklistRunPage.tsx` oraz hook `src/hooks/useChecklists.ts` (już zbudowane, 1482 linie razem) działają z nowymi tabelami — bez zmian w kodzie, tylko regeneracja `types.ts`.
3. Sprawdzić, że 6 systemowych szablonów się załadowało (`SELECT code, name FROM checklist_templates WHERE is_system`).

Nie ruszamy istniejących stron checklist — kod jest już gotowy i czeka na schemat.

---

### 2. PDF „Co umie aplikacja" dla klienta

Cel: jeden plik PDF, który właściciel firmy może wysłać do klienta jako prezentację możliwości systemu Fire Zone.

Realizacja jako **artefakt /mnt/documents/** (jednorazowy skrypt Pythona z reportlab — to nie jest funkcja w aplikacji, tylko dokument do pobrania). Tak szybciej i taniej niż budować nową stronę z generatorem.

Struktura PDF (~10–14 stron A4):
1. **Okładka** — logo Fire Zone, tytuł „Operator PPOŻ — przegląd modułów", data, wersja.
2. **Spis treści** + 1 strona executive summary (co system robi w 5 zdaniach).
3. **Po jednej kartce na moduł** (każda: ikona + opis + lista funkcji + przykładowy przepływ):
   - Dashboard + statusy bezpieczeństwa (czerwony/żółty/zielony, auto-kalkulacja)
   - Firmy + Kontakty firmowe (multi-przypisanie do obiektów)
   - Obiekty (opis, plany kondygnacji, dokumenty, urządzenia z QR)
   - Zadania / Kanban (statusy, komentarz przy zamknięciu, finanse, subtaski)
   - Zgłoszenia SLA (publiczny formularz, AI-analiza zdjęć, czas reakcji)
   - Audyty + Protokoły + **Checklisty** (świeżo dodane)
   - Urządzenia + automatyczne interwały serwisowe
   - Szkolenia + Certyfikaty + Macierz obecności
   - Pracownicy (rozwój, badania, onboarding)
   - Spotkania + Kalendarz (kodowanie kolorami)
   - CRM / Sprzedaż / Szanse (lead → firma+obiekt+zadanie)
   - Biblioteka + RAG (wyszukiwanie semantyczne dokumentów)
   - Raporty + KPI + PDF eksport
   - Integracja Telegram (powiadomienia)
   - Panel Klienta + role i RLS
4. **Strona końcowa** — kontakt, kod QR do publishowanego URL.

Styl wizualny zgodny z brandem: pomarańczowy nagłówek (#ea580c), ciemna typografia, ramki sekcji, ikony Unicode/emoji.

Plik wyjściowy: `/mnt/documents/fire-zone-prezentacja-klient.pdf`. Po wygenerowaniu QA przez konwersję do JPEG (`pdftoppm`) i przegląd każdej strony pod kątem cięcia tekstu/nakładania.

Dostarczam jako `<presentation-artifact>` z mime `application/pdf`.

---

### Kolejność wykonania
1. **Najpierw** migracja checklistów (asynchroniczna, czeka na zatwierdzenie).
2. **Równolegle** generowanie PDF (skrypt Pythona w `/tmp/`, output do `/mnt/documents/`).
3. Po obu — krótki raport co działa.

### Co NIE wchodzi w ten plan
- Nowa strona „/summary" w aplikacji z generatorem PDF — to byłoby zbędne obciążenie kodu pod jednorazowy artefakt. Jeśli zechcesz to mieć **w aplikacji** (np. przycisk w Ustawieniach „Pobierz prezentację dla klienta"), powiedz — to osobny ticket.
- Modyfikacje stron checklist (są już gotowe).
- Treści marketingowe poza opisem funkcji.
