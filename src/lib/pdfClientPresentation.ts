import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Brand palette
const RED: [number, number, number] = [220, 38, 38]; // #DC2626
const DARK: [number, number, number] = [30, 30, 30]; // #1E1E1E
const ORANGE: [number, number, number] = [249, 115, 22]; // #F97316
const YELLOW: [number, number, number] = [234, 179, 8]; // #EAB308
const GREEN: [number, number, number] = [34, 197, 94]; // #22C55E
const GRAY: [number, number, number] = [110, 110, 110];
const LIGHT: [number, number, number] = [245, 245, 245];
const WHITE: [number, number, number] = [255, 255, 255];

interface ModuleDef {
  num: number;
  icon: string;
  name: string;
  desc: string;
  features: string[];
  benefit: string;
}

const MODULES: ModuleDef[] = [
  {
    num: 1, icon: "📊", name: "Dashboard",
    desc: "Centralny panel monitoringu PPOŻ z globalnym widokiem bezpieczeństwa wszystkich obiektów w jednej firmie i pomiędzy firmami.",
    features: [
      "Globalne statystyki: firmy, obiekty, zadania, certyfikaty",
      "Safety Score - wskaźnik bezpieczeństwa per obiekt i firma",
      "Krytyczne zadania i zadania po terminie",
      "Trend zadań 6 miesięcy z filtrowaniem po firmie",
      "Ostatnia aktywność (zadania, audyty, protokoły)",
      "Onboarding wizard dla nowych użytkowników",
    ],
    benefit: "Decyzje operacyjne w 30 sekund - bez przekopywania się przez moduły.",
  },
  {
    num: 2, icon: "🚨", name: "SLA - Zgłoszenia",
    desc: "System zgłoszeń awaryjnych z pełnym workflow od telefonu klienta do zamknięcia naprawy. Wsparte AI - GPT-4 Vision diagnozuje usterki ze zdjęć.",
    features: [
      "8-etapowy workflow: Zgłoszenie → Telefon → Wyjazd → Na miejscu → Diagnoza → Naprawiono → Zamknięte",
      "Priorytety: krytyczny, wysoki, średni, niski",
      "Analiza zdjęć AI (GPT-4 Vision) - automatyczna diagnoza",
      "Formularz publiczny dla klientów (bez logowania)",
      "Filtrowanie po statusie, firmie, obiekcie",
      "Powiadomienia push i e-mail o zmianach statusu",
    ],
    benefit: "Skrócenie czasu reakcji o 60% dzięki automatycznej diagnozie AI.",
  },
  {
    num: 3, icon: "📜", name: "Audyt SLA",
    desc: "Chronologiczny log wszystkich zdarzeń i zmian statusów zgłoszeń SLA. Pełna ścieżka audytowa dla zgodności i analiz.",
    features: [
      "Timeline zdarzeń: utworzenie, zmiana statusu, eskalacja",
      "Filtrowanie po firmie i typie zdarzenia",
      "Wyszukiwanie po numerze zgłoszenia",
      "Eksport do raportów zgodności",
    ],
    benefit: "Niezaprzeczalna ścieżka audytowa dla audytów ISO i kontroli PSP.",
  },
  {
    num: 4, icon: "📈", name: "KPI SLA",
    desc: "Wskaźniki zgodności SLA w podziale na firmy, obiekty i osoby. Twarde liczby dla zarządzania serwisem.",
    features: [
      "Reakcja w SLA (%) - first response on time",
      "Rozwiązanie w SLA (%) - resolution on time",
      "Wolumen zgłoszeń 12 miesięcy",
      "Trend compliance (wykres liniowy)",
      "Naruszenia deadline'ów",
    ],
    benefit: "Monitoring SLA per kontrakt - argumenty do rozmów z klientami.",
  },
  {
    num: 5, icon: "🔧", name: "Naprawy - Kanban",
    desc: "Kanban napraw z 8-etapowym pipeline od zgłoszenia do fakturowania. Pełna kontrola realizacji.",
    features: [
      "Etapy: Nowe → Wycena → Zaakceptowane → Zamówione → Dostarczone → W trakcie → Wykonane → Zafakturowane",
      "Drag & drop między kolumnami",
      "Automatyczne tworzenie naprawy z SLA",
      "Filtrowanie po źródle i wyszukiwanie",
    ],
    benefit: "Zero zapomnianych napraw - każdy etap ma odpowiedzialnego.",
  },
  {
    num: 6, icon: "📋", name: "Kanban zadań",
    desc: "Globalna tablica wszystkich zadań operacyjnych - od planowania po weryfikację.",
    features: [
      "Kolumny: Nowe, Zaplanowane, W realizacji, Weryfikacja, Zamknięte",
      "Filtry: priorytet, termin, aktywność (24h/7d/30d)",
      "Szybkie akcje: przypisanie, priorytet, termin",
      "Opisy zadań widoczne na kartach",
      "Powiązanie z ofertami - status oferty na karcie",
      "Bilans finansowy zadania",
    ],
    benefit: "Cały zespół widzi to samo - koniec z mailowymi pingami.",
  },
  {
    num: 7, icon: "🏢", name: "Obiekty",
    desc: "Rejestr wszystkich nadzorowanych obiektów z monitoringiem bezpieczeństwa, IBP i zadań.",
    features: [
      "Karta obiektu: adres, firma, status bezpieczeństwa",
      "Status IBP z datą ważności",
      "Liczba aktywnych/zaległych zadań per obiekt",
      "Urządzenia PPOŻ, dokumenty, szkolenia, historia",
      "Eksport CSV listy obiektów",
    ],
    benefit: "Jedno miejsce na całą wiedzę o obiekcie - od adresu po IBP.",
  },
  {
    num: 8, icon: "🗺️", name: "Mapa obiektów",
    desc: "Interaktywna mapa z pinami lokalizacji wszystkich obiektów - geocodowanie automatyczne.",
    features: [
      "Mapa Leaflet z OpenStreetMap",
      "Piny kolorowane wg statusu bezpieczeństwa",
      "Geocodowanie adresów (auto i manualne)",
      "Lista obiektów pod mapą z wyszukiwarką",
    ],
    benefit: "Wizualne planowanie tras serwisowych - oszczędność paliwa.",
  },
  {
    num: 9, icon: "🏭", name: "Firmy (CRM)",
    desc: "Rejestr spółek i kontrahentów z weryfikacją NIP w Białej Liście MF i pełnym CRM.",
    features: [
      "Karta firmy: nazwa, NIP (weryfikacja w Białej Liście MF), adres",
      "Statystyki per firma: obiekty, zadania, SLA %",
      "Zarządzanie wieloma osobami kontaktowymi",
      "Edycja inline: NIP, nazwa, adres",
      "Przypisanie obiektów do kontaktów",
    ],
    benefit: "Weryfikacja NIP w 2 sekundy - eliminacja błędów księgowych.",
  },
  {
    num: 10, icon: "🔍", name: "Audyty PPOŻ",
    desc: "Planowanie i przeprowadzanie audytów stanu bezpieczeństwa pożarowego z dokumentacją.",
    features: [
      "Planowanie audytu: obiekt, typ, termin, audytor",
      "Wyszukiwarka audytów",
      "Historia przeprowadzonych audytów",
      "Generowanie protokołów PDF",
    ],
    benefit: "Audyty zaplanowane z wyprzedzeniem - zero opóźnień IBP.",
  },
  {
    num: 11, icon: "✅", name: "Checklisty",
    desc: "Odklikialne listy kontrolne dla audytów, przeglądów sprzętu i BHP. 6 szablonów systemowych + własne.",
    features: [
      "6 szablonów: audyt PPOŻ, gaśnice, hydranty, SSP, drzwi PPOŻ, oświetlenie awaryjne",
      "Tworzenie własnych szablonów per firma",
      "Audyt punkt po punkcie (OK / NIE OK / N/A)",
      "Zdjęcia i notatki przy każdym punkcie",
      "Automatyczne tworzenie zadań dla NIE OK",
      "Protokół PDF po zakończeniu",
    ],
    benefit: "Standaryzacja audytów - każdy serwisant sprawdza to samo.",
  },
  {
    num: 12, icon: "📄", name: "Protokoły serwisowe",
    desc: "Rejestr i zarządzanie wynikami przeglądów PPOŻ - pełna dokumentacja serwisowa.",
    features: [
      "Dodawanie protokołów: typ, obiekt, data, wynik",
      "Wyszukiwanie po obiekcie i typie",
      "Powiązanie z obiektem i audytorem",
      "Eksport PDF z podpisem",
    ],
    benefit: "Protokoły gotowe do kontroli PSP w jednym kliknięciu.",
  },
  {
    num: 13, icon: "🛡️", name: "Certyfikaty",
    desc: "Lista wydanych certyfikatów bezpieczeństwa z monitoringiem ważności i powiadomieniami.",
    features: [
      "Certyfikaty per obiekt z datą ważności",
      "Status: aktywny / wygasający / wygasły",
      "Tworzenie nowych certyfikatów",
      "Powiadomienia przed wygaśnięciem",
    ],
    benefit: "Klient nigdy nie zostaje bez ważnego certyfikatu.",
  },
  {
    num: 14, icon: "📅", name: "Terminarz biurowy",
    desc: "Cykliczne wydarzenia: szkolenia, serwisy, IBP, ubezpieczenia, umowy.",
    features: [
      "Zdarzenia jednorazowe i cykliczne (co X miesięcy)",
      "Powiadomienia o przeterminowanych terminach",
      "Przypisanie do obiektu",
      "Oznaczanie jako wykonane",
    ],
    benefit: "Koniec z papierowym kalendarzem - wszystko automatyczne.",
  },
  {
    num: 15, icon: "📚", name: "Biblioteka PPOŻ",
    desc: "Baza wiedzy z przepisami i AI Asystentem prawno-technicznym (GPT-4o + RAG).",
    features: [
      "AI Asystent prawno-techniczny (GPT-4o + RAG)",
      "Kategorie: Prawo, Wytyczne, Szablony, Wewnętrzne",
      "Wyszukiwanie pełnotekstowe (FTS)",
      "Indeksowanie dokumentów (chunking + embedding)",
      "Filtrowanie po obiekcie",
    ],
    benefit: "Eksperckie odpowiedzi w 5 sekund zamiast 30 minut w PDF-ach.",
  },
  {
    num: 16, icon: "📊", name: "Raporty i KPI",
    desc: "Wskaźniki operacyjne, zgodność SLA, status obiektów z eksportem do PDF.",
    features: [
      "Eksport raportu do PDF",
      "Trend zgłoszeń SLA (12 mies.)",
      "Średni czas naprawy wg priorytetu",
      "Top 10 obiektów wg liczby zgłoszeń",
      "Karty KPI: otwarte SLA, przekroczone, zgodność %",
    ],
    benefit: "Raport miesięczny dla zarządu w 2 kliknięciach.",
  },
  {
    num: 17, icon: "👥", name: "Spotkania i Wizje",
    desc: "Planowanie, dokumentowanie i zarządzanie spotkaniami z klientami i zespołem.",
    features: [
      "Dodawanie spotkań: data, uczestnicy, lokalizacja",
      "Widok: nadchodzące / archiwum",
      "Wyszukiwarka spotkań",
      "Notatki po spotkaniu",
    ],
    benefit: "Historia ustaleń zawsze pod ręką - koniec z 'kto co obiecał'.",
  },
  {
    num: 18, icon: "👷", name: "Zespół",
    desc: "Zarządzanie pracownikami, szkoleniami, uprawnieniami i rolą pożarową.",
    features: [
      "Karta pracownika: dane, stanowisko, obiekt, badania lekarskie",
      "Status szkolenia BHP/PPOŻ (Aktualne / W trakcie / Wygasłe)",
      "Rola pożarowa: gaszenie / ewakuacja / pierwsza pomoc",
      "Postęp onboardingu (%)",
      "Ewidencja szkoleń i uprawnień",
      "Eksport listy do CSV",
    ],
    benefit: "Pełna wiedza o kompetencjach zespołu - decyzje kadrowe oparte na danych.",
  },
  {
    num: 19, icon: "📉", name: "Analityka",
    desc: "Zaawansowane raporty i wskaźniki KPI z eksportem do Excel.",
    features: [
      "Trend zadań 6 mies. (utworzone / zamknięte / zaległe)",
      "SLA Compliance - trend %",
      "Raport globalny do Excel",
      "Zakres dat konfigurowalny",
    ],
    benefit: "Excel dla zarządu, dashboardy dla operacji - jeden zestaw danych.",
  },
  {
    num: 20, icon: "📆", name: "Kalendarz",
    desc: "Widok miesięczny wszystkich terminów, zadań, spotkań i audytów.",
    features: [
      "Kolory wg pilności: >7 dni / ≤7 / ≤4 / ≤2 dni",
      "Filtry: Zadania, Podzadania, Spotkania, Audyty, Protokoły",
      "Filtr po pracowniku",
      "Szczegóły dnia po kliknięciu",
      "Tworzenie spotkań i zadań z kalendarza",
    ],
    benefit: "Cały tydzień zespołu na jednym ekranie - bez Excela.",
  },
  {
    num: 21, icon: "📇", name: "CRM - Kontakty",
    desc: "Baza osób kontaktowych powiązanych z firmami i obiektami.",
    features: [
      "Dodawanie kontaktów: imię, telefon, email, stanowisko",
      "Przypisanie do firmy i obiektów",
      "Oznaczenie: główny / awaryjny",
      "Wyszukiwarka",
    ],
    benefit: "Właściwa osoba w 5 sekund - szczególnie krytyczne w awariach.",
  },
  {
    num: 22, icon: "💰", name: "Finanse",
    desc: "Lejek sprzedaży, oferty, bilans finansowy zadań - operacyjny CRM dla serwisu.",
    features: [
      "Szanse sprzedażowe: Lead → Kontakt → Oferta → Zlecenie → Archiwum",
      "Timeline aktualizacji przy każdej szansie",
      "Konwersja szansy na zlecenie (wizard 4-krokowy)",
      "Szybka szansa sprzedażowa (FAB - globalny przycisk)",
      "Oferty z pozycjami i cenami",
      "Bilans: przychody, koszty, marża",
    ],
    benefit: "Każdy lead pod kontrolą - brak straconych okazji.",
  },
];

