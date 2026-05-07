
## Cel

Trzy uzupełnienia funkcjonalne zgłoszone przez użytkownika:

1. Pełna edycja danych firmy (nie tylko nazwa).
2. Kontakty na poziomie firmy z przypisaniem do jednego lub wielu obiektów.
3. Możliwość edycji opisu (i tytułu) zadania bezpośrednio w karcie zadania – jako wzorzec inline-edit do późniejszego rozszerzenia na inne miejsca.

---

## 1. Edycja danych firmy

**Plik:** `src/pages/CompaniesPage.tsx` → `ManageCompanyDialog`

Aktualnie pokazuje wyłącznie pole „Nazwa". Tabela `companies` ma już kolumny `nip` i `address` – brak im UI. Zmiany:

- Dodać pola: **NIP**, **Adres**.
- Przycisk „Pobierz z GUS/MF" obok NIP (reuse `fetchCompanyByNIP` z tej samej strony) – auto-uzupełnia nazwę i adres, jeśli pola są puste lub po potwierdzeniu.
- `useUpdateCompany` już istnieje – przekazać `{ name, nip, address }`.
- Walidacja: NIP opcjonalny, jeśli podany to 10 cyfr (checksum tak jak w onboardingu – wystarczy regex długości).
- Dialog dostępny dla `super_admin` (jak teraz) oraz `admin` firmy (RLS na `companies` już to pozwala – `is_company_admin`). Otworzyć przycisk zarządzania także dla admina firmy.

---

## 2. Kontakty firmy z wieloma obiektami

Obecne kontakty (`building_contacts`) są przypięte do **jednego** obiektu. Wymaganie: kontakt firmowy może należeć do **wielu** obiektów, a wszystkie pola poza imieniem mają być opcjonalne i edytowalne w przyszłości.

### Migracja DB

Nowe tabele:

- `company_contacts` — `company_id`, `full_name` (wymagane), `position`, `phone`, `email`, `notes`, `is_primary`, `is_emergency`, `created_at`, `updated_at`.
- `company_contact_buildings` — junction: `contact_id` ↔ `building_id`, unique parą.

RLS:
- SELECT: `company_id = get_user_company_id(auth.uid())` lub `is_super_admin()`.
- INSERT/UPDATE/DELETE: `is_company_admin(company_id)` lub `is_super_admin()`.
- Junction: dziedziczy poprzez EXISTS na `company_contacts`.

Trigger `set_updated_at` na `company_contacts`.

### Hooki

Nowy plik `src/hooks/useCompanyContacts.ts`:
- `useCompanyContacts(companyId)` – pobiera kontakty + listę przypisanych `building_id`.
- `useCreateCompanyContact` – insert kontaktu + insert junction dla wybranych obiektów.
- `useUpdateCompanyContact` – update + diff przypięć obiektów (delete usunięte, insert nowe).
- `useDeleteCompanyContact`.

### UI

W `ManageCompanyDialog` dodać sekcję **„Osoby kontaktowe"** pod „Przypisane Obiekty":
- Lista kontaktów (imię, funkcja, telefon, email, badge dla obiektów: liczba lub nazwy).
- Każdy wiersz: ikony „Edytuj" / „Usuń".
- Przycisk „Dodaj osobę" → otwiera podformularz `CompanyContactDialog`:
  - Pola: imię i nazwisko (wymagane), funkcja, telefon, email, notatka, switch „Główny", „Awaryjny".
  - Multi-select obiektów (lista checkboxów z `companyBuildings`) – żaden, jeden lub wiele.
- Edycja działa identycznie z prefillem.

Wszystkie pola poza imieniem dopuszczają puste wartości – łatwe późniejsze uzupełnienie.

---

## 3. Edycja opisu i tytułu zadania

**Plik:** `src/components/TaskDetailDialog.tsx`

Aktualnie `task.title` i `task.description` to read-only.

Zmiany w zakładce „Szczegóły":

- Tytuł (`DialogTitle`) → klik włącza tryb edycji (input + zapisz/anuluj).
- Opis – jeśli jest, pokazuj tekst z ikoną ołówka; jeśli nie ma – przycisk „Dodaj opis". Klik przełącza na `Textarea` z przyciskami „Zapisz" / „Anuluj".
- Zapis przez istniejący `useUpdateTask` (już używany w komponencie do statusu/priorytetu) – pole `title` lub `description`.
- Uprawnienia: edycja tylko gdy `is_company_admin` (rola admin/super_admin) – sprawdzane przez `useAuth().role`.
- Po zapisie: invalidate cache zadania, toast „Zaktualizowano".

To ustala wzorzec inline-edit, który w kolejnych iteracjach łatwo przenieść na inne miejsca (obiekty, urządzenia, kontakty itd.) – w tej iteracji ograniczamy się do zadania, bo to konkretny przykład podany przez użytkownika.

---

## Sekcja techniczna

- Migracja SQL utworzy `company_contacts` + `company_contact_buildings` z RLS opartym o `is_company_admin` / `get_user_company_id` / `is_super_admin` (już istnieją w bazie).
- `useUpdateCompany` w `useSupabaseData.ts` – sprawdzić, czy przepuszcza dowolne pola `updates`; jeśli nie, rozszerzyć typ.
- Multi-select obiektów: prosty komponent z `Checkbox` z `@/components/ui/checkbox` na liście `companyBuildings` (już ładowane w dialogu).
- Brak nowych zależności.

---

## Pliki

- Migracja: tabele `company_contacts`, `company_contact_buildings` + RLS + trigger.
- `src/hooks/useCompanyContacts.ts` (nowy).
- `src/hooks/useSupabaseData.ts` (drobna korekta typów `useUpdateCompany`, jeśli potrzebne).
- `src/pages/CompaniesPage.tsx` (rozszerzenie `ManageCompanyDialog` + nowy `CompanyContactDialog` + dostęp dla admina firmy).
- `src/components/TaskDetailDialog.tsx` (inline edit tytułu i opisu).
