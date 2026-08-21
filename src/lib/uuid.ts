/**
 * Walidacja UUID v1-v5 (plus wariant nil).
 *
 * Powod istnienia: publiczny formularz zgloszen pozwala wpisac nazwe obiektu
 * recznie, gdy anonim nie widzi listy budynkow. Taki tekst NIE moze trafic do
 * kolumny building_id (uuid + FK) - Postgres odrzuci cale zgloszenie bledem
 * "invalid input syntax for type uuid".
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Zwraca wartosc tylko jesli jest poprawnym UUID, w przeciwnym razie null. */
export function asUuidOrNull(value: unknown): string | null {
  return isUuid(value) ? (value as string) : null;
}