function drawHeader(doc: jsPDF, title?: string) {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFillColor(...RED);
  doc.rect(0, 0, pw, 32, "F");
  doc.setFillColor(...ORANGE);
  doc.rect(0, 30, pw, 2, "F");

  doc.setFontSize(14);
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("FIRE ZONE", 14, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("OPERATOR PPOZ", 14, 26);

  if (title) {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(title, pw - 14, 20, { align: "right" });
  }
}

function drawFooter(doc: jsPDF, pageNum: number, totalPages: number, dateStr: string) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(14, ph - 14, pw - 14, ph - 14);
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "normal");
  doc.text(`Fire Zone Operator PPOZ - Prezentacja Klienta - ${dateStr}`, 14, ph - 8);
  doc.text(`${pageNum} / ${totalPages}`, pw - 14, ph - 8, { align: "right" });
}

export function generateClientPresentationPDF() {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const margin = 14;
  const cw = pw - margin * 2;
  const dateStr = new Date().toLocaleDateString("pl-PL", { year: "numeric", month: "long", day: "numeric" });

  // ===== 1. COVER =====
  doc.setFillColor(...DARK);
  doc.rect(0, 0, pw, ph, "F");

  // top red bar
  doc.setFillColor(...RED);
  doc.rect(0, 0, pw, 8, "F");
  doc.setFillColor(...ORANGE);
  doc.rect(0, 8, pw, 2, "F");

  doc.setFontSize(48);
  doc.setTextColor(...RED);
  doc.setFont("helvetica", "bold");
  doc.text("FIRE ZONE", pw / 2, 95, { align: "center" });

  doc.setFontSize(16);
  doc.setTextColor(...ORANGE);
  doc.setFont("helvetica", "normal");
  doc.text("OPERATOR PPOZ", pw / 2, 108, { align: "center" });

  doc.setDrawColor(...RED);
  doc.setLineWidth(0.8);
  doc.line(pw / 2 - 40, 118, pw / 2 + 40, 118);

  doc.setFontSize(14);
  doc.setTextColor(230, 230, 230);
  doc.text("Kompletny System Zarzadzania", pw / 2, 138, { align: "center" });
  doc.text("Bezpieczenstwem Pozarowym", pw / 2, 148, { align: "center" });

  doc.setFontSize(11);
  doc.setTextColor(...ORANGE);
  doc.setFont("helvetica", "bold");
  doc.text("22 moduly  -  8 workflow  -  1 platforma", pw / 2, 175, { align: "center" });

  doc.setFontSize(10);
  doc.setTextColor(180, 180, 180);
  doc.setFont("helvetica", "normal");
  doc.text(dateStr, pw / 2, ph - 28, { align: "center" });
  doc.text("Wersja 1.0  -  Prezentacja Klienta", pw / 2, ph - 20, { align: "center" });

  doc.setFillColor(...RED);
  doc.rect(0, ph - 8, pw, 8, "F");

  // ===== 2. EXECUTIVE SUMMARY =====
  doc.addPage();
  drawHeader(doc, "Executive Summary");

  let y = 48;
  doc.setFontSize(20);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("Czym jest Fire Zone Operator?", margin, y);

  y += 10;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  const intro = [
    "Fire Zone Operator PPOZ to kompleksowa platforma SaaS dedykowana firmom serwisujacym",
    "instalacje przeciwpozarowe, administratorom obiektow oraz inspektorom PPOZ.",
    "",
    "System integruje wszystkie aspekty operacyjne - od zgloszen awaryjnych SLA, przez audyty",
    "i checklisty, po pelny CRM sprzedazowy i zarzadzanie zespolem - w jednym, spojnym narzedziu.",
    "",
    "Dzieki wbudowanej sztucznej inteligencji (GPT-4 Vision + RAG) system automatyzuje diagnoze",
    "usterek ze zdjec i wspiera inspektorow odpowiedziami opartymi o aktualne przepisy prawa.",
    "",
    "Platforma dziala offline-first - mobilna aplikacja synchronizuje sie automatycznie po",
    "powrocie do zasiegu, co eliminuje przestoje serwisantow w terenie.",
  ];
  intro.forEach((line) => {
    doc.text(line, margin, y);
    y += 5.5;
  });

  y += 6;
  // 4 key numbers cards
  const cardW = (cw - 9) / 4;
  const cardH = 24;
  const stats = [
    { v: "22", l: "Moduly" },
    { v: "6", l: "Szablony audytu" },
    { v: "8", l: "Etapow SLA" },
    { v: "INF", l: "Uzytkownikow" },
  ];
  stats.forEach((s, i) => {
    const x = margin + i * (cardW + 3);
    doc.setFillColor(...DARK);
    doc.rect(x, y, cardW, cardH, "F");
    doc.setFillColor(...RED);
    doc.rect(x, y, cardW, 1.5, "F");
    doc.setFontSize(16);
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.text(s.v, x + cardW / 2, y + 12, { align: "center" });
    doc.setFontSize(8);
    doc.setTextColor(200, 200, 200);
    doc.setFont("helvetica", "normal");
    doc.text(s.l, x + cardW / 2, y + 19, { align: "center" });
  });
  y += cardH + 12;

  doc.setFontSize(14);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("Dla kogo?", margin, y);
  y += 7;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  const target = [
    "-  Firmy serwisujace gasnice, hydranty, SSP, DSO, drzwi pozarowe i oswietlenie awaryjne",
    "-  Administratorzy budynkow uzytecznosci publicznej (szkoly, szpitale, biura, centra handlowe)",
    "-  Zarzadcy nieruchomosci z portfelem obiektow wymagajacych nadzoru PPOZ",
    "-  Inspektorzy PPOZ i audytorzy prowadzacy przeglady okresowe",
    "-  Zespoly BHP/PPOZ duzych przedsiebiorstw z wieloma lokalizacjami",
  ];
  target.forEach((t) => {
    doc.text(t, margin, y);
    y += 6;
  });

  // ===== 3. TOC =====
  doc.addPage();
  drawHeader(doc, "Spis tresci");
  y = 48;
  doc.setFontSize(20);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("Spis tresci", margin, y);
  y += 4;
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin + 30, y);

  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const col1 = MODULES.slice(0, 11);
  const col2 = MODULES.slice(11);
  const colY = y;
  col1.forEach((m, i) => {
    doc.setTextColor(...RED);
    doc.setFont("helvetica", "bold");
    doc.text(String(m.num).padStart(2, "0"), margin, colY + i * 7);
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "normal");
    doc.text(`${m.icon}  ${m.name}`, margin + 10, colY + i * 7);
  });
  col2.forEach((m, i) => {
    doc.setTextColor(...RED);
    doc.setFont("helvetica", "bold");
    doc.text(String(m.num).padStart(2, "0"), pw / 2 + 5, colY + i * 7);
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "normal");
    doc.text(`${m.icon}  ${m.name}`, pw / 2 + 15, colY + i * 7);
  });

  y = colY + Math.max(col1.length, col2.length) * 7 + 12;
  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "italic");
  doc.text("Dodatkowo: Przeplywy workflow  -  Integracje  -  Changelog  -  Roadmapa  -  Kontakt", margin, y);

  // ===== 4-25. MODULE PAGES =====
  MODULES.forEach((m) => {
    doc.addPage();
    drawHeader(doc, `Modul ${String(m.num).padStart(2, "0")}`);

    // Large title block
    doc.setFillColor(...LIGHT);
    doc.rect(0, 32, pw, 28, "F");
    doc.setFontSize(28);
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "bold");
    doc.text(`${m.icon}  ${m.name}`, margin, 52);

    let yy = 72;
    doc.setFontSize(11);
    doc.setTextColor(...GRAY);
    doc.setFont("helvetica", "normal");
    const descLines = doc.splitTextToSize(m.desc, cw);
    doc.text(descLines, margin, yy);
    yy += descLines.length * 5.5 + 6;

    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "bold");
    doc.text("Funkcjonalnosci", margin, yy);
    yy += 3;

    autoTable(doc, {
      startY: yy,
      head: [["#", "Funkcja", ""]],
      body: m.features.map((f, i) => [String(i + 1), f, "OK"]),
      theme: "grid",
      headStyles: { fillColor: DARK, textColor: WHITE, fontSize: 9, halign: "left" },
      bodyStyles: { fontSize: 10, textColor: DARK },
      columnStyles: {
        0: { cellWidth: 10, halign: "center", textColor: RED, fontStyle: "bold" },
        1: { cellWidth: cw - 28 },
        2: { cellWidth: 18, halign: "center", textColor: GREEN, fontStyle: "bold" },
      },
      margin: { left: margin, right: margin },
    });

    // Benefit bar at bottom
    const benefitY = ph - 36;
    doc.setFillColor(...ORANGE);
    doc.rect(margin, benefitY, cw, 18, "F");
    doc.setFontSize(9);
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.text("KORZYSC BIZNESOWA", margin + 4, benefitY + 6);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const benefitLines = doc.splitTextToSize(m.benefit, cw - 8);
    doc.text(benefitLines, margin + 4, benefitY + 13);
  });

  // ===== 26. WORKFLOWS =====
  doc.addPage();
  drawHeader(doc, "Przeplywy");
  doc.setFontSize(22);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("Przeplywy workflow", margin, 50);
  doc.setDrawColor(...RED);
  doc.line(margin, 53, margin + 40, 53);

  const flows = [
    {
      name: "Workflow SLA - Zgloszenia awaryjne",
      color: RED,
      stages: ["Zgloszenie", "Telefon", "Wyjazd", "Na miejscu", "Diagnoza", "Naprawiono", "Zamkniete"],
    },
    {
      name: "Workflow Napraw - Pelny cykl realizacji",
      color: ORANGE,
      stages: ["Nowe", "Wycena", "Zaakceptowane", "Zamowione", "Dostarczone", "W trakcie", "Wykonane", "Zafakturowane"],
    },
    {
      name: "Workflow Sprzedazy - Lejek CRM",
      color: GREEN,
      stages: ["Lead", "Kontakt", "Oferta", "Zlecenie", "Archiwum"],
    },
  ];

  let fy = 65;
  flows.forEach((f) => {
    doc.setFontSize(12);
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "bold");
    doc.text(f.name, margin, fy);
    fy += 6;

    const n = f.stages.length;
    const gap = 2;
    const stageW = (cw - gap * (n - 1)) / n;
    f.stages.forEach((s, i) => {
      const x = margin + i * (stageW + gap);
      doc.setFillColor(...f.color);
      doc.rect(x, fy, stageW, 14, "F");
      doc.setFontSize(8);
      doc.setTextColor(...WHITE);
      doc.setFont("helvetica", "bold");
      doc.text(s, x + stageW / 2, fy + 9, { align: "center" });
      // arrow
      if (i < n - 1) {
        doc.setTextColor(...f.color);
        doc.setFontSize(10);
        doc.text(">", x + stageW + gap / 2 - 0.5, fy + 9, { align: "center" });
      }
    });
    fy += 28;
  });

  // ===== 27. INTEGRACJE =====
  doc.addPage();
  drawHeader(doc, "Integracje");
  doc.setFontSize(22);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("Integracje", margin, 50);
  doc.setDrawColor(...RED);
  doc.line(margin, 53, margin + 40, 53);

  autoTable(doc, {
    startY: 62,
    head: [["Integracja", "Cel", "Status"]],
    body: [
      ["Supabase (PostgreSQL + RLS)", "Backend, autoryzacja, RLS per firma", "aktywna"],
      ["GPT-4 Vision", "Diagnoza zdjec z SLA", "aktywna"],
      ["GPT-4o + RAG", "AI Asystent prawno-techniczny w Bibliotece", "aktywna"],
      ["Biala Lista MF", "Weryfikacja NIP-u firm", "aktywna"],
      ["Leaflet + OpenStreetMap", "Mapa obiektow", "aktywna"],
      ["Telegram Bot", "Powiadomienia push", "aktywna"],
      ["Email (SMTP)", "Powiadomienia + raporty dzienne", "aktywna"],
      ["Excel / CSV", "Eksport raportow", "aktywna"],
      ["PDF (jsPDF)", "Protokoly, oferty, raporty", "aktywna"],
    ],
    theme: "grid",
    headStyles: { fillColor: DARK, textColor: WHITE, fontSize: 10 },
    bodyStyles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: "bold", textColor: DARK },
      1: { cellWidth: cw - 85 },
      2: { cellWidth: 30, halign: "center", textColor: GREEN, fontStyle: "bold" },
    },
    margin: { left: margin, right: margin },
  });

  // ===== 28. CHANGELOG =====
  doc.addPage();
  drawHeader(doc, "Changelog");
  doc.setFontSize(22);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("Zmiany z ostatniej sesji", margin, 50);
  doc.setDrawColor(...RED);
  doc.line(margin, 53, margin + 40, 53);

  autoTable(doc, {
    startY: 62,
    head: [["Nowe funkcje", "Opis"]],
    body: [
      ["Generator PDF Przewodnika", "Pelen przewodnik po systemie w Ustawieniach > Pomoc"],
      ["Wlasne szablony Checklist", "Dialog z punktami, sekcjami, severity i wymogiem zdjec"],
      ["Rola pozarowa pracownikow", "Gaszenie / ewakuacja / pierwsza pomoc + kombinacje"],
      ["QuickOpportunityFAB", "Globalny przycisk dodawania szansy sprzedazowej"],
      ["Timeline szans sprzedazowych", "Chronologiczny log kontaktow i zmian etapu"],
      ["Opisy zadan na Kanban", "Fragment opisu pod tytulem - szybsza orientacja"],
      ["Zakladka Pomoc / Przewodnik", "Brandowana strona z PDF do pobrania"],
    ],
    theme: "striped",
    headStyles: { fillColor: GREEN, textColor: WHITE, fontSize: 10 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: "bold" },
      1: { cellWidth: cw - 60 },
    },
    margin: { left: margin, right: margin },
  });

  let chY = (doc as any).lastAutoTable.finalY + 8;
  autoTable(doc, {
    startY: chY,
    head: [["Poprawki techniczne", "Opis"]],
    body: [
      ["Naprawa Kanban (HTTP 300)", "Disambiguacja relacji tasks <-> sales_opportunities"],
      ["Render zakladki Pomoc", "Brakujacy warunek w SettingsPage - naprawione"],
      ["Fix Vercel build", "Wyrownanie @vitest/ui do v3"],
      ["Swiezy package-lock.json", "Pelna regeneracja lockfile"],
    ],
    theme: "striped",
    headStyles: { fillColor: ORANGE, textColor: WHITE, fontSize: 10 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: "bold" },
      1: { cellWidth: cw - 60 },
    },
    margin: { left: margin, right: margin },
  });

  chY = (doc as any).lastAutoTable.finalY + 8;
  autoTable(doc, {
    startY: chY,
    head: [["Migracje bazy danych", "Opis"]],
    body: [
      ["20260424220000_iter8_checklists", "4 tabele + 6 szablonow systemowych"],
      ["20260519100000_opportunity_updates", "Timeline szans sprzedazowych"],
      ["20260519120000_employee_fire_role", "Pole fire_role w employee_development_plans"],
    ],
    theme: "striped",
    headStyles: { fillColor: RED, textColor: WHITE, fontSize: 10 },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 70, fontStyle: "bold" },
      1: { cellWidth: cw - 70 },
    },
    margin: { left: margin, right: margin },
  });

  // ===== 29. ROADMAPA =====
  doc.addPage();
  drawHeader(doc, "Roadmapa");
  doc.setFontSize(22);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("Roadmapa - co dalej?", margin, 50);
  doc.setDrawColor(...RED);
  doc.line(margin, 53, margin + 40, 53);

  const roadmap = [
    { q: "Q1", color: GREEN, title: "Mobile app (PWA juz dziala) + Offline mode", desc: "Pelne wsparcie pracy w terenie bez zasiegu, automatyczna synchronizacja po powrocie." },
    { q: "Q2", color: YELLOW, title: "Multi-tenant biale etykiety dla partnerow", desc: "Wersja white-label dla integratorow i wiekszych grup serwisowych." },
    { q: "Q3", color: ORANGE, title: "AI Co-pilot - rekomendacje audytora w czasie rzeczywistym", desc: "Asystent podpowiadajacy nastepne kroki podczas audytu w terenie." },
    { q: "Q4", color: RED, title: "BIM Integration - import planow 3D obiektow", desc: "Wizualizacja urzadzen PPOZ na modelach BIM (IFC, Revit)." },
  ];

  let ry = 65;
  roadmap.forEach((r) => {
    doc.setFillColor(...r.color);
    doc.rect(margin, ry, 18, 18, "F");
    doc.setFontSize(12);
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.text(r.q, margin + 9, ry + 12, { align: "center" });

    doc.setFontSize(12);
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "bold");
    doc.text(r.title, margin + 24, ry + 7);
    doc.setFontSize(10);
    doc.setTextColor(...GRAY);
    doc.setFont("helvetica", "normal");
    const dl = doc.splitTextToSize(r.desc, cw - 24);
    doc.text(dl, margin + 24, ry + 14);

    ry += 30;
  });

  // ===== 30. KONTAKT =====
  doc.addPage();
  drawHeader(doc, "Kontakt");
  doc.setFontSize(22);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("Jak zaczac?", margin, 50);
  doc.setDrawColor(...RED);
  doc.line(margin, 53, margin + 40, 53);

  doc.setFontSize(11);
  doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "normal");
  const startText = doc.splitTextToSize(
    "Wdrozenie systemu Fire Zone Operator zajmuje srednio 1-2 dni robocze. Cala konfiguracja odbywa sie w panelu Onboarding - bez instalacji, bez serwerow, bez kosztow startowych.",
    cw
  );
  doc.text(startText, margin, 62);

  const steps = [
    { n: "1", t: "Onboarding", d: "Konfiguracja pierwszej firmy, importu kontaktow i ustawien biznesowych." },
    { n: "2", t: "Pierwszy obiekt", d: "Dodanie obiektu, urzadzen PPOZ i przypisanie zespolu." },
    { n: "3", t: "Pierwszy audyt", d: "Uruchomienie checklisty systemowej i wygenerowanie protokolu." },
    { n: "4", t: "Raport", d: "Eksport pierwszego raportu PDF/Excel dla zarzadu lub klienta." },
  ];

  let sy = 86;
  steps.forEach((s) => {
    doc.setFillColor(...RED);
    doc.circle(margin + 5, sy + 4, 5, "F");
    doc.setFontSize(11);
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.text(s.n, margin + 5, sy + 5.5, { align: "center" });

    doc.setFontSize(12);
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "bold");
    doc.text(s.t, margin + 14, sy + 3);
    doc.setFontSize(10);
    doc.setTextColor(...GRAY);
    doc.setFont("helvetica", "normal");
    doc.text(s.d, margin + 14, sy + 9);
    sy += 16;
  });

  sy += 4;
  doc.setFillColor(...DARK);
  doc.rect(margin, sy, cw, 36, "F");
  doc.setFillColor(...ORANGE);
  doc.rect(margin, sy, cw, 2, "F");

  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("Wsparcie techniczne", margin + 6, sy + 12);
  doc.setFontSize(10);
  doc.setTextColor(220, 220, 220);
  doc.setFont("helvetica", "normal");
  doc.text("Skontaktuj sie z administratorem swojej firmy lub naszym zespolem wsparcia", margin + 6, sy + 20);
  doc.text("aby umowic prezentacje demo lub uzyskac pomoc we wdrozeniu.", margin + 6, sy + 26);

  // QR placeholder
  const qrSize = 32;
  const qrX = pw - margin - qrSize;
  const qrY = sy + 50;
  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.5);
  doc.rect(qrX, qrY, qrSize, qrSize);
  // simple QR-like pattern
  doc.setFillColor(...DARK);
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      if ((i + j * 3) % 2 === 0 || (i * 2 + j) % 3 === 0) {
        doc.rect(qrX + 2 + i * 3.5, qrY + 2 + j * 3.5, 3, 3, "F");
      }
    }
  }
  // QR finder corners
  doc.setFillColor(...WHITE);
  doc.rect(qrX + 2, qrY + 2, 8, 8, "F");
  doc.rect(qrX + qrSize - 10, qrY + 2, 8, 8, "F");
  doc.rect(qrX + 2, qrY + qrSize - 10, 8, 8, "F");
  doc.setFillColor(...DARK);
  doc.rect(qrX + 3, qrY + 3, 6, 6, "F");
  doc.rect(qrX + qrSize - 9, qrY + 3, 6, 6, "F");
  doc.rect(qrX + 3, qrY + qrSize - 9, 6, 6, "F");
  doc.setFillColor(...WHITE);
  doc.rect(qrX + 4.5, qrY + 4.5, 3, 3, "F");
  doc.rect(qrX + qrSize - 7.5, qrY + 4.5, 3, 3, "F");
  doc.rect(qrX + 4.5, qrY + qrSize - 7.5, 3, 3, "F");

  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "normal");
  doc.text("Skanuj aby umowic demo", qrX + qrSize / 2, qrY + qrSize + 5, { align: "center" });

  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("Dziekujemy za zainteresowanie", margin, qrY + 12);
  doc.setFontSize(11);
  doc.setTextColor(...RED);
  doc.text("Fire Zone Operator PPOZ", margin, qrY + 19);
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "normal");
  doc.text("Bezpieczenstwo pozarowe pod kontrola.", margin, qrY + 26);

  // ===== FOOTERS =====
  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, p - 1, total - 1, dateStr);
  }

  doc.save("FireZone_Prezentacja_Klienta.pdf");
}
