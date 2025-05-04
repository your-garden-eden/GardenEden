import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common'; // Import für *ngIf, Pipe etc.
import { RouterLink } from '@angular/router'; // Import für Links
// Passe den Pfad zum Product Interface an!
import { Product } from '../../../core/services/shopify.service'; // Oder wo auch immer es liegt

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, RouterLink], // CommonModule & RouterLink importieren
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush // Optimierung, da sich Inputs selten ändern
})
export class ProductCardComponent {
  // Input Property, um die Produktdaten zu empfangen
  // required: true stellt sicher, dass immer ein Produkt übergeben wird.
  @Input({ required: true }) product!: Product;

  // Optional: Getter für leichteren Zugriff im Template
  get imageUrl(): string | undefined {
    // Gib die URL des ersten Bildes zurück, falls vorhanden
    return this.product.images?.edges?.[0]?.node?.url;
  }

  get imageAlt(): string {
    // Gib den Alt-Text des ersten Bildes zurück oder den Produkttitel als Fallback
    return this.product.images?.edges?.[0]?.node?.altText ?? this.product.title;
  }

  get productPrice(): string {
    // Formatiere den Preis (Beispiel: "ab 123.45 EUR")
    const price = this.product.priceRange.minVariantPrice;
    // Prüfung, ob price und price.amount existieren
    if (price && price.amount) {
        // Konvertiere den Betrag zu einer Zahl, formatiere ihn und füge Währungscode hinzu
        const amountAsNumber = parseFloat(price.amount);
        // Prüfen ob Konvertierung erfolgreich war (ist eine Zahl?)
        if (!isNaN(amountAsNumber)) {
             // Formatierung für deutsche Lokalisierung (Komma als Dezimaltrennzeichen)
             const formattedAmount = amountAsNumber.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
             return `ab ${formattedAmount} ${price.currencyCode}`;
        }
    }
    // Fallback, wenn Preisinformationen fehlen
    return 'Preis auf Anfrage';
  }

   get productLink(): string {
    // Erstellt den Link zur Produktdetailseite
    return `/product/${this.product.handle}`;
   }

}