// src/utils/bookDefaults.js
//
// Standardwerte eines Buchs: Töpfe, Kategorien und das leere Standard-Buch.

import { DEFAULT_CATEGORY_COLOR } from "./hbPalette.js";
import { generateId } from "./idUtils.js";
import { emptyInvestments } from "./investmentModel.js";

// ============================================
// NEU: Töpfe-System
// ============================================

// Standard-Töpfe (2 Stück)
export const DEFAULT_POTS = [
  { id: "reserve", name: "Rücklagen" },
  { id: "surplus", name: "Überschuss" },
];

// ============================================
// Hierarchische Standard-Kategorien (NEU)
// ============================================

export const DEFAULT_EXPENSE_CATEGORIES = [
  {
    id: "cat_wohnen",
    name: "Wohnen",
    color: DEFAULT_CATEGORY_COLOR,
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_wohnnebenkosten", name: "Wohnnebenkosten", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_immobilienkredit", name: "Immobilienkredit", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_haushaltsdienstleistungen", name: "Haushaltsdienstleistungen", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_moebel_haushaltsgeraete", name: "Möbel und Haushaltsgeräte", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_miete_wohngeld", name: "Miete", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_heimwerken_garten", name: "Heimwerken und Garten", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_strom", name: "Strom", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_gas", name: "Gas", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_oel", name: "Heizöl", parentId: "cat_wohnen", isDefault: true },
      { id: "sub_wasser", name: "Wasser und Abwasser", parentId: "cat_wohnen", isDefault: true },
    ],
  },
  {
    id: "cat_versicherung",
    name: "Versicherung",
    color: "#7160e8",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_bu_versicherung", name: "Berufsunfähigkeitsversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_haftpflicht", name: "Haftpflichtversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_krankenversicherung", name: "Krankenversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_risiko_leben", name: "Risiko-Lebensversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_pflegeversicherung", name: "Pflegeversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_rechtsschutz", name: "Rechtsschutzversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_unfallversicherung", name: "Unfallversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_reiseversicherung", name: "Reiseversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_kranken_zusatz", name: "Kranken-Zusatzversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_hausratversicherung", name: "Hausratversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_wohngebaeudeversicherung", name: "Wohngebäudeversicherung", parentId: "cat_versicherung", isDefault: true },
      { id: "sub_tierversicherung", name: "Tierversicherung", parentId: "cat_versicherung", isDefault: true },
    ],
  },
  {
    id: "cat_sparen",
    name: "Sparen und Anlegen",
    color: "#e8a200",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_wertpapieranlage", name: "Wertpapieranlage", parentId: "cat_sparen", isDefault: true },
      { id: "sub_wertgegenstaende", name: "Wertgegenstände", parentId: "cat_sparen", isDefault: true },
      { id: "sub_edelmetalle", name: "Edelmetalle", parentId: "cat_sparen", isDefault: true },
      { id: "sub_krypto", name: "Krypto", parentId: "cat_sparen", isDefault: true },
      { id: "sub_immobilien", name: "Immobilien", parentId: "cat_sparen", isDefault: true },
    ],
  },
  {
    id: "cat_shopping",
    name: "Shopping und Unterhaltung",
    color: "#e3008c",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_buecher_zeitungen", name: "Bücher / Zeitungen / Zeitschriften", parentId: "cat_shopping", isDefault: true },
      { id: "sub_tv_video_musik", name: "TV / Video / Musik", parentId: "cat_shopping", isDefault: true },
      { id: "sub_bekleidung_schuhe", name: "Bekleidung / Schuhe / Accessoires", parentId: "cat_shopping", isDefault: true },
      { id: "sub_elektronik", name: "Elektronik und Technik", parentId: "cat_shopping", isDefault: true },
      { id: "sub_geschenke", name: "Geschenke", parentId: "cat_shopping", isDefault: true },
    ],
  },
  {
    id: "cat_reisen",
    name: "Reisen",
    color: "#e74856",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_hotel_unterkunft", name: "Hotel und Unterkunft", parentId: "cat_reisen", isDefault: true },
      { id: "sub_pauschalreise", name: "Pauschalreise", parentId: "cat_reisen", isDefault: true },
      { id: "sub_reise_transport", name: "An- und Abreise", parentId: "cat_reisen", isDefault: true },
    ],
  },
  {
    id: "cat_mobilitaet",
    name: "Mobilität",
    color: "#f7630c",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_kfz_versicherung", name: "Autoversicherung", parentId: "cat_mobilitaet", isDefault: true },
      { id: "sub_tanken", name: "Tanken / Laden", parentId: "cat_mobilitaet", isDefault: true },
      { id: "sub_kfz_kredit", name: "Autokredit / Leasing / Autokauf", parentId: "cat_mobilitaet", isDefault: true },
      { id: "sub_werkstatt", name: "Werkstatt / Reparatur / Wartung", parentId: "cat_mobilitaet", isDefault: true },
      { id: "sub_kfz_sonstige", name: "Auto Sonstiges", parentId: "cat_mobilitaet", isDefault: true },
      { id: "sub_parken", name: "Parken", parentId: "cat_mobilitaet", isDefault: true },
      { id: "sub_oepnv", name: "ÖPNV / Bahn / Ticket", parentId: "cat_mobilitaet", isDefault: true },
    ],
  },
  {
    id: "cat_lebenshaltung",
    name: "Lebenshaltung",
    color: "#038387",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_drogerie", name: "Drogerie", parentId: "cat_lebenshaltung", isDefault: true },
      { id: "sub_festnetz_internet", name: "Festnetz und Internet", parentId: "cat_lebenshaltung", isDefault: true },
      { id: "sub_handy", name: "Handy", parentId: "cat_lebenshaltung", isDefault: true },
      { id: "sub_lebensmittel_zuhause", name: "Lebensmittel zu Hause", parentId: "cat_lebenshaltung", isDefault: true },
      { id: "sub_haustierbedarf", name: "Haustierbedarf", parentId: "cat_lebenshaltung", isDefault: true },
      { id: "sub_haushaltsbedarf", name: "Haushaltsbedarf", parentId: "cat_lebenshaltung", isDefault: true },
    ],
  },
  {
    id: "cat_kinder",
    name: "Kinder",
    color: "#c239b3",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_spielwaren", name: "Spielwaren", parentId: "cat_kinder", isDefault: true },
      { id: "sub_taschengeld", name: "Taschengeld / Unterhalt", parentId: "cat_kinder", isDefault: true },
      { id: "sub_kinderbetreuung", name: "Kinderbetreuung", parentId: "cat_kinder", isDefault: true },
    ],
  },
  {
    id: "cat_gesundheit",
    name: "Gesundheit und Wellness",
    color: "#9acd32",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_arznei_heilmittel", name: "Arznei- und Heilmittel", parentId: "cat_gesundheit", isDefault: true },
      { id: "sub_wellness_beauty", name: "Wellness und Beauty", parentId: "cat_gesundheit", isDefault: true },
      { id: "sub_arztbesuch", name: "Arztbesuch / Krankenhaus", parentId: "cat_gesundheit", isDefault: true },
    ],
  },
  {
    id: "cat_freizeit",
    name: "Freizeit, Hobbies und Soziales",
    color: "#498205",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_spenden", name: "Spenden", parentId: "cat_freizeit", isDefault: true },
      { id: "sub_restaurant_cafe", name: "Restaurant / Cafe / Bar", parentId: "cat_freizeit", isDefault: true },
      { id: "sub_sport_fitness", name: "Sport und Fitness", parentId: "cat_freizeit", isDefault: true },
      { id: "sub_freizeitaktivitaeten", name: "Freizeitaktivitäten", parentId: "cat_freizeit", isDefault: true },
    ],
  },
  {
    id: "cat_bank",
    name: "Bank und Kredit",
    color: "#4f6bed",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_bankgebuehren", name: "Bankgebühren", parentId: "cat_bank", isDefault: true },
      { id: "sub_barauszahlung", name: "Barauszahlung", parentId: "cat_bank", isDefault: true },
      { id: "sub_kreditkartenabrechnung", name: "Kreditkartenabrechnung", parentId: "cat_bank", isDefault: true },
      { id: "sub_tilgung", name: "Tilgung", parentId: "cat_bank", isDefault: true },
    ],
  },
  {
    id: "cat_steuern",
    name: "Steuern und Abgaben",
    color: "#8e562e",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_steuern", name: "Steuern", parentId: "cat_steuern", isDefault: true },
      { id: "sub_rundfunk", name: "Rundfunkbeitrag", parentId: "cat_steuern", isDefault: true },
      { id: "sub_gebuehren_abgaben", name: "Gebühren und Abgaben", parentId: "cat_steuern", isDefault: true },
    ],
  },
  {
    id: "cat_bildung",
    name: "Bildung und Weiterbildung",
    color: "#00b7c3",
    type: "expense",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_schule_ausbildung", name: "Schule und Ausbildung", parentId: "cat_bildung", isDefault: true },
      { id: "sub_weiterbildung", name: "Weiterbildung und Kurse", parentId: "cat_bildung", isDefault: true },
      { id: "sub_studiengebuehren", name: "Studiengebühren", parentId: "cat_bildung", isDefault: true },
    ],
  },
];

