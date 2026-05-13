## Status — co już jest zrobione

Po sprawdzeniu kodu, z poprzedniego pakietu zmian wszystkie 3 punkty zostały **wdrożone**:

1. **Edycja danych firmy (NIP + adres)** — `ManageCompanyDialog` w `src/pages/CompaniesPage.tsx` ma już pola Nazwa / NIP / Adres + przycisk pobrania z rejestru MF. Działa dla `super_admin` i `admin`.
2. **Osoby kontaktowe firmy z wieloma obiektami** — tabele `company_contacts` + `company_contact_buildings` z RLS, hook `useCompanyContacts`, sekcja "Osoby kontaktowe" w karcie klienta z multi-select obiektów, edycją i usuwaniem. Wszystkie pola poza imieniem są opcjonalne.
3. **Inline edycja tytułu i opisu zadania** — w `TaskDetailDialog.tsx` (ikona ołówka, zapis przez `useUpdateTask`).

## Co zostało do dokończenia

Punkt 3 z Twojej uwagi mówił o **edycji opisu OBIEKTU** w kontekście zlecenia — ten konkretny przypadek nie jest jeszcze pełny. Sprawdziłem:

- Tabela `buildings` **nie ma** kolumny `description` ani `notes` — jest tylko nazwa, adres, IBP, plan ewakuacji.
- `EditBuildingDialog` (BuildingDetailPage.tsx, linia 50) edytuje tylko: nazwa, firma, adres, IBP.
- Brak miejsca, gdzie można dopisać opis/uwagi do obiektu.

## Plan

### 1. Dodanie pola "Opis / uwagi" do obiektu

- Migracja: `ALTER TABLE buildings ADD COLUMN description text DEFAULT ''`.
- `EditBuildingDialog` — dodać `Textarea` "Opis obiektu (uwagi, dojazd, kontakt techniczny, specyfika)".
- `BuildingDetailPage` — wyświetlić opis pod nagłówkiem obiektu (jeśli jest), z ikoną ołówka otwierającą ten sam dialog.
- W `TaskDetailDialog` — w sekcji informacji o powiązanym obiekcie pokazać ten opis (read-only podgląd) z linkiem "Edytuj obiekt" prowadzącym do strony obiektu — żeby z poziomu zlecenia widzieć kontekst.

### 2. Komponent `EditableText` — uniwersalna inline-edycja

Wprowadzimy mały reużywalny komponent `src/components/EditableText.tsx`:

- Props: `value`, `onSave(newValue)`, `placeholder`, `multiline?`, `canEdit?`, `maxLength?`.
- Klik → input/textarea + Save / Anuluj.
- Walidacja długości (Zod), toast błędu/sukcesu.

Zastosujemy go etapami w miejscach, gdzie dziś brakuje edycji:

- Nazwa i adres obiektu (nagłówek BuildingDetailPage) — szybka edycja bez otwierania dialogu.
- Opis obiektu (po migracji wyżej).
- Notatki w protokołach (`service_protocols.notes`) — sekcja u góry strony protokołu.
- Notatki audytu (`audits.notes`).
- Opis/uwagi urządzenia (`devices.notes`) — z poziomu listy urządzeń obiektu.
- Notatki kontaktu firmy (`company_contacts.notes`).

Każde z tych miejsc dostanie ten sam pattern: tekst + ikona ołówka, klik → edycja → zapis przez odpowiedni hook (`useUpdateBuilding`, `useUpdateDevice`, itp.).

### 3. Ujednolicenie uprawnień

Wszędzie sprawdzamy `role === 'super_admin' || role === 'admin'` (admin firmy) — pracownik / klient widzi tylko podgląd. RLS już to wymusza po stronie bazy, ale dodamy też ukrywanie ikony ołówka w UI, żeby nie pokazywać akcji niedostępnych.

### Pliki do utworzenia / edycji

- migracja SQL: dodanie `buildings.description`
- `src/components/EditableText.tsx` (nowy)
- `src/pages/BuildingDetailPage.tsx` (dodanie pola opis + użycie EditableText na nazwie/adresie/opisie)
- `src/components/TaskDetailDialog.tsx` (pokazanie opisu obiektu w karcie zlecenia)
- `src/pages/ProtocolDetailPage.tsx`, `src/pages/AuditDetailPage.tsx`, `src/pages/BuildingDevicesPage.tsx`, `src/pages/CompaniesPage.tsx` (CompanyContactDialog) — punktowe użycia `EditableText`

### Rekomendacja kolejności

1. Najpierw migracja `buildings.description` + EditBuildingDialog + wyświetlenie w karcie zlecenia (rozwiązuje wprost Twój przykład).
2. Potem komponent `EditableText` i etapowo nakładanie go na pozostałe pola.

Zaczniemy od kroku 1, bo on bezpośrednio adresuje zgłoszony brak. Jeśli zatwierdzisz plan, przechodzę do implementacji.
