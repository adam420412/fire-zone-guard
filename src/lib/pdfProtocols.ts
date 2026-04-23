// =============================================================================
// pdfProtocols — per-type protocol PDF templates.
//
// Builds on top of lib/pdfGenerator (which renders the corporate header,
// metadata block, single autotable, notes, result, signature, page numbers).
// Each template here knows which columns its measurement table needs and
// transforms the measurement rows accordingly.
//
// Public API:
//   generateProtocolPDF(input) → routes by input.protocolType to the right
//                                template and calls generateReportPDF.
//
// Adding a new type: implement a TemplateBuilder that returns
// { tableColumns, tableData, extraMetadata } from the measurement rows, and
// register it in TEMPLATES below.
// =============================================================================
import { generateReportPDF } from "./pdfGenerator";

export type ProtocolType =
  | "hydranty"
  | "gasnice"
  | "ssp"
  | "oswietlenie"
  | "drzwi"
  | "klapy"
  | "dso"
  | "oddymianie"
  | "generic";

interface ProtocolHeader {
  building_name?: string | null;
  building_address?: string | null;
  inspector_name?: string | null;
  performed_at?: string | null;
  next_inspection_due?: string | null;
  protocol_number?: string | null;
  type?: string | null;
  notes?: string | null;
  overall_result?: string | null;
}

export interface GenerateProtocolInput {
  protocolType: ProtocolType;
  protocol: ProtocolHeader;
  measurements: Record<string, unknown>[];
  signatureDataUrl?: string;
  /** Optional override for the filename — defaults to a safe slugified version. */
  filename?: string;
}

interface TemplateOutput {
  tableColumns: string[];
  tableData: (string | number)[][];
  extraMetadata?: { label: string; value: string }[];
  titleOverride?: string;
}

type TemplateBuilder = (
  measurements: Record<string, unknown>[],
  protocol: ProtocolHeader,
) => TemplateOutput;

// ---- helpers ---------------------------------------------------------------
const fmt = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "number") return String(v);
  return String(v);
};
const fmtDate = (v: unknown): string => {
  if (!v) return "-";
  try { return new Date(String(v)).toLocaleDateString("pl-PL"); } catch { return String(v); }
};
const slug = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");

// ---- per-type templates ----------------------------------------------------
const hydrantyTemplate: TemplateBuilder = (rows) => ({
  titleOverride: "PROTOKÓŁ Z BADAŃ HYDRANTÓW WEWNĘTRZNYCH",
  tableColumns: [
    "Lp.", "Oznak.", "Rodzaj", "DN [mm]",
    "Ciśn. stat. [MPa]", "Ciśn. dyn. [MPa]", "Wydajność [dm³/s]", "Wynik",
  ],
  tableData: rows.map((m, i) => [
    i + 1,
    fmt(m.hydrant_number ?? m.number ?? m.label),
    fmt(m.type ?? m.subtype),
    fmt(m.dn_diameter ?? m.dn),
    fmt(m.static_pressure_mpa),
    fmt(m.dynamic_pressure_mpa),
    fmt(m.flow_rate_dm3s ?? m.flow_rate),
    fmt(m.result ?? m.status ?? "OK"),
  ]),
});

const gasniceTemplate: TemplateBuilder = (rows) => ({
  titleOverride: "PROTOKÓŁ KONSERWACJI GAŚNIC",
  tableColumns: [
    "Lp.", "Oznak.", "Typ", "Masa środka", "Prod.", "Data legalizacji", "Następna", "Wynik",
  ],
  tableData: rows.map((m, i) => [
    i + 1,
    fmt(m.label ?? m.number ?? m.serial_number),
    fmt(m.type ?? m.extinguisher_type ?? m.subtype),
    fmt(m.mass ?? m.agent_mass),
    fmt(m.manufacturer ?? m.producer),
    fmtDate(m.legalization_date ?? m.last_service_date),
    fmtDate(m.next_legalization_date ?? m.next_service_date),
    fmt(m.result ?? m.status ?? "OK"),
  ]),
});

