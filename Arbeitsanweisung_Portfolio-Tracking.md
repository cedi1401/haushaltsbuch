**Arbeitsanweisung**

Portfolio-Tracking via Marktpreis-APIs

# **1\. Kontext & Zielsetzung**

Das bestehende Haushaltsbuch-Programm soll um ein Portfolio-Tracking-Feature erweitert werden. Ziel ist es, Marktpreise verschiedener Asset-Klassen automatisch abzurufen und in bestehenden Portfolios täglich zu aktualisieren - ohne manuelle Dateneingabe.

**Rahmenbedingungen**

• Aktualisierungsfrequenz: täglich (kein Realtime-Bedarf)

• API-Keys: Keine Registrierung / kein Account erforderlich (Priorität)

• Kosten: Ausschließlich kostenfreie Endpunkte nutzen

• Asset-Klassen: Edelmetalle, Aktien, ETFs, Kryptowährungen

# **2\. Zu verwendende APIs**

## **2.1 Kryptowährungen**

| **Anbieter** | **Endpunkt (Basis-URL)** | **Kein Key?** | **Limit** |
| --- | --- | --- | --- |
| CoinGecko | api.coingecko.com/api/v3/simple/price | ✅ Ja | 30 Req/Min |
| CoinCap | api.coincap.io/v2/assets/{id} | ✅ Ja | Großzügig |
| Binance | api.binance.com/api/v3/ticker/price | ✅ Ja | Sehr hoch |

**Empfehlung: CoinGecko als primäre Quelle, Binance als Fallback.**

## **2.2 Aktien & ETFs**

| **Anbieter** | **Endpunkt (Basis-URL)** | **Kein Key?** | **Limit** |
| --- | --- | --- | --- |
| Yahoo Finance (inoffiziell) | query1.finance.yahoo.com/v8/finance/chart/{SYMBOL} | ✅ Ja | Rate-Limit, kein Key |

**⚠️ Hinweis zu Yahoo Finance**

Yahoo Finance ist eine inoffizielle API - kein offizieller Support.

Für tägliche Updates funktioniert sie seit Jahren stabil.

Keine Garantie auf Dauerhaftigkeit - Fehlerbehandlung zwingend einbauen.

## **2.3 Edelmetalle**

| **Anbieter** | **Endpunkt (Basis-URL)** | **Kein Key?** | **Limit** |
| --- | --- | --- | --- |
| Frankfurter App | api.frankfurter.app/latest?from=XAU&to=EUR | ✅ Ja | Unbegrenzt |
| metals.live | metals.live/api/spot | ✅ Ja | Unbegrenzt |

_Symbole: XAU = Gold, XAG = Silber, XPT = Platin (Verfügbarkeit je nach Anbieter prüfen)._

# **3\. Implementierungsplan für den Agenten**

## **3.1 Analyse-Phase (Schritt 1)**

Bevor Code geschrieben wird, folgende Punkte analysieren und dokumentieren:

- Vorhandene Datenstruktur der Portfolios inspizieren (Felder, Typen, IDs der Assets)
- Prüfen, wie Assets aktuell gespeichert sind (Datenbankschema / Dateiformat / Objekte)
- Klären, welche Symbole / Ticker für jedes Asset gespeichert sind (z. B. 'AAPL', 'bitcoin', 'XAU')
- Prüfen, ob eine Job-Scheduling-Lösung bereits vorhanden ist (Cron, Task-Queue, etc.)
- Vorhandene HTTP-Client-Bibliotheken im Projekt identifizieren

## **3.2 Architektur (Schritt 2)**

Der Agent soll folgende Modulstruktur entwerfen und implementieren:

**Modul-Übersicht**

📁 services/marketdata/

├── index.js → Einheitlicher Einstiegspunkt (öffentliche API)

├── providers/

│ ├── coingecko.js → Krypto-Preise via CoinGecko

│ ├── binance.js → Krypto-Preise via Binance (Fallback)

│ ├── yahoo.js → Aktien/ETF-Preise via Yahoo Finance

│ └── frankfurter.js → Edelmetall-Preise via Frankfurter App

├── dispatcher.js → Routing: Asset-Typ → richtiger Provider

├── cache.js → Lokaler Tages-Cache (verhindert mehrfache Calls)

└── scheduler.js → Täglicher Update-Job

## **3.3 Dispatcher-Logik (Schritt 3)**

Der Dispatcher leitet Preisanfragen anhand des Asset-Typs weiter:

| **Asset-Typ** | **Provider (primär)** | **Provider (Fallback)** | **Symbol-Format** |
| --- | --- | --- | --- |
| crypto | CoinGecko | Binance | 'bitcoin', 'ethereum' |
| stock | Yahoo Finance | -   | 'AAPL', 'MSFT' |
| etf | Yahoo Finance | -   | 'SPY', 'VWRL.L' |
| metal | Frankfurter App | metals.live | 'XAU', 'XAG' |

## **3.4 Caching-Strategie (Schritt 4)**

