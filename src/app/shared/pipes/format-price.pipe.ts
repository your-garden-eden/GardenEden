// /src/app/shared/pipes/format-price.pipe.ts
import { Pipe, PipeTransform, inject, LOCALE_ID } from '@angular/core';
import { formatCurrency, getCurrencySymbol, CurrencyPipe } from '@angular/common'; // CurrencyPipe für Fallback oder direktere Nutzung

@Pipe({
  name: 'formatPrice',
  standalone: true
})
export class FormatPricePipe implements PipeTransform {
  private locale: string = inject(LOCALE_ID);
  private currencyPipe = inject(CurrencyPipe); // Injizieren für konsistente Formatierung

  transform(
    value: string | number | null | undefined, // Wert kann jetzt eine bereits umgerechnete Zahl sein
    currencyCode: string = 'EUR',
    display: 'code' | 'symbol' | 'symbol-narrow' | string | boolean = 'symbol',
    digitsInfo: string = '1.2-2', // Standard: 1 Vorkommastelle, 2-2 Nachkommastellen
    locale?: string
  ): string | null {
    if (value === null || value === undefined || value === '') {
      // Optional: Einen Standardwert wie '0,00 €' oder einen spezifischen Platzhalter zurückgeben
      // console.warn('FormatPricePipe: Received null or empty value.');
      return null; // Oder z.B. '---'
    }

    let numericValue: number;

    if (typeof value === 'string') {
      numericValue = parseFloat(value);
      if (isNaN(numericValue)) {
        console.warn(`FormatPricePipe: Konnte String "${value}" nicht in eine gültige Zahl umwandeln.`);
        return value; // Ursprünglichen String zurückgeben oder einen Fehlerplatzhalter
      }
    } else {
      numericValue = value;
    }

    // Die Division durch 100 findet jetzt im CartService statt, bevor die Daten hier ankommen.
    // numericValue sollte hier bereits der korrekte Betrag sein (z.B. 76.99).

    try {
      // Verwendung des injizierten CurrencyPipe für eine konsistente Formatierung
      // gemäß der Angular-Standardimplementierung.
      return this.currencyPipe.transform(numericValue, currencyCode, display, digitsInfo, locale || this.locale);
    } catch (error) {
      console.error(`FormatPricePipe: Fehler bei der Formatierung des Preises "${numericValue}" mit CurrencyPipe:`, error);
      // Fallback-Formatierung, falls CurrencyPipe fehlschlägt
      const currentLocale = locale || this.locale;
      const symbol = getCurrencySymbol(currencyCode, 'wide', currentLocale);
      try {
        // Versuch mit formatCurrency als detaillierterem Fallback
        return formatCurrency(numericValue, currentLocale, symbol, currencyCode, digitsInfo);
      } catch (e) {
        console.error(`FormatPricePipe: Fehler auch bei formatCurrency für Preis "${numericValue}":`, e);
        // Absolute Notfall-Fallback-Formatierung
        const parts = digitsInfo.match(/(\d+)\.(\d+)-(\d+)/);
        let minFractionDigits = 2;
        if (parts && parts[2]) {
          minFractionDigits = parseInt(parts[2], 10);
        }
        return `${numericValue.toFixed(minFractionDigits)} ${symbol}`;
      }
    }
  }
}