const sspTemplate: TemplateBuilder = (rows) => ({
  titleOverride: "PROTOKÓŁ Z BADAŃ SSP (Sygnalizacja Pożarowa)",
  tableColumns: [
    "Lp.", "Element", "Lokalizacja", "Adres pętli", "Test funkcji", "Stan czujki", "Wynik",
  ],
  tableData: rows.map((m, i) => [
    i + 1,
    fmt(m.element ?? m.device ?? m.type),
    fmt(m.location ?? m.room),
    fmt(m.loop_address ?? m.address),
    fmt(m.function_test ?? m.test_result),
    fmt(m.detector_state ?? m.condition),
    fmt(m.result ?? m.status ?? "OK"),
  ]),
});

const oswietlenieTemplate: TemplateBuilder = (rows) => ({
  titleOverride: "PROTOKÓŁ Z PRZEGLĄDU OŚWIETLENIA AWARYJNEGO",
  tableColumns: [
    "Lp.", "Oprawa", "Lokalizacja", "Typ", "Czas autonomii [min]", "Sprawność", "Wynik",
  ],
  tableData: rows.map((m, i) => [
    i + 1,
    fmt(m.label ?? m.number),
    fmt(m.location ?? m.room),
    fmt(m.fixture_type ?? m.type),
    fmt(m.autonomy_minutes ?? m.duration_min),
    fmt(m.efficiency ?? m.condition),
    fmt(m.result ?? m.status ?? "OK"),
  ]),
});

const drzwiTemplate: TemplateBuilder = (rows) => ({
  titleOverride: "PROTOKÓŁ Z PRZEGLĄDU DRZWI PRZECIWPOŻAROWYCH",
  tableColumns: [
    "Lp.", "Oznak.", "Klasa odp.", "Samozamykacz", "Uszczelka", "Stan", "Wynik",
  ],
  tableData: rows.map((m, i) => [
    i + 1,
    fmt(m.label ?? m.number),
    fmt(m.fire_class ?? m.class),
    fmt(m.closer_state ?? m.closer),
    fmt(m.gasket_state ?? m.gasket),
    fmt(m.condition ?? m.state),
    fmt(m.result ?? m.status ?? "OK"),
  ]),
});

const klapyTemplate: TemplateBuilder = (rows) => ({
  titleOverride: "PROTOKÓŁ Z PRZEGLĄDU KLAP PPOŻ",
  tableColumns: [
    "Lp.", "Oznak.", "Lokalizacja", "Test funkcji", "Sprężyna", "Sygnał zwrotny", "Wynik",
  ],
  tableData: rows.map((m, i) => [
    i + 1,
    fmt(m.label ?? m.number),
    fmt(m.location),
    fmt(m.function_test),
    fmt(m.spring_state ?? m.spring),
    fmt(m.feedback_signal ?? m.feedback),
    fmt(m.result ?? m.status ?? "OK"),
  ]),
});

const dsoTemplate: TemplateBuilder = (rows) => ({
  titleOverride: "PROTOKÓŁ Z BADAŃ DSO (Dźwiękowy System Ostrzegawczy)",
  tableColumns: [
    "Lp.", "Strefa", "Głośnik", "STI", "Poziom dB", "Komunikat ewak.", "Wynik",
  ],
  tableData: rows.map((m, i) => [
    i + 1,
    fmt(m.zone ?? m.area),
    fmt(m.speaker ?? m.label),
    fmt(m.sti),
    fmt(m.spl_db ?? m.db),
    fmt(m.evac_message ?? m.message),
    fmt(m.result ?? m.status ?? "OK"),
  ]),
});

