// /src/app/shared/pipes/format-price.pipe.ts

import { Pipe, PipeTransform, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';

@Pipe({
  name: 'formatPrice',
  standalone: true // Wichtig: Ist als Standalone markiert
})
export class FormatPricePipe implements PipeTransform {
  // Injiziert den eingebauten CurrencyPipe
  private currencyPipe = inject(CurrencyPipe);

  transform(value: string | number | undefined | null, currencyCode: string = 'EUR', display: string = 'symbol', digitsInfo: string = '1.2-2', locale: string = 'de-DE'): string | null {
    // Eingabewert prüfen
    if (value === null || value === undefined || value === '') {
      return 'N/A'; // Oder einen anderen Platzhalter zurückgeben
    }

    // Sicherstellen, dass der Wert eine Zahl ist
    const numericValue = typeof value === 'string' ? parseFloat(value) : value;

    // Prüfen, ob die Konvertierung erfolgreich war
    if (isNaN(numericValue)) {
        console.warn(`FormatPricePipe: Ungültiger Wert "${value}" konnte nicht in eine Zahl umgewandelt werden.`);
        return 'Ungültig'; // Oder einen Fehlerplatzhalter zurückgeben
    }

    // Versuche, den eingebauten CurrencyPipe zu verwenden
    try {
       return this.currencyPipe.transform(numericValue, currencyCode, display, digitsInfo, locale);
    } catch (error) {
       console.error(`Fehler im CurrencyPipe innerhalb von FormatPricePipe:`, error);
       return 'Fehler'; // Oder einen Fehlerplatzhalter zurückgeben
    }
  }
}