export const DEFAULT_INCOME_CATEGORIES = [
  {
    id: "cat_einnahmen",
    name: "Einnahmen",
    color: "#10893e",
    type: "income",
    isDefault: true,
    budget: null,
    subcategories: [
      { id: "sub_gehalt", name: "Gehalt", parentId: "cat_einnahmen", isDefault: true },
      { id: "sub_nebentaetigkeit", name: "Nebentätigkeit und Selbstständigkeit", parentId: "cat_einnahmen", isDefault: true },
      { id: "sub_kapitaleinkommen", name: "Kapitalerträge", parentId: "cat_einnahmen", isDefault: true },
      { id: "sub_mieteinnahmen", name: "Mieteinnahmen", parentId: "cat_einnahmen", isDefault: true },
      { id: "sub_rente_pension", name: "Rente und Pension", parentId: "cat_einnahmen", isDefault: true },
      { id: "sub_staatliche_leistung", name: "Staatliche Leistung und Förderung", parentId: "cat_einnahmen", isDefault: true },
      { id: "sub_unterhalt_einnahme", name: "Unterhalt", parentId: "cat_einnahmen", isDefault: true },
      { id: "sub_erstattungen", name: "Erstattungen und Rückzahlungen", parentId: "cat_einnahmen", isDefault: true },
      { id: "sub_verkaufserloese", name: "Verkaufserlöse", parentId: "cat_einnahmen", isDefault: true },
      { id: "sub_bareinzahlung", name: "Bareinzahlung", parentId: "cat_einnahmen", isDefault: true },
    ],
  },
];

// ============================================
// Datenmodell: Standard-Buch erstellen
// ============================================

export function makeDefaultBook(name = "Mein Haushaltsbuch") {
  return {
    id: generateId("book"),
    name,
    expenseCategories: DEFAULT_EXPENSE_CATEGORIES.map((c) => ({
      ...c,
      subcategories: c.subcategories.map((s) => ({ ...s })),
    })),
    incomeCategories: DEFAULT_INCOME_CATEGORIES.map((c) => ({
      ...c,
      subcategories: c.subcategories.map((s) => ({ ...s })),
    })),
    transferCategories: [],
    entries: [],
    pots: [],
    recurringExpenses: [],
    fixedCostGroups: [],
    costGroups: [],
    entryTemplates: [],
    investments: emptyInvestments(),
    baseCurrency: "CHF",
    monthStartDay: 1,
  };
}
