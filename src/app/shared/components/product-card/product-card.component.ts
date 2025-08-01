// src/app/shared/components/product-card/product-card.component.ts (FINALE, KORRIGIERTE VERSION)
import { Component, Input, ChangeDetectionStrategy, inject, computed, Signal, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
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
import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs/operators';
import { SeoService } from '../../../core/services/seo.service';

type ProductEffectiveStatus = 'available' | 'on_backorder' | 'out_of_stock' | 'price_unavailable';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoModule, LoadingSpinnerComponent, DecimalPipe],
  templateUrl: './product-card.component.html',
  styleUrls: ['./product-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductCardComponent {
  // --- Inputs ---
  @Input({ required: true }) productId!: number;
  @Input({ required: true }) productName!: string;
  @Input() categoryName?: string;
  @Input() priceHtml?: string;
  @Input() singlePrice?: string;
  @Input() currencySymbol?: string = '€';
  @Input() imageUrl?: string;
  @Input({ required: true }) productLink!: string;
  @Input() onSale?: boolean = false;
  @Input() regularPrice?: string;
  @Input() isLazy: boolean = false;
  @Input() stockStatus?: 'instock' | 'outofstock' | 'onbackorder' = 'instock';
  @Input() isVariable?: boolean = false;

  // --- Service Injections ---
  private wishlistService = inject(WishlistService);
  private authService = inject(AuthService);
  private uiStateService = inject(UiStateService);
  private cartService = inject(CartService);
  private transloco = inject(TranslocoService);
  private trackingService = inject(TrackingService);
  private breakpointObserver = inject(BreakpointObserver);
  private seoService = inject(SeoService);

  // --- State Signals ---
  public isLoggedIn: Signal<boolean> = toSignal(this.authService.isLoggedIn$, { initialValue: false });
  public isAddingToCart = signal(false);
  public isImageLoading = signal(true);
  public imageAltText: Signal<string> = computed(() => this.seoService.generateImageAltText(this.productName, this.categoryName));
  
  public isMobile: Signal<boolean> = toSignal(
    this.breakpointObserver.observe('(max-width: 767.98px)').pipe(map(result => result.matches)), 
    { initialValue: true }
  );
  
  public isInWishlist: Signal<boolean> = computed(() => this.wishlistService.wishlistProductIds().has(`${this.productId}_0`));

  // --- NEU: Interne Preisspannen-Berechnung ---
  private priceRange: Signal<{ min: string, max: string } | null> = computed(() => {
    if (this.isVariable && this.priceHtml) {
      // Verbesserte Regex, die HTML-Tags und Währungssymbole ignoriert.
      const priceMatches = this.priceHtml.match(/[\d.,]+/g);
      if (priceMatches && priceMatches.length > 0) {
        const prices = priceMatches.map(p => parseFloat(p.replace(',', '.')));
        const min = Math.min(...prices).toString();
        const max = Math.max(...prices).toString();
        return { min, max };
      }
    }
    return null;
  });
  
  // Korrigierte Verfügbarkeitslogik, die die interne Preisspanne nutzt
  public effectiveStatus: Signal<ProductEffectiveStatus> = computed(() => {
    const status = this.stockStatus || 'instock';
    if (status === 'outofstock') {
      return 'out_of_stock';
    }
    if (status === 'onbackorder') {
      return 'on_backorder';
    }
    // Verwendet jetzt das interne `priceRange()`-Signal
    const hasPrice = (this.isVariable && !!this.priceRange()) || (!this.isVariable && !!this.singlePrice);
    if (!hasPrice) {
        return 'price_unavailable';
    }
    return 'available';
  });

  // Optimierte Preis-Logik
  public displayPrice: Signal<string> = computed(() => {
    const symbol = this.currencySymbol || '€';
    const numberFormat = '1.2-2';
    const decimalPipe = new DecimalPipe('de-DE');
    const formatPrice = (price: string | number) => {
        const numericPrice = typeof price === 'string' ? parseFloat(price) : price;
        if (isNaN(numericPrice)) return '';
        return decimalPipe.transform(numericPrice, numberFormat);
    };

    if (this.isVariable) {
      const range = this.priceRange(); // Nutzt das interne Signal
      if (range?.min) {
        const min = parseFloat(range.min);
        if (isNaN(min)) return '';
        const formattedMin = formatPrice(min);
        return `${this.transloco.translate('productCard.priceFrom')} ${formattedMin}${symbol}`;
      }
      return '';
    }

    if (this.singlePrice) {
      const formattedPrice = formatPrice(this.singlePrice);
      if (formattedPrice) {
        return `${formattedPrice}${symbol}`;
      }
    }
    return '';
  });

  constructor() {}

  // --- Public Methods (unverändert) ---
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
      categories: this.categoryName ? [{ id: 0, name: this.categoryName, slug: '' }] : [] 
    }; 
    this.trackingService.trackAddToCart(productForTracking as WooCommerceProduct, 1); 
    this.isAddingToCart.set(true); 
    this.cartService.addItem(this.productId, 1)
      .then(() => { 
        this.uiStateService.showGlobalSuccess(this.transloco.translate('productCard.addedToCart', { productName: this.productName })); 
      })
      .catch((err: any) => { 
        console.error("Fehler beim Hinzufügen zum Warenkorb von der Produktkarte:", err); 
        this.uiStateService.showGlobalError(this.transloco.translate('productCard.errorAddingToCart')); 
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
}