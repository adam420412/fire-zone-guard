export const AUDIT_TEMPLATES = {
  "ibp": {
    name: "Audyt Zgodności z IBP",
    items: [
      { category: "Ogólne", question: "Czy instrukcja bezpieczeństwa pożarowego jest aktualna?", status: "BRAK", notes: "" },
      { category: "Ogólne", question: "Czy pracownicy zapoznali się z IBP?", status: "BRAK", notes: "" },
      { category: "Ewakuacja", question: "Czy drogi ewakuacyjne są drożne?", status: "BRAK", notes: "" },
      { category: "Ewakuacja", question: "Czy kierunki ewakuacji są prawidłowo oznakowane?", status: "BRAK", notes: "" },
      { category: "Sprzęt gaśniczy", question: "Czy umiejscowienie gaśnic jest zgodne z planem?", status: "BRAK", notes: "" },
      { category: "Oznakowanie", question: "Czy główne wyłączniki prądu i gazu są oznakowane?", status: "BRAK", notes: "" },
    ]
  },
  "extinguishers": {
    name: "Przegląd Gaśnic",
    items: [
      { category: "Stan techniczny gaśnic", question: "Czy gaśnice posiadają aktualne plomby?", status: "BRAK", notes: "" },
      { category: "Stan techniczny gaśnic", question: "Czy manometry w gaśnicach stałociśnieniowych wskazują ciśnienie w zielonym polu?", status: "BRAK", notes: "" },
      { category: "Umiejscowienie gaśnic", question: "Czy dostęp do gaśnic jest swobodny?", status: "BRAK", notes: "" },
      { category: "Umiejscowienie gaśnic", question: "Czy odległość do gaśnicy nie przekracza 30m?", status: "BRAK", notes: "" },
      { category: "Oznakowanie", question: "Czy miejsca znalezienia gaśnic są poprawnie oznakowane znakami ochrony przeciwpożarowej?", status: "BRAK", notes: "" },
    ]
  },
  "evacuation": {
    name: "Oceny Warunków Ewakuacji",
    items: [
      { category: "Parametry dróg ewakuacyjnych", question: "Czy szerokość pozioma dróg ewakuacyjnych jest właściwa?", status: "BRAK", notes: "" },
      { category: "Parametry dróg ewakuacyjnych", question: "Czy drzwi ewakuacyjne otwierają się na zewnątrz?", status: "BRAK", notes: "" },
      { category: "Znaki ewakuacyjne", question: "Czy znaki kierunkowe ewakuacyjne wykonano zgodnie z obowiązującą normą?", status: "BRAK", notes: "" },
      { category: "Znaki ewakuacyjne", question: "Czy oświetlenie ewakuacyjne funkcjonuje prawidłowo?", status: "BRAK", notes: "" },
      { category: "BHP", question: "Czy w obrębie dróg ewakuacyjnych nie są składowane przedmioty łatwopalne?", status: "BRAK", notes: "" },
    ]
  }
};
