// /src/app/shared/components/product-card/product-card.component.ts
import { Component, Input, ChangeDetectionStrategy } from '@angular/core'; // inject, signal, WritableSignal entfernt
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Product } from '../../../core/services/shopify.service';
// CartService Import entfernt

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './product-card.component.html',
  styleUrls: ['./product-card.component.scss'], // Korrigiert zu styleUrls
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductCardComponent {
  // --- Inputs ---
  @Input({ required: true }) product!: Product;

  // --- Signale ENTFERNT ---
  // isAdding: WritableSignal<boolean> = signal(false);

  // --- Services ENTFERNT ---
  // private cartService = inject(CartService);

  // --- Getter für Template ---
  get imageUrl(): string | undefined {
    // Optional Chaining hier sicherheitshalber beibehalten
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
             const prefix = this.product.variants?.edges?.length > 1 ? 'ab ' : '';
             return `${prefix}${formattedAmount} ${price.currencyCode}`;
        }
    }
    return 'Preis auf Anfrage';
  }

   get productLink(): string {
    return `/product/${this.product.handle}`;
   }

   // --- Methoden und Getter für Warenkorb/Variante ENTFERNT ---
   // get firstAvailableVariantId(): string | null { ... }
   // async addToCart(event: Event): Promise<void> { ... }

}