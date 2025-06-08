import { Component, Input, ChangeDetectionStrategy, inject, computed, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { toSignal } from '@angular/core/rxjs-interop'; // WICHTIG: Neuer Import
import { WishlistService } from '../../services/wishlist.service';
import { AuthService } from '../../services/auth.service';
import { UiStateService } from '../../services/ui-state.service';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoModule],
  templateUrl: './product-card.component.html',
  styleUrls: ['./product-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductCardComponent {
  // --- Inputs ---
  @Input({ required: true }) productId!: number;
  @Input({ required: true }) productName!: string;
  
  @Input() priceHtml?: string;
  @Input() singlePrice?: string;
  @Input() currencySymbol?: string = '€';
  @Input() pricePrefix?: string;

  @Input() imageUrl?: string;
  @Input({ required: true }) productLink!: string;
  @Input() onSale?: boolean = false;
  @Input() regularPrice?: string;
  
  @Input() isLazy: boolean = false;
  @Input() stockStatus?: 'instock' | 'outofstock' | 'onbackorder' = 'instock';
  
  @Input() isVariable?: boolean = false;
  @Input() priceRange?: { min: string, max: string } | null = null;

  // --- Service Injections ---
  private wishlistService = inject(WishlistService);
  private authService = inject(AuthService);
  private uiStateService = inject(UiStateService);

  // --- State Signals ---
  // KORRIGIERT: Observable 'isLoggedIn$' mit toSignal in ein Signal umwandeln
  public isLoggedIn: Signal<boolean> = toSignal(this.authService.isLoggedIn$, { initialValue: false });
  
  public isInWishlist: Signal<boolean> = computed(() => {
    // Auf der Produktkarte prüfen wir die Wunschliste immer für das Hauptprodukt (Variation ID = 0)
    return this.wishlistService.wishlistProductIds().has(`${this.productId}_0`);
  });

  constructor() {}

  // --- Public Methods ---
  public toggleWishlist(event: MouseEvent): void {
    event.preventDefault();  // Verhindert die Navigation zum Produkt, wenn auf das Icon geklickt wird
    event.stopPropagation(); // Stoppt das Event-Bubbling, falls das Icon in einem Link ist

    if (!this.isLoggedIn()) {
      this.uiStateService.openLoginOverlay();
      return;
    }

    // Da wir auf der Produktkarte sind, fügen wir immer das Hauptprodukt hinzu/entfernen es.
    // Die VariationId ist hier '0' bzw. nicht vorhanden.
    if (this.isInWishlist()) {
      this.wishlistService.removeFromWishlist(this.productId, 0);
    } else {
      this.wishlistService.addToWishlist(this.productId, 0);
    }
  }

  // --- Getters ---
  get displayPrice(): string {
    if (this.isVariable && this.priceRange) {
      const min = parseFloat(this.priceRange.min);
      const max = parseFloat(this.priceRange.max);
      const symbol = this.currencySymbol || '';

      if (isNaN(min) || isNaN(max)) {
        return this.priceHtml || `${this.pricePrefix || ''}${this.singlePrice || ''}${symbol}`;
      }

      if (min === max) {
        return `${this.pricePrefix || ''}${min.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${symbol}`;
      }
      return `${this.pricePrefix || ''}${min.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${symbol} - ${max.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${symbol}`;
    }
    if (this.priceHtml) {
        return this.priceHtml;
    }
    if (this.singlePrice) {
      const single = parseFloat(this.singlePrice);
      if (!isNaN(single)) {
        return `${this.pricePrefix || ''}${single.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${this.currencySymbol || ''}`;
      }
    }
    return '';
  }
}