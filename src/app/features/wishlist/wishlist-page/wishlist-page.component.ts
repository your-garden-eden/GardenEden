// src/app/features/wishlist/wishlist-page/wishlist-page.component.ts
import {
  Component,
  inject,
  signal,
  WritableSignal,
  Signal,
  computed,
  effect,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  OnDestroy,
  untracked,
} from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WishlistService } from '../../../shared/services/wishlist.service';
import {
  WoocommerceService,
  WooCommerceProduct,
  // WooCommerceProductVariation, // Importieren, wenn wir Varianten spezifisch behandeln
} from '../../../core/services/woocommerce.service';
import { CartService } from '../../../shared/services/cart.service';
import { FormatPricePipe } from '../../../shared/pipes/format-price.pipe';
import { SafeHtmlPipe } from '../../../shared/pipes/safe-html.pipe';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription, forkJoin, of, firstValueFrom } from 'rxjs'; // firstValueFrom importiert
import { startWith, switchMap, tap, map, catchError } from 'rxjs/operators';

@Component({
  selector: 'app-wishlist-page',
  standalone: true,
  imports: [ CommonModule, RouterLink, FormatPricePipe, CurrencyPipe, TranslocoModule, SafeHtmlPipe ],
  templateUrl: './wishlist-page.component.html',
  styleUrls: ['./wishlist-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
})
export class WishlistPageComponent implements OnInit, OnDestroy {
  private wishlistService = inject(WishlistService);
  private woocommerceService = inject(WoocommerceService);
  private cartService = inject(CartService);
  private cdr = inject(ChangeDetectorRef);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);

  isLoadingWishlistHandles = this.wishlistService.isLoading;
  wishlistServiceError = this.wishlistService.error;
  wishlistProductSlugs = this.wishlistService.wishlistProductSlugs$; // Korrekter Name aus WishlistService

  isLoadingProducts: WritableSignal<boolean> = signal(false);
  productsError: WritableSignal<string | null> = signal(null);
  private productsErrorKey: WritableSignal<string | null> = signal(null);
  wishlistProducts: WritableSignal<WooCommerceProduct[]> = signal([]);

  private subscriptions = new Subscription();

  totalPrice = computed(() => {
    let total = 0;
    for (const product of this.wishlistProducts()) {
      if (product.price) {
        total += parseFloat(product.price);
      }
    }
    return total;
  });

  isEmptyWishlist = computed(() => this.wishlistProductSlugs().length === 0);

  readonly isAddAllDisabled: Signal<boolean> = computed(() => {
    const loadingProd = this.isLoadingProducts();
    const loadingWish = this.isLoadingWishlistHandles();
    const emptyWish = this.isEmptyWishlist();
    const noProducts = this.wishlistProducts().length === 0;
    const allUnavailable = this.wishlistProducts().every(p => p.stock_status !== 'instock' || !p.purchasable);
    return loadingProd || loadingWish || emptyWish || noProducts || allUnavailable;
  });

  constructor() {
    effect(() => {
      const slugs = this.wishlistProductSlugs();
      if (untracked(this.isLoadingProducts)) {
        return;
      }
      if (slugs.length > 0) {
        this.loadProductsBySlugs(slugs);
      } else {
        if (untracked(this.wishlistProducts).length > 0) { this.wishlistProducts.set([]); }
        if (untracked(this.productsError)) {
          this.productsError.set(null);
          this.productsErrorKey.set(null);
        }
      }
      this.cdr.markForCheck();
    });
  }

  ngOnInit(): void {
    this.wishlistService.error.set(null);

    const langChangeSub = this.translocoService.langChanges$.pipe(
      startWith(this.translocoService.getActiveLang()),
      switchMap(lang => this.translocoService.selectTranslate('wishlistPage.title', {}, lang)),
      tap(translatedPageTitle => {
        this.titleService.setTitle(translatedPageTitle);
        if (this.productsErrorKey()) {
          const currentProductForError = this.wishlistProducts().find(p =>
            this.productsErrorKey() === 'wishlistPage.error.productNotAvailable' ||
            this.productsErrorKey() === 'wishlistPage.error.movingToCartError'
          );
          const params = currentProductForError ? { productName: currentProductForError.name } : {};
          this.productsError.set(this.translocoService.translate(this.productsErrorKey()!, params));
        }
      })
    ).subscribe(() => {
      this.cdr.detectChanges();
    });
    this.subscriptions.add(langChangeSub);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private async loadProductsBySlugs(slugs: string[]): Promise<void> {
    if (this.isLoadingProducts() || slugs.length === 0) return;

    this.isLoadingProducts.set(true);
    this.productsError.set(null);
    this.productsErrorKey.set(null);
    try {
      const productObservables = slugs.map(slug =>
        this.woocommerceService.getProductBySlug(slug).pipe(
          catchError(err => {
            console.error(`WishlistPage: Error fetching product by slug ${slug}:`, err);
            return of(undefined);
          })
        )
      );

      const productsOrUndefined = await firstValueFrom(forkJoin(productObservables));
      const products = productsOrUndefined.filter(p => p !== undefined) as WooCommerceProduct[];

      const sortedProducts = slugs
        .map(slug => products.find(p => p.slug === slug))
        .filter(p => p !== undefined) as WooCommerceProduct[];

      this.wishlistProducts.set(sortedProducts);

      if (sortedProducts.length !== slugs.length) {
        console.warn("WishlistPage: Some wishlist products could not be loaded via slug.");
      }
    } catch (error) {
      console.error("WishlistPage: General error in loadProductsBySlugs:", error);
      this.productsErrorKey.set('wishlistPage.error.loadingProducts');
      this.productsError.set(this.translocoService.translate(this.productsErrorKey()!));
      this.wishlistProducts.set([]);
    } finally {
        this.isLoadingProducts.set(false);
        this.cdr.markForCheck();
    }
  }

  async removeFromWishlist(productSlug: string): Promise<void> {
    this.productsError.set(null);
    this.productsErrorKey.set(null);
    await this.wishlistService.removeFromWishlist(productSlug);
  }

  async moveFromWishlistToCart(product: WooCommerceProduct): Promise<void> {
    this.productsError.set(null);
    this.productsErrorKey.set(null);

    if (product.stock_status !== 'instock' || !product.purchasable) {
      this.productsErrorKey.set('wishlistPage.error.productNotAvailable');
      this.productsError.set(this.translocoService.translate(this.productsErrorKey()!, { productName: product.name }));
      return;
    }

    let productIdToAdd = product.id;
    let variationIdToAdd: number | undefined = undefined;

    if (product.type === 'variable') {
      console.warn(`Versuch, variables Produkt '${product.name}' ohne spezifische Variante von Wunschliste in Warenkorb zu legen.`);
    }

    try {
      await this.cartService.addItem(productIdToAdd, 1, variationIdToAdd);
      await this.wishlistService.removeFromWishlist(product.slug);
    } catch (error: any) {
      this.productsErrorKey.set('wishlistPage.error.movingToCartError');
      this.productsError.set(this.translocoService.translate(this.productsErrorKey()!, { productName: product.name }));
    }
  }

  async addAllToCart(): Promise<void> {
    this.productsError.set(null);
    this.productsErrorKey.set(null);

    const productsToAdd = this.wishlistProducts().filter(p => p.stock_status === 'instock' && p.purchasable);
    if (productsToAdd.length === 0) {
      this.productsErrorKey.set('wishlistPage.error.noneAvailableToAdd');
      this.productsError.set(this.translocoService.translate(this.productsErrorKey()!));
      return;
    }

    console.warn("addAllToCart: Batch-Hinzufügen ist noch nicht optimal implementiert. Füge nur das erste verfügbare Produkt hinzu.");
    if (productsToAdd.length > 0) {
      await this.moveFromWishlistToCart(productsToAdd[0]);
    }
  }

  getProductLink(product: WooCommerceProduct): string {
    return `/product/${product.slug}`;
  }

  getProductImage(product: WooCommerceProduct): string | undefined {
    return product.images && product.images.length > 0 ? product.images[0].src : undefined;
  }

  // Hinzugefügte Hilfsmethoden für das Template (aus ProductPageComponent übernommen und angepasst)
  getProductCurrencyCode(product: WooCommerceProduct | null): string {
    if (!product) return 'EUR';
    // Versuche aus price_html (vereinfacht) oder Standard
    if (product.price_html && product.price_html.includes('€')) return 'EUR';
    if (product.price_html && product.price_html.includes('$')) return 'USD';
    return 'EUR';
  }

  getGlobalCurrencyCode(): string {
    // Dies sollte die globale Shop-Währung zurückgeben
    // Für jetzt ein Fallback
    return 'EUR';
  }
}