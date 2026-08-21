/**
 * Atrapa klienta Supabase odwzorowujaca semantyke AUTH LOCKA.
 *
 * Prawdziwy supabase-js serializuje operacje auth na jednym zamku
 * (navigator.locks). Callback onAuthStateChange jest wywolywany Z JUZ
 * ZAJETYM zamkiem i - jesli jest funkcja `async` - zamek pozostaje zajety
 * az do rozwiazania zwroconej obietnicy. Kazde zapytanie REST/auth w srodku
 * czeka wiec na zamek, ktorego samo nie zwolni. To jest deadlock, przez
 * ktory aplikacja wisiala na spinnerze.
 *
 * Ta atrapa odtwarza dokladnie ten mechanizm, dzieki czemu test naprawde
 * lapie regresje, a nie tylko sprawdza ksztalt kodu.
 */

export type QueryCall = {
  table: string;
  select: string | null;
  filters: Array<[string, unknown]>;
  single: boolean;
  duringAuthCallback: boolean;
};

export type FakeDb = Record<string, Array<Record<string, unknown>>>;

export function createSupabaseMock(db: FakeDb, session: unknown = null) {
  const calls: QueryCall[] = [];
  const waiters: Array<() => void> = [];
  let lockHeld = false;
  let inAuthCallback = false;
  let listener: ((event: string, session: unknown) => unknown) | null = null;

  async function acquire() {
    if (!lockHeld) {
      lockHeld = true;
      return;
    }
    await new Promise<void>((resolve) => waiters.push(resolve));
    lockHeld = true;
  }

  function release() {
    lockHeld = false;
    const next = waiters.shift();
    if (next) next();
  }

  function rows(call: QueryCall) {
    const source = db[call.table] ?? [];
    return source.filter((row) =>
      call.filters.every(([col, val]) => row[col] === val),
    );
  }

  async function exec(call: QueryCall) {
    call.duringAuthCallback = inAuthCallback;
    await acquire();
    try {
      const matched = rows(call);
      if (!call.single) return { data: matched, error: null };
      if (matched.length > 1) {
        // Zachowanie PostgREST dla .maybeSingle() przy wielu wierszach.
        return {
          data: null,
          error: {
            code: "PGRST116",
            message: "JSON object requested, multiple (or no) rows returned",
          },
        };
      }
      return { data: matched[0] ?? null, error: null };
    } finally {
      release();
    }
  }

  function builder(table: string) {
    const call: QueryCall = {
      table,
      select: null,
      filters: [],
      single: false,
      duringAuthCallback: false,
    };
    calls.push(call);

    const api: any = {
      select(cols: string) {
        call.select = cols;
        return api;
      },
      eq(col: string, val: unknown) {
        call.filters.push([col, val]);
        return api;
      },
      in(col: string, vals: unknown[]) {
        call.filters.push([col, vals]);
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle() {
        call.single = true;
        return exec(call);
      },
      then(onOk: any, onErr: any) {
        return exec(call).then(onOk, onErr);
      },
    };
    return api;
  }

  const supabase = {
    from: (table: string) => builder(table),
    auth: {
      getSession: async () => {
        await acquire();
        try {
          return { data: { session }, error: null };
        } finally {
          release();
        }
      },
      onAuthStateChange: (cb: (event: string, session: unknown) => unknown) => {
        listener = cb;
        return {
          data: { subscription: { unsubscribe: () => { listener = null; } } },
        };
      },
      signInWithPassword: async () => ({ error: null }),
      signUp: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
    },
  };

  /** Emituje zdarzenie auth trzymajac zamek przez caly czas trwania callbacka. */
  async function emit(event: string, evtSession: unknown) {
    if (!listener) return;
    await acquire();
    inAuthCallback = true;
    try {
      const result = listener(event, evtSession);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        // Callback jest `async` - zamek zostaje zajety az do jego konca.
        await result;
      }
    } finally {
      inAuthCallback = false;
      release();
    }
  }

  return {
    supabase,
    emit,
    calls,
    isLockHeld: () => lockHeld,
    hasListener: () => listener !== null,
  };
}

/** Odrzuca obietnice po zadanym czasie - zamiast wieszac caly przebieg testu. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`DEADLOCK/TIMEOUT (${ms}ms): ${label}`)), ms),
    ),
  ]);
}
