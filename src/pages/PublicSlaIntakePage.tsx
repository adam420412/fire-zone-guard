import { useEffect, useMemo, useState } from "react";
import { Loader2, Camera, X, Flame, Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useCreateSlaTicket,
  uploadSlaPhoto,
  TYPE_LABELS,
  PRIORITY_LABELS,
  type SlaTicketType,
  type SlaTicketPriority,
} from "@/hooks/useSlaTickets";
import { cn } from "@/lib/utils";

interface BuildingOption {
  id: string;
  name: string;
  address?: string | null;
}

const DEVICE_TYPES = [
  { value: "G",         label: "Gaśnica" },
  { value: "H",         label: "Hydrant" },
  { value: "SSP",       label: "System Sygnalizacji Pożarowej" },
  { value: "PWP",       label: "Pompownia wody przeciwpożarowej" },
  { value: "OS_AWAR",   label: "Oświetlenie awaryjne" },
  { value: "DSO",       label: "Dźwiękowy System Ostrzegawczy" },
  { value: "DRZWI",     label: "Drzwi przeciwpożarowe" },
  { value: "KLAPY",     label: "Klapy ppoż." },
  { value: "ODDYM",     label: "Oddymianie klatek schodowych" },
  { value: "INNE",      label: "Inne / nie wiem" },
];

const MAX_PHOTOS = 6;
const MAX_PHOTO_MB = 8;

