import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const BRAND_RED: [number, number, number] = [220, 38, 38];
const GRAY: [number, number, number] = [100, 100, 100];
const DARK: [number, number, number] = [30, 30, 30];
const LIGHT_BG: [number, number, number] = [245, 245, 245];

interface ModuleInfo {
  name: string;
  icon: string;
  description: string;
  features: string[];
}

const MODULES: ModuleInfo[] = [
  {
    name: "Dashboard",
    icon: "📊",
    description: "Centralny panel monitoringu PPOŻ z globalnym widokiem bezpieczeństwa wszystkich obiektów.",
    features: [
      "Statystyki: liczba firm, obiektów, aktywnych zadań, certyfikatów",
      "Safety Score — globalny wskaźnik bezpieczeństwa",
      "Krytyczne zadania i zadania po terminie",
      "Trend zadań (6 miesięcy) z filtrowaniem po firmie",
      "Ostatnia aktywność (zadania, audyty, protokoły)",
    ],
  },
  {
    name: "SLA — Zgłoszenia",
    icon: "🚨",
    description: "System zgłoszeń awaryjnych z pełnym workflow od zgłoszenia do zamknięcia.",
    features: [
      "8-etapowy workflow: Zgłoszenie → Telefon → Wyjazd → Na miejscu → Diagnoza → Naprawiono → Zamknięte",
      "Priorytety: krytyczny, wysoki, średni, niski",
      "Analiza zdjęć AI (GPT-4 Vision) — automatyczna diagnoza usterki",
      "Filtrowanie po statusie, firmie, obiekcie",
      "Formularz publiczny dla klientów (bez logowania)",
      "Powiadomienia push i e-mail o zmianach statusu",
    ],
  },
  {
    name: "Audyt SLA",
    icon: "📜",
    description: "Chronologiczny log wszystkich zdarzeń i zmian statusów zgłoszeń SLA.",
    features: [
      "Timeline zdarzeń: utworzenie, zmiana statusu, eskalacja",
      "Filtrowanie po firmie i typie zdarzenia",
      "Wyszukiwanie po numerze zgłoszenia",
    ],
  },
  {
    name: "KPI SLA",
    icon: "📈",
    description: "Wskaźniki zgodności SLA w podziale na firmy, obiekty i osoby.",
    features: [
      "Reakcja w SLA (%) — first response on time",
      "Rozwiązanie w SLA (%) — resolution on time",
      "Wolumen zgłoszeń (12 mies.)",
      "Trend compliance (wykres liniowy)",
      "Naruszenia deadline'ów",
    ],
  },
  {
    name: "Naprawy — Workflow",
    icon: "🔧",
    description: "Kanban napraw z 8-etapowym pipeline od zgłoszenia do fakturowania.",
    features: [
      "Etapy: Nowe → Wycena → Zaakceptowane → Zamówione → Dostarczone → W trakcie → Wykonane → Zafakturowane",
      "Drag & drop między kolumnami",
      "Powiązanie z SLA (automatyczne tworzenie naprawy)",
      "Filtrowanie po źródle i wyszukiwanie",
    ],
  },
  {
    name: "Kanban zadań",
    icon: "📋",
    description: "Globalny widok wszystkich zadań operacyjnych w formie tablicy Kanban.",
    features: [
      "Kolumny: Nowe, Zaplanowane, W realizacji, Weryfikacja, Zamknięte",
      "Filtry: priorytet, termin, aktywność (24h/7d/30d)",
      "Szybkie akcje: przypisanie, zmiana priorytetu, przesunięcie terminu",
      "Opisy zadań widoczne na kartach",
      "Powiązanie z ofertami — status oferty na karcie",
      "Bilans finansowy zadania",
    ],
  },
  {
    name: "Obiekty",
    icon: "🏢",
    description: "Rejestr wszystkich nadzorowanych obiektów z monitoringiem bezpieczeństwa.",
    features: [
      "Karta obiektu: adres, firma, status bezpieczeństwa",
      "Status IBP (Instrukcja Bezpieczeństwa Pożarowego) z datą ważności",
      "Liczba aktywnych/zaległych zadań per obiekt",
      "Szczegóły: urządzenia PPOŻ, dokumenty, szkolenia, historia",
      "Eksport CSV listy obiektów",
    ],
  },
  {
    name: "Mapa obiektów",
    icon: "🗺️",
    description: "Interaktywna mapa z pinami lokalizacji wszystkich obiektów.",
    features: [
      "Mapa Leaflet z OpenStreetMap",
      "Piny kolorowane wg statusu bezpieczeństwa",
      "Geocodowanie adresów (automatyczne i manualne)",
      "Lista obiektów pod mapą z wyszukiwarką",
    ],
  },
  {
    name: "Firmy (Klienci)",
    icon: "🏭",
    description: "Rejestr spółek i kontrahentów z pełnym CRM.",
    features: [
      "Karta firmy: nazwa, NIP (weryfikacja w Białej Liście MF), adres",
      "Statystyki per firma: obiekty, zadania, SLA %",
      "Zarządzanie osobami kontaktowymi (wieloosobowe)",
      "Edycja inline: NIP, nazwa, adres",
      "Przypisanie obiektów do kontaktów",
    ],
  },
  {
    name: "Audyty PPOŻ",
    icon: "🔍",
    description: "Planowanie i przeprowadzanie audytów stanu bezpieczeństwa pożarowego.",
    features: [
      "Planowanie audytu: obiekt, typ, termin, audytor",
      "Wyszukiwarka audytów",
      "Historia przeprowadzonych audytów",
    ],
  },
  {
    name: "Checklisty",
    icon: "✅",
    description: "Odklikialne listy kontrolne dla audytów, przeglądów sprzętu i BHP.",
    features: [
      "6 szablonów systemowych: audyt pełny PPOŻ, gaśnice, hydranty, SSP, drzwi PPOŻ, oświetlenie awaryjne",
      "Tworzenie własnych szablonów per firma",
      "Przeprowadzanie audytu punkt po punkcie (OK / NIE OK / N/A)",
      "Zdjęcia i notatki przy każdym punkcie",
      "Automatyczne tworzenie zadań dla punktów NIE OK",
      "Generowanie protokołu PDF po zakończeniu",
    ],
  },
  {
    name: "Protokoły serwisowe",
    icon: "📄",
    description: "Rejestr i zarządzanie wynikami przeglądów PPOŻ.",
    features: [
      "Dodawanie protokołów: typ, obiekt, data, wynik",
      "Wyszukiwanie po obiekcie i typie",
      "Powiązanie z obiektem i audytorem",
    ],
  },
  {
    name: "Certyfikaty",
    icon: "🛡️",
    description: "Lista wydanych certyfikatów bezpieczeństwa z monitoringiem ważności.",
    features: [
      "Certyfikaty per obiekt z datą ważności",
      "Status: aktywny / wygasający / wygasły",
      "Tworzenie nowych certyfikatów",
    ],
  },
  {
    name: "Terminarz biurowy",
    icon: "📅",
    description: "Cykliczne wydarzenia: szkolenia, serwisy, IBP, ubezpieczenia, umowy.",
    features: [
      "Zdarzenia jednorazowe i cykliczne (co X miesięcy)",
      "Powiadomienia o przeterminowanych terminach",
      "Przypisanie do obiektu",
      "Oznaczanie jako wykonane",
      "Edycja i usuwanie zdarzeń",
    ],
  },
  {
    name: "Biblioteka PPOŻ",
    icon: "📚",
    description: "Baza wiedzy z przepisami, wytycznymi i szablonami dokumentów.",
    features: [
      "AI Asystent prawno-techniczny (GPT-4o + RAG)",
      "Kategorie: Prawo, Wytyczne, Szablony, Wewnętrzne",
      "Wyszukiwanie pełnotekstowe (FTS)",
      "Indeksowanie dokumentów (chunking + embedding)",
      "Filtrowanie po obiekcie",
    ],
  },
  {
    name: "Raporty i KPI",
    icon: "📊",
    description: "Wskaźniki operacyjne, zgodność SLA, status obiektów.",
    features: [
      "Eksport raportu do PDF",
      "Trend zgłoszeń SLA (12 mies.)",
      "Średni czas naprawy wg priorytetu",
      "Top 10 obiektów wg liczby zgłoszeń",
      "Karty KPI: otwarte SLA, przekroczone, zgodność %",
    ],
  },
  {
    name: "Spotkania i Wizje",
    icon: "👥",
    description: "Planowanie, dokumentowanie i zarządzanie spotkaniami.",
    features: [
      "Dodawanie spotkań z datą, uczestnikami, lokalizacją",
      "Widok: nadchodzące / archiwum",
      "Wyszukiwarka spotkań",
    ],
  },
  {
    name: "Zespół",
    icon: "👷",
    description: "Zarządzanie pracownikami, szkoleniami i uprawnieniami.",
    features: [
      "Karta pracownika: dane, stanowisko, obiekt, badania lekarskie",
      "Status szkolenia BHP/PPOŻ (Aktualne / W trakcie / Wygasłe)",
      "Rola pożarowa: gaszenie / ewakuacja / pierwsza pomoc",
      "Postęp onboardingu (%)",
      "Ewidencja szkoleń i uprawnień",
      "Eksport listy do CSV",
    ],
  },
  {
    name: "Analityka",
    icon: "📉",
    description: "Zaawansowane raporty i wskaźniki KPI z eksportem do Excel.",
    features: [
      "Trend zadań 6 mies. (utworzone / zamknięte / zaległe)",
      "SLA Compliance — trend %",
      "Raport globalny do Excel",
      "Zakres dat konfigurowalny",
    ],
  },
  {
    name: "Kalendarz",
    icon: "📆",
    description: "Widok miesięczny wszystkich terminów i zdarzeń.",
    features: [
      "Kolory wg pilności: >7 dni / ≤7 / ≤4 / ≤2 dni",
      "Filtry: Zadania, Podzadania, Spotkania, Audyty, Protokoły",
      "Filtr po pracowniku",
      "Szczegóły dnia po kliknięciu",
      "Tworzenie spotkań i zadań z kalendarza",
    ],
  },
  {
    name: "CRM — Kontakty",
    icon: "📇",
    description: "Baza osób kontaktowych powiązanych z firmami.",
    features: [
      "Dodawanie kontaktów: imię, telefon, email, stanowisko",
      "Przypisanie do firmy i obiektów",
      "Oznaczenie: główny / awaryjny",
      "Wyszukiwarka",
    ],
  },
  {
    name: "Finanse",
    icon: "💰",
    description: "Szanse sprzedażowe, oferty i bilans finansowy zadań.",
    features: [
      "Szanse sprzedażowe z workflow: Nowy lead → Kontakt → Oferta → Zlecenie → Archiwum",
      "Historia kontaktów / spotkań przy każdej szansie (timeline)",
      "Konwersja szansy na zlecenie (wizard 4-krokowy)",
      "Szybka szansa sprzedażowa (FAB — globalny przycisk)",
      "Oferty z pozycjami i cenami",
      "Bilans: przychody, koszty, marża",
    ],
  },
];

