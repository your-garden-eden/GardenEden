// /src/app/shared/components/product-card/product-card.component.ts
import { Component, Input, ChangeDetectionStrategy, inject, signal, WritableSignal } from '@angular/core'; // inject, signal, WritableSignal hinzugefügt
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Product } from '../../../core/services/shopify.service'; // Pfad prüfen!
import { CartService } from '../../services/cart.service'; // CartService importieren

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductCardComponent {
  // --- Services & Inputs ---
  private cartService = inject(CartService); // CartService injizieren
  @Input({ required: true }) product!: Product;

  // --- Signale für UI-Zustand ---
  isAdding: WritableSignal<boolean> = signal(false);
  // Optional: Signal für Fehlermeldung beim Hinzufügen
  // addToCartError: WritableSignal<string | null> = signal(null);

  // --- Getter für Template ---
  get imageUrl(): string | undefined {
    return this.product.images?.edges?.[0]?.node?.url;
  }

  get imageAlt(): string {
    return this.product.images?.edges?.[0]?.node?.altText ?? this.product.title;
  }

  get productPrice(): string {
    const price = this.product.priceRange.minVariantPrice;
    if (price?.amount) {
        const amountAsNumber = parseFloat(price.amount);
        if (!isNaN(amountAsNumber)) {
             const formattedAmount = amountAsNumber.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
             // Zeigt "ab" nur an, wenn es wirklich unterschiedliche Preise geben KÖNNTE
             const prefix = this.product.variants?.edges?.length > 1 ? 'ab ' : '';
             return `${prefix}${formattedAmount} ${price.currencyCode}`;
        }
    }
    return 'Preis auf Anfrage';
  }

   get productLink(): string {
    return `/product/${this.product.handle}`;
   }

   // --- NEU: Getter für die ID der ersten verfügbaren Variante ---
   get firstAvailableVariantId(): string | null {
      // Finde die erste Variante, die zum Verkauf verfügbar ist
      const availableVariant = this.product.variants?.edges?.find(edge => edge.node.availableForSale);
      return availableVariant?.node?.id ?? null; // Gib ID zurück oder null
   }
   // --- ENDE NEU ---

   // --- NEU: Methode zum Hinzufügen zum Warenkorb ---
   async addToCart(event: Event): Promise<void> {
      event.preventDefault(); // Verhindert Navigation durch das umfassende <a> Tag
      event.stopPropagation(); // Verhindert weitere Klick-Events

      const variantId = this.firstAvailableVariantId; // ID holen
      if (!variantId) {
        console.warn('Keine verfügbare Variante zum Hinzufügen gefunden für:', this.product.title);
        // Optional: Fehlermeldung anzeigen
        // this.addToCartError.set('Produktvariante nicht verfügbar.');
        return;
      }

      this.isAdding.set(true);
      // this.addToCartError.set(null); // Fehler zurücksetzen

      console.log(`Adding variant ${variantId} to cart...`);
      try {
        await this.cartService.addLine(variantId, 1); // Menge 1 hinzufügen
        console.log(`Variant ${variantId} added successfully.`);
        // Optional: Erfolgsfeedback geben (z.B. kurzer Checkmark-Icon-Wechsel)
      } catch (error) {
        console.error(`Error adding variant ${variantId} to cart:`, error);
        // Optional: Fehlermeldung anzeigen
        // this.addToCartError.set('Fehler beim Hinzufügen.');
      } finally {
        this.isAdding.set(false);
      }
   }
   // --- ENDE NEU ---
}