const oddymianieTemplate: TemplateBuilder = (rows) => ({
  titleOverride: "PROTOKÓŁ Z PRZEGLĄDU SYSTEMU ODDYMIANIA",
  tableColumns: [
    "Lp.", "Klatka/Strefa", "Element", "Test funkcji", "Czas otwarcia [s]", "Stan akumul.", "Wynik",
  ],
  tableData: rows.map((m, i) => [
    i + 1,
    fmt(m.zone ?? m.staircase ?? m.area),
    fmt(m.element ?? m.device),
    fmt(m.function_test),
    fmt(m.open_time_s ?? m.open_time),
    fmt(m.battery_state ?? m.battery),
    fmt(m.result ?? m.status ?? "OK"),
  ]),
});

const genericTemplate: TemplateBuilder = (rows) => ({
  tableColumns: ["Lp.", "Oznak.", "Opis", "Wynik"],
  tableData: rows.map((m, i) => [
    i + 1,
    fmt(m.label ?? m.number ?? m.id),
    fmt(m.description ?? m.notes ?? "—"),
    fmt(m.result ?? m.status ?? "OK"),
  ]),
});

const TEMPLATES: Record<ProtocolType, TemplateBuilder> = {
  hydranty:    hydrantyTemplate,
  gasnice:     gasniceTemplate,
  ssp:         sspTemplate,
  oswietlenie: oswietlenieTemplate,
  drzwi:       drzwiTemplate,
  klapy:       klapyTemplate,
  dso:         dsoTemplate,
  oddymianie:  oddymianieTemplate,
  generic:     genericTemplate,
};

// ---- type detection from raw protocol.type string -------------------------
export function detectProtocolType(rawType?: string | null): ProtocolType {
  if (!rawType) return "generic";
  const t = rawType.toLowerCase();
  if (/hydrant/.test(t))                        return "hydranty";
  if (/ga[sś]nic|gp-?\d/.test(t))               return "gasnice";
  if (/\bssp\b|sygnaliz/.test(t))               return "ssp";
  if (/o[sś]wietl|awar(?:yj|y)/.test(t))        return "oswietlenie";
  if (/drzwi/.test(t))                          return "drzwi";
  if (/klap/.test(t))                           return "klapy";
  if (/\bdso\b|d[zź]wi[eę]k/.test(t))           return "dso";
  if (/oddym|oddymianie|klatka schodowa/.test(t)) return "oddymianie";
  return "generic";
}

// ---- main entry ------------------------------------------------------------
export function generateProtocolPDF(input: GenerateProtocolInput): void {
  const builder = TEMPLATES[input.protocolType] ?? genericTemplate;
  const tpl = builder(input.measurements ?? [], input.protocol);

  const baseMeta = [
    { label: "Obiekt",         value: input.protocol.building_name ?? "—" },
    { label: "Adres",          value: input.protocol.building_address ?? "—" },
    { label: "Data wykonania", value: fmtDate(input.protocol.performed_at) },
    { label: "Inspektor",      value: input.protocol.inspector_name ?? "—" },
    { label: "Rodzaj przeglądu", value: input.protocol.type ?? input.protocolType },
    { label: "Nr protokołu",   value: input.protocol.protocol_number ?? "—" },
  ];
  if (input.protocol.next_inspection_due) {
    baseMeta.push({ label: "Następny przegląd", value: fmtDate(input.protocol.next_inspection_due) });
  }
  const metadata = [...baseMeta, ...(tpl.extraMetadata ?? [])];

  const filename =
    input.filename
    ?? `Protokol_${slug(input.protocol.type ?? input.protocolType)}_${slug(String(input.protocol.performed_at ?? "now"))}.pdf`;

  generateReportPDF({
    title:    tpl.titleOverride ?? "PROTOKÓŁ Z BADAŃ",
    subtitle: input.protocol.protocol_number ? `Nr ${input.protocol.protocol_number}` : undefined,
    filename,
    metadata,
    tableColumns: tpl.tableColumns,
    tableData:    tpl.tableData,
    notes:        input.protocol.notes ?? "Brak uwag szczegółowych z oględzin.",
    result:       input.protocol.overall_result ?? "do oceny",
    signatureDataUrl: input.signatureDataUrl,
  });
}