export default function PublicSlaIntakePage() {
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [buildingsLoading, setBuildingsLoading] = useState(true);

  const [buildingId, setBuildingId] = useState<string>("");
  const [type, setType] = useState<SlaTicketType>("usterka");
  const [priority, setPriority] = useState<SlaTicketPriority>("normal");
  const [deviceType, setDeviceType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");

  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState<{ number: string | null; id: string } | null>(null);

  const createTicket = useCreateSlaTicket();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("buildings")
          .select("id, name, address")
          .order("name", { ascending: true })
          .limit(500);
        if (!mounted) return;
        if (error) throw error;
        setBuildings((data ?? []) as BuildingOption[]);
      } catch (e) {
        // Anonimowy użytkownik może nie mieć uprawnień do listy obiektów —
        // wtedy pokaż wolny input zamiast selecta.
        setBuildings([]);
      } finally {
        if (mounted) setBuildingsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const canSubmit = useMemo(() => {
    if (!description.trim()) return false;
    if (!reporterEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reporterEmail)) return false;
    if (!reporterName.trim()) return false;
    return true;
  }, [description, reporterEmail, reporterName]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    if (!incoming.length) return;
    const free = MAX_PHOTOS - photos.length;
    const accepted: File[] = [];
    for (const f of incoming.slice(0, free)) {
      if (f.size > MAX_PHOTO_MB * 1024 * 1024) {
        toast.error(`Plik "${f.name}" przekracza ${MAX_PHOTO_MB} MB.`);
        continue;
      }
      accepted.push(f);
    }
    if (!accepted.length) return;
    setPhotos((prev) => [...prev, ...accepted]);
    setPhotoPreviews((prev) => [...prev, ...accepted.map((f) => URL.createObjectURL(f))]);
    e.target.value = "";
  };

  const removePhoto = (idx: number) => {
    URL.revokeObjectURL(photoPreviews[idx]);
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || createTicket.isPending) return;

    try {
      setUploading(true);
      const photoUrls: string[] = [];
      for (const file of photos) {
        const url = await uploadSlaPhoto(file);
        photoUrls.push(url);
      }
      setUploading(false);

      const created = await createTicket.mutateAsync({
        building_id: buildingId || null,
        type,
        priority,
        device_type: deviceType || null,
        description: description.trim(),
        reporter_name: reporterName.trim(),
        reporter_email: reporterEmail.trim(),
        reporter_phone: reporterPhone.trim() || undefined,
        photo_urls: photoUrls,
      });

      setSubmitted({ number: created.ticket_number, id: created.id });
      // Cleanup local state
      photoPreviews.forEach((u) => URL.revokeObjectURL(u));
      setPhotos([]);
      setPhotoPreviews([]);
    } catch (err: any) {
      setUploading(false);
      toast.error(err?.message ?? "Nie udało się wysłać zgłoszenia. Spróbuj ponownie.");
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background px-4 py-10 flex items-start justify-center">
        <div className="w-full max-w-lg rounded-xl border border-success/30 bg-card p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
            <CheckCircle2 className="h-9 w-9 text-success" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-card-foreground">
            Zgłoszenie wysłane
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Otrzymaliśmy Twoje zgłoszenie. Dyżurny serwisant odezwie się do <strong>4&nbsp;godzin</strong>.
          </p>
          <div className="mt-6 rounded-lg bg-secondary/40 p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Numer zgłoszenia</p>
            <p className="mt-1 text-2xl font-mono font-bold text-primary">
              {submitted.number ?? submitted.id.slice(0, 8)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Zachowaj numer — przyda się do śledzenia statusu.
            </p>
          </div>
          <button
            onClick={() => setSubmitted(null)}
            className="mt-6 inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-primary hover:text-primary transition-colors"
          >
            Zgłoś kolejną usterkę
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg fire-gradient">
            <Flame className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Fire Zone Guard</h1>
            <p className="text-xs text-muted-foreground">Zgłoszenie usterki / SLA 24/7</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-5">
          {/* Typ zgłoszenia */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Rodzaj zgłoszenia
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(Object.keys(TYPE_LABELS) as SlaTicketType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left text-xs font-medium transition-colors",
                    type === t
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border bg-card text-card-foreground hover:border-primary/40"
                  )}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Priorytet */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Priorytet
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(PRIORITY_LABELS) as SlaTicketPriority[]).map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    "rounded-md border px-2 py-2 text-center text-xs font-medium transition-colors",
                    priority === p
                      ? p === "critical" ? "border-critical/60 bg-critical/10 text-critical"
                      : p === "high"     ? "border-warning/60 bg-warning/10 text-warning"
                                         : "border-primary/60 bg-primary/10 text-primary"
                      : "border-border bg-card text-card-foreground hover:border-primary/40"
                  )}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Obiekt */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Obiekt (opcjonalnie)
            </label>
            {buildingsLoading ? (
              <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ładowanie listy obiektów...
              </div>
            ) : buildings.length > 0 ? (
              <select
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground focus:border-primary focus:outline-none"
              >
                <option value="">— wybierz obiekt —</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}{b.address ? ` — ${b.address}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="Nazwa lub adres obiektu"
                onChange={(e) => setBuildingId(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground focus:border-primary focus:outline-none"
              />
            )}
          </div>

          {/* Urządzenie */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Czego dotyczy zgłoszenie
            </label>
            <select
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground focus:border-primary focus:outline-none"
            >
              <option value="">— wybierz typ urządzenia —</option>
              {DEVICE_TYPES.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* Opis */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Krótki opis usterki <span className="text-critical">*</span>
            </label>
            <textarea
              required
              rows={4}
              maxLength={1000}
              placeholder="Opisz problem: co się dzieje, gdzie, od kiedy, czy stwarza zagrożenie..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground focus:border-primary focus:outline-none resize-y"
            />
            <p className="mt-1 text-[10px] text-muted-foreground text-right">
              {description.length} / 1000
            </p>
          </div>

          {/* Zdjęcia */}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Zdjęcia ({photos.length}/{MAX_PHOTOS})
            </label>
            <div className="grid grid-cols-3 gap-2">
              {photoPreviews.map((src, idx) => (
                <div key={idx} className="relative aspect-square overflow-hidden rounded-md border border-border">
                  <img src={src} alt={`Zdjęcie ${idx + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white hover:bg-critical"
                    aria-label="Usuń zdjęcie"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border bg-card text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                  <Camera className="h-6 w-6" />
                  <span>Dodaj</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Max {MAX_PHOTO_MB} MB / zdjęcie. Zdjęcie pomaga AI szybciej zidentyfikować problem.
            </p>
          </div>

          {/* Dane kontaktowe */}
          <div className="rounded-md border border-border bg-secondary/20 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Dane kontaktowe
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Imię i nazwisko <span className="text-critical">*</span>
              </label>
              <input
                required
                type="text"
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                E-mail <span className="text-critical">*</span>
              </label>
              <input
                required
                type="email"
                value={reporterEmail}
                onChange={(e) => setReporterEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Telefon
              </label>
              <input
                type="tel"
                value={reporterPhone}
                onChange={(e) => setReporterPhone(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {/* SLA info */}
          <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <p className="text-muted-foreground">
              <strong className="text-card-foreground">SLA:</strong> Reakcja na zgłoszenie do 4h.
              Usunięcie usterki w 24-72h (zależnie od priorytetu).
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit || createTicket.isPending || uploading}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition-colors",
              canSubmit && !createTicket.isPending && !uploading
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-secondary text-muted-foreground cursor-not-allowed"
            )}
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Wgrywam zdjęcia...</>
            ) : createTicket.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Wysyłam...</>
            ) : (
              <><Send className="h-4 w-4" /> Wyślij zgłoszenie</>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-[10px] text-muted-foreground">
          © Fire Zone Guard · System zarządzania bezpieczeństwem ppoż.
        </p>
      </div>
    </div>
  );
}
