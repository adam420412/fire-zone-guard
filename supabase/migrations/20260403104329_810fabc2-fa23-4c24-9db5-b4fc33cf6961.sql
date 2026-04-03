
-- Add discount and approval fields to quotes
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 0;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS approved_by uuid;

-- Update services categories to match revenue types
UPDATE public.services SET category = 'Szkolenia' WHERE category = 'Szkolenia PPOŻ';
UPDATE public.services SET category = 'Serwis' WHERE category = 'Przeglądy';
UPDATE public.services SET category = 'Dokumentacja' WHERE category = 'Dokumentacja';

-- Insert additional services for missing categories
INSERT INTO public.services (name, description, unit, unit_price, category) VALUES
  ('Montaż systemu sygnalizacji pożaru', 'Instalacja i uruchomienie SSP', 'kpl.', 8500, 'Montaż'),
  ('Wykonanie instalacji hydrantowej', 'Budowa instalacji wewnętrznej', 'kpl.', 12000, 'Wykonawstwo'),
  ('Audyt PPOŻ obiektu', 'Kompleksowy audyt zgodności z przepisami', 'szt.', 3500, 'Audyty'),
  ('Odbiór techniczny instalacji', 'Odbiór i certyfikacja instalacji PPOŻ', 'szt.', 2000, 'Odbiory'),
  ('Montaż gaśnic i oznakowań', 'Rozmieszczenie gaśnic i znaków ewakuacyjnych', 'kpl.', 1500, 'Montaż'),
  ('Serwis systemu oddymiania', 'Przegląd i konserwacja klap dymowych', 'szt.', 800, 'Serwis')
ON CONFLICT DO NOTHING;