Um API-Limits zu respektieren und Performance zu optimieren, ist ein lokaler Cache Pflicht:

- Cache-Key: {symbol}\_{datum} (z. B. 'bitcoin_2024-01-15')
- Cache-Speicherort: Im Arbeitsspeicher (Map/Object) oder in einer lokalen JSON-Datei
- Cache-Gültigkeit: 24 Stunden (tägliche Aktualisierung)
- Bei Cache-Hit: Gecachten Wert zurückgeben, kein API-Call
- Bei Cache-Miss: API aufrufen, Ergebnis cachen, zurückgeben

## **3.5 Fehlerbehandlung (Schritt 5)**

Jeder Provider-Aufruf MUSS folgende Fehlerszenarien abdecken:

| **Fehlerfall** | **Verhalten** |
| --- | --- |
| HTTP-Fehler (4xx / 5xx) | Fallback-Provider versuchen, dann Fehler loggen |
| Netzwerk-Timeout | Retry nach 5 Sek., max. 2 Versuche, dann Fehler |
| Unerwartetes Response-Format | Fehler loggen, letzten bekannten Preis behalten |
| API nicht erreichbar (Yahoo inoffiziell) | Warnung ausgeben, letzten bekannten Preis verwenden |
| Ungültiges Symbol | Fehlermeldung im Portfolio markieren, nicht abstürzen |

## **3.6 Scheduler (Schritt 6)**

Ein täglicher Update-Job soll alle Portfolio-Assets mit aktuellen Preisen versorgen:

- Ausführungszeit: Täglich z. B. um 18:00 Uhr (nach Börsenschluss Europa/USA)
- Alle Assets aller Portfolios iterieren und Preise abrufen
- Preise in der bestehenden Datenstruktur persistieren
- Letzten Update-Zeitstempel pro Asset speichern
- Bei Fehlern: Logging, aber kein Absturz des Gesamtprogramms

Scheduling-Lösung je nach Projektumgebung wählen:

Node.js: node-cron / node-schedule

Python: APScheduler / schedule-Bibliothek

System: Cron-Job (Linux/macOS) / Task Scheduler (Windows)

# **4\. Währungskonfiguration pro Haushaltsbuch**

Jedes Haushaltsbuch soll eine eigene Basiswährung haben, in der alle Preise angezeigt werden. Diese Einstellung ist pro Haushaltsbuch individuell - nicht global für die gesamte Datenbank.

## **4.1 Einstellungs-UI**

In den Einstellungen jedes Haushaltsbuchs soll ein Dropdown-Feld zur Auswahl der Basiswährung ergänzt werden:

- Feld-Name: 'Basiswährung' (oder 'Anzeigewährung')
- Standardwert: CHF
- Auswahl: mind. CHF, EUR, USD - idealerweise alle gängigen ISO-4217-Währungen
- Speicherort: In der Haushaltsbuch-Konfiguration, nicht in den Assets selbst
- Änderung der Basiswährung löst sofortigen Neuabruf / Neuumrechnung aller gecachten Preise aus

## **4.2 Datenmodell - Haushaltsbuch-Einstellungen**

Das Haushaltsbuch-Objekt soll um folgendes Feld erweitert werden:

| **Feld** | **Typ** | **Standardwert** | **Beschreibung** |
| --- | --- | --- | --- |
| baseCurrency | string (ISO 4217) | 'CHF' | Basiswährung des Haushaltsbuchs (z. B. 'CHF', 'EUR', 'USD') |

## **4.3 Währungsumrechnung via Frankfurter App**

Alle API-Preise werden intern in der Originalwährung gespeichert und beim Anzeigen in die Basiswährung umgerechnet. Dafür wird die Frankfurter App als kostenloser, keyloser FX-Dienst verwendet:

GET <https://api.frankfurter.app/latest?from=USD&to=CHF>

Response: { "rates": { "CHF": 0.9123 } }

**Hinweise zur Frankfurter App für FX-Kurse**

• Unterstützt KEINE Kryptowährungen als Quellwährung

• XAU/XAG: Preis in USD abrufen, dann USD→Zielwährung umrechnen

• Tagesaktuell (kein Realtime) - passt perfekt zur täglichen Update-Strategie

• Kein API-Key, keine Registrierung, kostenlos und unbegrenzt nutzbar

## **4.4 Umrechnungs-Architektur**

Der Agent soll einen zentralen CurrencyConverter-Service implementieren, der von allen Providern genutzt wird:

**Erweiterung der Modul-Struktur**

services/marketdata/

... (bestehende Module wie bisher)

currency/

converter.js → Umrechnung: convert(amount, fromCurrency, toCurrency)

fxCache.js → FX-Kurse cachen (täglich, analog zum Preis-Cache)

Ablauf der Preisanzeige:

- 1\. Asset-Preis in Originalwährung abrufen (z. B. BTC in USD von CoinGecko)
- 2\. FX-Kurs für USD→CHF von Frankfurter App abrufen (gecacht, 1x täglich)
- 3\. Umgerechneten Preis in der Basiswährung des Haushaltsbuchs anzeigen
- 4\. Originalwährung und FX-Kurs als Metadaten speichern (für Transparenz / Debugging)