export function generateClientSummaryPDF() {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // ---- COVER PAGE ----
  doc.setFillColor(30, 30, 30);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  doc.setFontSize(36);
  doc.setTextColor(220, 38, 38);
  doc.text("FIRE ZONE", pageWidth / 2, 80, { align: "center" });

  doc.setFontSize(14);
  doc.setTextColor(200, 200, 200);
  doc.text("OPERATOR PPOŻ", pageWidth / 2, 92, { align: "center" });

  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text("Przewodnik po systemie", pageWidth / 2, 130, { align: "center" });

  doc.setFontSize(12);
  doc.setTextColor(180, 180, 180);
  doc.text("Opis funkcjonalności poszczególnych modułów", pageWidth / 2, 142, { align: "center" });

  const today = new Date().toLocaleDateString("pl-PL", { year: "numeric", month: "long", day: "numeric" });
  doc.setFontSize(11);
  doc.setTextColor(150, 150, 150);
  doc.text(today, pageWidth / 2, 170, { align: "center" });
  doc.text("Wersja 1.0", pageWidth / 2, 178, { align: "center" });

  // ---- TABLE OF CONTENTS ----
  doc.addPage();
  drawHeader(doc, "Spis treści");
  let tocY = 45;
  doc.setFontSize(10);

  MODULES.forEach((m, i) => {
    if (tocY > pageHeight - 20) {
      doc.addPage();
      drawHeader(doc, "Spis treści (cd.)");
      tocY = 45;
    }
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "normal");
    const num = String(i + 1).padStart(2, "0");
    doc.text(`${num}.  ${m.icon}  ${m.name}`, margin, tocY);
    tocY += 7;
  });

  // ---- MODULE PAGES ----
  MODULES.forEach((m, i) => {
    doc.addPage();
    drawHeader(doc, `${String(i + 1).padStart(2, "0")}. ${m.name}`);

    let y = 48;

    // Description
    doc.setFontSize(11);
    doc.setTextColor(...GRAY);
    const descLines = doc.splitTextToSize(m.description, contentWidth);
    doc.text(descLines, margin, y);
    y += descLines.length * 6 + 8;

    // Features table
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.setFont("helvetica", "bold");
    doc.text("Funkcjonalności:", margin, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [["#", "Funkcja"]],
      body: m.features.map((f, fi) => [String(fi + 1), f]),
      theme: "striped",
      headStyles: { fillColor: BRAND_RED, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: contentWidth - 12 },
      },
      margin: { left: margin, right: margin },
    });
  });

  // ---- CHANGELOG: Zmiany z ostatniej sesji ----
  doc.addPage();
  drawHeader(doc, "Zmiany z ostatniej sesji");

  doc.setFontSize(11);
  doc.setTextColor(...GRAY);
  const changelogIntro = doc.splitTextToSize(
    "Poniżej znajdziesz listę nowych funkcji, usprawnień i poprawek wprowadzonych do systemu Fire Zone w ostatniej iteracji rozwoju.",
    contentWidth
  );
  doc.text(changelogIntro, margin, 48);

  // Sekcja: Nowe funkcje
  autoTable(doc, {
    startY: 65,
    head: [["Nowe funkcje", "Opis"]],
    body: [
      [
        "PDF — Przewodnik po systemie",
        "Generator pełnego przewodnika klienta z opisem wszystkich 22 modułów. Dostępny w Ustawieniach > Pomoc / Przewodnik (przycisk Pobierz PDF).",
      ],
      [
        "Tworzenie własnych szablonów Checklist",
        "W zakładce Checklisty pojawił się przycisk 'Nowy szablon'. Dialog pozwala zdefiniować dowolne punkty kontrolne z sekcjami, poziomem ważności, wymogiem zdjęcia i notatki przy NIE OK.",
      ],
      [
        "Rola pożarowa pracowników",
        "Nowe pole w karcie pracownika: gaszenie, koordynacja ewakuacji, pierwsza pomoc lub kombinacje. Widoczne na liście pracowników oraz w eksporcie CSV.",
      ],
      [
        "Szybka szansa sprzedażowa (FAB)",
        "Globalny przycisk 'Szybka szansa' w prawym dolnym rogu na każdej stronie. Pozwala dodać szansę bez przechodzenia do CRM.",
      ],
      [
        "Timeline aktualizacji szans",
        "Każda szansa sprzedażowa ma chronologiczny log aktualizacji (kontakty, spotkania, zmiany etapu).",
      ],
      [
        "Opisy zadań na kartach Kanban",
        "Karty zadań na tablicy Kanban pokazują teraz 2-liniowy fragment opisu pod tytułem — szybsza orientacja bez otwierania szczegółów.",
      ],
      [
        "Zakładka Pomoc / Przewodnik",
        "Nowa zakładka w Ustawieniach z brandowaną stroną pomocy, statystykami systemu i pobieraniem PDF.",
      ],
    ],
    theme: "striped",
    headStyles: { fillColor: BRAND_RED, fontSize: 10, halign: "left" },
    bodyStyles: { fontSize: 9, valign: "top" },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: "bold" },
      1: { cellWidth: contentWidth - 55 },
    },
    margin: { left: margin, right: margin },
  });

  const afterFeaturesY = (doc as any).lastAutoTable.finalY + 10;

  // Sekcja: Poprawki techniczne
  autoTable(doc, {
    startY: afterFeaturesY,
    head: [["Poprawki techniczne", "Opis"]],
    body: [
      [
        "Naprawa Kanban (HTTP 300)",
        "Disambiguacja relacji tasks ↔ sales_opportunities przez tasks_opportunity_id_fkey — Kanban ładuje się ponownie poprawnie.",
      ],
      [
        "Renderowanie zakładki Pomoc",
        "Brakujący warunek renderowania komponentu HelpTab w SettingsPage — naprawione.",
      ],
      [
        "Vercel build (peer deps)",
        "Wyrównanie wersji @vitest/ui do v3 zgodnie z vitest@3.2.4 — deploy na Vercel ponownie przechodzi.",
      ],
      [
        "Świeży package-lock.json",
        "Pełna regeneracja lockfile przez czysty npm install — usunięte przestarzałe wpisy.",
      ],
    ],
    theme: "striped",
    headStyles: { fillColor: BRAND_RED, fontSize: 10, halign: "left" },
    bodyStyles: { fontSize: 9, valign: "top" },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: "bold" },
      1: { cellWidth: contentWidth - 55 },
    },
    margin: { left: margin, right: margin },
  });

  const afterFixesY = (doc as any).lastAutoTable.finalY + 10;

  // Sekcja: Migracje bazy danych
  if (afterFixesY < pageHeight - 60) {
    autoTable(doc, {
      startY: afterFixesY,
      head: [["Migracje bazy danych", "Opis"]],
      body: [
        [
          "20260424220000_iter8_checklists",
          "Pełen schemat checklist: templates, template_items, runs, run_items + 6 szablonów systemowych (audyt, gaśnice, hydranty, SSP, drzwi, oświetlenie).",
        ],
        [
          "20260519100000_opportunity_updates",
          "Tabela sales_opportunity_updates dla timeline aktualizacji szans sprzedażowych.",
        ],
        [
          "20260519120000_employee_fire_role",
          "Pole fire_role w employee_development_plans + aktualizacja widoku employees_with_details.",
        ],
      ],
      theme: "striped",
      headStyles: { fillColor: BRAND_RED, fontSize: 10, halign: "left" },
      bodyStyles: { fontSize: 9, valign: "top" },
      columnStyles: {
        0: { cellWidth: 55, fontStyle: "bold" },
        1: { cellWidth: contentWidth - 55 },
      },
      margin: { left: margin, right: margin },
    });
  } else {
    doc.addPage();
    drawHeader(doc, "Zmiany z ostatniej sesji (cd.)");
    autoTable(doc, {
      startY: 48,
      head: [["Migracje bazy danych", "Opis"]],
      body: [
        [
          "20260424220000_iter8_checklists",
          "Pełen schemat checklist: templates, template_items, runs, run_items + 6 szablonów systemowych (audyt, gaśnice, hydranty, SSP, drzwi, oświetlenie).",
        ],
        [
          "20260519100000_opportunity_updates",
          "Tabela sales_opportunity_updates dla timeline aktualizacji szans sprzedażowych.",
        ],
        [
          "20260519120000_employee_fire_role",
          "Pole fire_role w employee_development_plans + aktualizacja widoku employees_with_details.",
        ],
      ],
      theme: "striped",
      headStyles: { fillColor: BRAND_RED, fontSize: 10, halign: "left" },
      bodyStyles: { fontSize: 9, valign: "top" },
      columnStyles: {
        0: { cellWidth: 55, fontStyle: "bold" },
        1: { cellWidth: contentWidth - 55 },
      },
      margin: { left: margin, right: margin },
    });
  }

  // ---- PODSUMOWANIE NA OSTATNIEJ STRONIE ----
  doc.addPage();
  drawHeader(doc, "Podsumowanie");

  doc.setFontSize(13);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("Fire Zone Operator PPOŻ — system w liczbach", margin, 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...GRAY);

  const stats: Array<[string, string]> = [
    ["Modułów funkcjonalnych", `${MODULES.length}`],
    ["Zakresów checklist", "4 (audyt, sprzęt, BHP, inne)"],
    ["Szablonów systemowych", "6 gotowych do użycia"],
    ["Etapów workflow SLA", "8 (Zgłoszenie → Zamknięte)"],
    ["Etapów workflow Napraw", "8 (Nowe → Zafakturowane)"],
    ["Etapów lejka sprzedaży", "5 (Lead → Archiwum)"],
    ["Statusów zadań Kanban", "5 (Nowe → Zamknięte)"],
    ["Ról pożarowych pracowników", "5 (gaszenie, ewakuacja, pierwsza pomoc + kombinacje)"],
  ];

  autoTable(doc, {
    startY: 60,
    body: stats,
    theme: "plain",
    bodyStyles: { fontSize: 11, valign: "middle" },
    columnStyles: {
      0: { cellWidth: 90, fontStyle: "bold", textColor: DARK },
      1: { cellWidth: contentWidth - 90, textColor: BRAND_RED, fontStyle: "bold" },
    },
    margin: { left: margin, right: margin },
  });

  const summaryY = (doc as any).lastAutoTable.finalY + 15;

  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("Co dalej?", margin, summaryY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  const nextSteps = [
    "• Uruchom Onboarding (Dashboard → Onboarding) by skonfigurować pierwszą firmę, obiekt i zespół.",
    "• W Checklistach utwórz własny szablon dopasowany do specyfiki Twojego obiektu.",
    "• Skonfiguruj Telegram w Ustawieniach > Mój profil żeby otrzymywać powiadomienia push.",
    "• W zakładce Pomoc / Przewodnik w każdej chwili pobierzesz aktualny PDF z opisem systemu.",
  ];
  nextSteps.forEach((step, i) => {
    const lines = doc.splitTextToSize(step, contentWidth);
    doc.text(lines, margin, summaryY + 8 + i * 7);
  });

  // ---- FOOTER on each page (except cover) ----
  const totalPages = doc.getNumberOfPages();
  for (let p = 2; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Fire Zone — Przewodnik po systemie`, margin, pageHeight - 8);
    doc.text(`Strona ${p - 1} / ${totalPages - 1}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  doc.save("FireZone_Przewodnik_Systemu.pdf");
}

function drawHeader(doc: jsPDF, title: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, 0, pageWidth, 32, "F");

  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(title, 14, 22);
}
