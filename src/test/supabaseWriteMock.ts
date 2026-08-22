/**
 * Lekka atrapa klienta Supabase do testowania hookow ZAPISUJACYCH.
 * Zapisuje kazda operacje, zeby test mogl sprawdzic, co dokladnie
 * poleci do bazy - i czy wolano .select() (czyli RETURNING), co przy
 * roli anon wywraca cale zapytanie.
 */
export type Operacja = {
  table: string;
  kind: "insert" | "select" | "delete" | "update";
  payload?: any;
  filters: Array<[string, unknown]>;
  wolanoSelect: boolean;
  single: boolean;
};

export function createWriteMock(fixtures: Record<string, any> = {}, user: any = null) {
  const ops: Operacja[] = [];

  function builder(table: string) {
    const op: Operacja = { table, kind: "select", filters: [], wolanoSelect: false, single: false };
    ops.push(op);

    const wynik = () => {
      const f = fixtures[table];
      const dane = typeof f === "function" ? f(op) : f;
      if (dane instanceof Error) return { data: null, error: { message: dane.message } };
      return { data: dane ?? null, error: null };
    };

    const api: any = {
      insert(payload: any) { op.kind = "insert"; op.payload = payload; return api; },
      update(payload: any) { op.kind = "update"; op.payload = payload; return api; },
      delete() { op.kind = "delete"; return api; },
      select(cols?: string) { op.wolanoSelect = true; if (cols) op.payload = op.payload ?? undefined; return api; },
      eq(col: string, val: unknown) { op.filters.push([col, val]); return api; },
      order() { return api; },
      limit() { return api; },
      single() { op.single = true; return Promise.resolve(wynik()); },
      maybeSingle() { op.single = true; return Promise.resolve(wynik()); },
      then(onOk: any, onErr: any) { return Promise.resolve(wynik()).then(onOk, onErr); },
    };
    return api;
  }

  const supabase = {
    from: (t: string) => builder(t),
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({ data: { session: user ? { user } : null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  };

  return { supabase, ops, ostatnia: (table: string) => [...ops].reverse().find((o) => o.table === table) };
}