## **4.5 Cache-Erweiterung für FX-Kurse**

- Cache-Key: fx_{fromCurrency}\_{toCurrency}\_{datum} (z. B. 'fx_USD_CHF_2024-01-15')
- Cache-Gültigkeit: 24 Stunden (analog zum Preis-Cache)
- Pro Haushaltsbuch werden nur die benötigten Währungspaare gecacht
- Bei Währungsänderung in den Einstellungen: FX-Cache für das Haushaltsbuch invalidieren

# **5\. Datenmodell - Erweiterungen**

Folgende Felder sollen zu jedem Asset im Portfolio hinzugefügt oder ergänzt werden:

| **Feld** | **Typ** | **Beschreibung** |
| --- | --- | --- |
| currentPrice | number | Aktueller Preis in der Basiswährung des Haushaltsbuchs |
| originalPrice | number | Preis in der Originalwährung des Providers |
| originalCurrency | string | Originalwährung (z. B. 'USD', 'EUR') |
| fxRate | number | Verwendeter FX-Kurs für die Umrechnung |
| priceSource | string | Welcher Provider lieferte den Preis |
| lastUpdated | ISO-Date-String | Zeitstempel der letzten Aktualisierung |
| marketSymbol | string | Symbol für API-Abfragen (z. B. 'bitcoin', 'AAPL') |
| assetType | enum | 'crypto' \| 'stock' \| 'etf' \| 'metal' |
| priceError | string \| null | Fehlermeldung, falls Preis nicht abrufbar |

# **6\. Beispiel-API-Responses (zur Orientierung)**

## **CoinGecko - Bitcoin direkt in CHF**

CoinGecko unterstützt CHF direkt als Zielwährung - kein Umweg über USD nötig:

GET <https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=chf>

Response: { "bitcoin": { "chf": 56820.44 } }

## **Yahoo Finance - Apple-Aktie (USD) + FX-Umrechnung nach CHF**

GET <https://query1.finance.yahoo.com/v8/finance/chart/AAPL>

Response: regularMarketPrice = 189.30 USD

GET <https://api.frankfurter.app/latest?from=USD&to=CHF>

Response: rates.CHF = 0.9123 → 189.30 \* 0.9123 = 172.60 CHF

## **Frankfurter App - Gold in CHF**

GET <https://api.frankfurter.app/latest?from=XAU&to=CHF>

Response: { "rates": { "CHF": 1701.20 } }

# **7\. Qualitätskriterien & Akzeptanzkriterien**

Der Implementierungsplan gilt als vollständig, wenn folgende Kriterien erfüllt sind:

**Checkliste für den Agenten**

✅ Alle 4 Asset-Klassen werden korrekt abgerufen

✅ Kein API-Key / Account für irgendeinen Endpunkt erforderlich

✅ Caching verhindert redundante API-Calls (Preise & FX-Kurse, je 24h)

✅ Fallback-Mechanismus ist implementiert (mind. bei Krypto)

✅ Fehler führen nicht zu einem Programmabsturz

✅ Täglicher Auto-Update läuft ohne manuelle Interaktion

✅ Letzter Update-Zeitstempel ist im Portfolio sichtbar

✅ Basiswährung ist pro Haushaltsbuch individuell konfigurierbar

✅ Standardwährung für neue Haushaltsbücher ist CHF

✅ Alle Preise werden korrekt in die gewählte Basiswährung umgerechnet

✅ Originalpreis und FX-Kurs bleiben als Metadaten gespeichert

✅ Währungsänderung in Einstellungen aktualisiert alle Portfoliopreise sofort

✅ Vorhandene Portfolio-Datenstruktur bleibt kompatibel (keine Breaking Changes)

✅ Code enthält Inline-Kommentare für alle API-Endpunkte

✅ README / Dokumentation wird mit Installationsanleitung ergänzt

# **8\. Zusätzliche Hinweise für den Agenten**

- Bestehenden Code zunächst vollständig lesen, bevor Änderungen vorgenommen werden
- Keine bestehenden Features oder Datenstrukturen ohne Rückfrage ändern
- Standardwährung für alle neuen Haushaltsbücher: CHF
- CoinGecko unterstützt CHF direkt - den vs_currencies-Parameter dynamisch aus der Haushaltsbuch-Einstellung befüllen
- Yahoo Finance liefert immer USD - FX-Umrechnung ist hier immer erforderlich
- Test-Modus vorsehen: Manuelle Preis-Override-Funktion für Debugging
- Bei Unklarheiten zum Datenmodell: Rückfrage stellen, nicht annehmen

**Wichtiger Hinweis zu Yahoo Finance**

Da Yahoo Finance eine inoffizielle API ist, muss der Agent besonders robuste

Fehlerbehandlung implementieren. Der Endpunkt kann sich jederzeit ändern.

Ein Mechanismus zum einfachen Austausch des Aktien/ETF-Providers ist empfehlenswert.