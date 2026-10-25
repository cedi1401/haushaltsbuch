// src/utils/formatUtils.js
//
// Anzeigeformate der App: Beträge, Prozentwerte, Datumsangaben, Dateistempel
// sowie das Einlesen von Beträgen aus Eingabefeldern.

import { MONTHS_LONG } from "./constants.js";

// Intl.NumberFormat ist teuer im Aufbau; formatCurrency läuft aber pro
// Tabellenzeile und Chart-Tick. Deshalb ein Formatter je Locale + Optionen.
const numberFormats = new Map();

function numberFormat(locale, options) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let nf = numberFormats.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, nf);
  }
  return nf;
}

function fractionDigitsOptions(fractionDigits) {
  return { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits };
}

// Internal legacy CHF formatter — used as fallback by formatCurrency below.
function toCHF(n) {
  try {
    return numberFormat("de-CH", { style: "currency", currency: "CHF", ...fractionDigitsOptions(2) }).format(Number(n || 0));
  } catch {
    return `${Number(n || 0).toFixed(2)} CHF`;
  }
}

// Negative Beträge tragen ein echtes Minus (U+2212) VOR dem Währungs-Affix:
// „−CHF 65.00", „−65,00 €". Intl setzt es je nach Locale hinter den Code
// („CHF-65.00") oder als Bindestrich — deshalb wird hier der Betrag ohne
// Vorzeichen formatiert und das Minus einheitlich davorgestellt.
export function formatCurrency(n, currency = "CHF", fractionDigits = 2) {
  const value = Number(n || 0);
  if (value < 0) return `−${formatCurrency(-value, currency, fractionDigits)}`;
  const cur = String(currency).toUpperCase();
  const amount = value;
  try {
    if (cur === "CHF") {
      // style:"currency" erzwingt U+0027 als Tausendertrennzeichen (schmales Apostroph)
      // Plain-Number-Format nutzt in Chromium U+2019 (breiter)
      return numberFormat("de-CH", {
        style: "currency",
        currency: "CHF",
        currencyDisplay: "code",
        ...fractionDigitsOptions(fractionDigits),
      }).format(amount);
    }
    if (cur === "EUR") {
      // 1.250,50 € (deutsches Format, Symbol nach Betrag)
      return `${numberFormat("de-DE", fractionDigitsOptions(fractionDigits)).format(amount)} €`;
    }
    if (cur === "USD") {
      // $1,250.50 (US-Format, Symbol vor Betrag)
      return `$${numberFormat("en-US", fractionDigitsOptions(fractionDigits)).format(amount)}`;
    }
    if (cur === "GBP") {
      return `£${numberFormat("en-GB", fractionDigitsOptions(fractionDigits)).format(amount)}`;
    }
    if (cur === "JPY") {
      return `¥${numberFormat("ja-JP", fractionDigitsOptions(0)).format(amount)}`;
    }
    // Fallback für andere Währungen
    return numberFormat("de-CH", { style: "currency", currency: cur, ...fractionDigitsOptions(fractionDigits) }).format(amount);
  } catch {
    return toCHF(n);
  }
}

// Betrag einer Differenz: wie `fmt`, positive Werte bekommen zusätzlich ein „+".
// `fmt` ist der Formatierer des aktiven Buchs (useFmt). Was gerundet null
// ergibt, bleibt ohne Vorzeichen — „+CHF 0.00" oder „−CHF 0.00" gibt es nicht.
// Nur für Differenzen und Gewinne; Richtungsangaben wie Einnahme/Ausgabe
// setzen ihr Zeichen weiter selbst.
export function formatSigned(fmt, n) {
  const value = Number(n || 0);
  const zero = fmt(0);
  if (fmt(Math.abs(value)) === zero) return zero;
  return `${value > 0 ? "+" : ""}${fmt(value)}`;
}

/**
 * Prozentwert im app-weiten Format: Leerzeichen vor dem Zeichen („15.3 %"),
 * echtes Minus (U+2212) wie bei formatCurrency, auf Wunsch ein „+" bei
 * positiven Werten. `null` (kein Wert berechenbar) wird zu „—", nicht zu „0 %".
 * Was gerundet null ergibt, trägt kein Vorzeichen.
 *
 * @param {number|null} value Prozentwert (15.3, nicht 0.153)
 * @param {{digits?: number, sign?: boolean}} options
 * @returns {string}
 */
export function formatPercent(value, { digits = 1, sign = true } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  const rounded = Number(n.toFixed(digits));
  const text = numberFormat("de-CH", fractionDigitsOptions(digits)).format(Math.abs(n));
  const prefix = rounded < 0 ? "−" : sign && rounded > 0 ? "+" : "";
  return `${prefix}${text} %`;
}

// Kompakte Währungsdarstellung für Chart-Achsen und andere enge Kontexte:
// Tausender/Millionen werden zu „k"/„M" gekürzt, z. B. CHF 3.5k, −1.2k €, $4M.
// Der einzige Achsen-Formatierer der App — der exakte Betrag steht im Tooltip.
// Affix-Platzierung folgt formatCurrency: Leerzeichen nach einem ISO-Code,
// keines nach einem vorangestellten Symbol.
function trimCompactNumber(x) {
  const s = x.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function formatCurrencyCompact(n, currency = "CHF") {
  const cur = String(currency).toUpperCase();
  const amount = Number(n || 0);
  const sign = amount < 0 ? "−" : "";
  const abs = Math.abs(amount);
  let num;
  if (abs >= 1_000_000) num = `${trimCompactNumber(abs / 1_000_000)}M`;
  else if (abs >= 1_000) num = `${trimCompactNumber(abs / 1_000)}k`;
  else num = String(Math.round(abs));

  if (cur === "EUR") return `${sign}${num} €`;
  if (cur === "USD") return `${sign}$${num}`;
  if (cur === "GBP") return `${sign}£${num}`;
  if (cur === "JPY") return `${sign}¥${num}`;
  return `${sign}${cur} ${num}`;
}

// Formatiert ein Date als lokalen YYYY-MM-String (nicht UTC), damit Datums-
// grenzen mit dem Rest der App (lokale Zeitzone) übereinstimmen.
export function toLocalISO(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function todayISO() {
  return toLocalISO(new Date());
}

/**
 * Formatiert ein ISO-Datum (YYYY-MM-DD) im europäischen Format (DD.MM.YYYY).
 * Gibt einen leeren String zurück, falls das Eingabedatum ungültig ist.
 */
export function formatDateDE(isoDate) {
  if (!isoDate) return "";
  const s = String(isoDate);
  // Bereits DD.MM.YYYY? -> unverändert zurück
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const [, yyyy, mm, dd] = m;
  return `${dd}.${mm}.${yyyy}`;
}

export function formatDateDELong(isoDate) {
  if (!isoDate) return "";
  const m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return isoDate;
  return `${Number(m[3])}. ${MONTHS_LONG[Number(m[2]) - 1]} ${m[1]}`;
}

export function formatFileStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}`;
}

export function parseAmount(input) {
  const n = Number(String(input ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}
