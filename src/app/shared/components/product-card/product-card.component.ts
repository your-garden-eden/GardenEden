// src/app/shared/components/product-card/product-card.component.ts
import { Component, Input, ChangeDetectionStrategy, inject, computed, Signal, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
import { WishlistService } from '../../services/wishlist.service';
import { AuthService } from '../../services/auth.service';
import { UiStateService } from '../../services/ui-state.service';
import { CartService } from '../../services/cart.service';
import { LoadingSpinnerComponent } from '../loading-spinner/loading-spinner.component';
import { TrackingService } from '../../../core/services/tracking.service';
import { WooCommerceProduct } from '../../../core/services/woocommerce.service';
// --- HINZUGEFÜGT: Imports für BreakpointObserver ---
import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs/operators';

type ProductEffectiveStatus = 'available' | 'on_backorder' | 'out_of_stock' | 'price_unavailable';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoModule, LoadingSpinnerComponent],
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
  private cartService = inject(CartService);
  private transloco = inject(TranslocoService);
  private trackingService = inject(TrackingService);
  // --- HINZUGEFÜGT: BreakpointObserver injizieren ---
  private breakpointObserver = inject(BreakpointObserver);

  // --- State Signals ---
  public isLoggedIn: Signal<boolean> = toSignal(this.authService.isLoggedIn$, { initialValue: false });
  public isAddingToCart = signal(false);
  public isImageLoading = signal(true);

  // --- HINZUGEFÜGT: Signal zur Erkennung der mobilen Ansicht ---
  public isMobile: Signal<boolean> = toSignal(
    this.breakpointObserver.observe('(max-width: 767.98px)').pipe(
      map(result => result.matches)
    ),
    { initialValue: false }
  );

  public isInWishlist: Signal<boolean> = computed(() => {
    return this.wishlistService.wishlistProductIds().has(`${this.productId}_0`);
  });
  
  public effectiveStatus: Signal<ProductEffectiveStatus> = computed(() => {
    if (this.stockStatus === 'outofstock') {
      return 'out_of_stock';
    }
    if (this.displayPrice() === '') {
      return 'price_unavailable';
    }
    if (this.stockStatus === 'onbackorder') {
      return 'on_backorder';
    }
    return 'available';
  });

  constructor() {}

  // --- Public Methods ---
  public toggleWishlist(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.isLoggedIn()) {
      this.uiStateService.openLoginOverlay();
      return;
    }

    if (this.isInWishlist()) {
      this.wishlistService.removeFromWishlist(this.productId, 0);
    } else {
      this.wishlistService.addToWishlist(this.productId, 0);
    }
  }

  public addToCart(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    
    const status = this.effectiveStatus();
    if (this.isVariable || !['available', 'on_backorder'].includes(status) || this.isAddingToCart()) {
      return;
    }
    
    const productForTracking: Pick<WooCommerceProduct, 'id' | 'name' | 'price' | 'categories'> = {
      id: this.productId,
      name: this.productName,
      price: this.singlePrice || '0',
      categories: []
    };
    this.trackingService.trackAddToCart(productForTracking as WooCommerceProduct, 1);

    this.isAddingToCart.set(true);

    this.cartService.addItem(this.productId, 1)
      .then(() => {
        this.uiStateService.showGlobalSuccess(
          this.transloco.translate('productCard.addedToCart', { productName: this.productName })
        );
      })
      .catch((err: any) => {
        console.error("Fehler beim Hinzufügen zum Warenkorb von der Produktkarte:", err);
        this.uiStateService.showGlobalError(
          this.transloco.translate('productCard.errorAddingToCart')
        );
      })
      .finally(() => {
        this.isAddingToCart.set(false);
      });
  }

  public onImageLoad(): void {
    this.isImageLoading.set(false);
  }

  public onImageError(): void {
    this.isImageLoading.set(false);
  }

  // --- Getters ---
  public displayPrice: Signal<string> = computed(() => {
    if (this.isVariable && this.priceRange) {
      const min = parseFloat(this.priceRange.min);
      const max = parseFloat(this.priceRange.max);
      const symbol = this.currencySymbol || '';

      if (isNaN(min) || isNaN(max)) {
        return this.priceHtml || '';
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
  });
}