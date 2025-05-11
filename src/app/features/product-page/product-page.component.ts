// /src/app/features/product-page/product-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, computed, Signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, CurrencyPipe, Location } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Observable, of, from, Subscription } from 'rxjs';
import { switchMap, tap, catchError, map, filter } from 'rxjs/operators';

import { ShopifyService, Product, ShopifyImage } from '../../core/services/shopify.service';
import { CartService } from '../../shared/services/cart.service';
import { WishlistService } from '../../shared/services/wishlist.service';
import { AuthService } from '../../shared/services/auth.service';
// Pipes importieren
import { ImageTransformPipe } from '../../shared/pipes/image-transform.pipe';
import { FormatPricePipe } from '../../shared/pipes/format-price.pipe';
import { SafeHtmlPipe } from '../../shared/pipes/safe-html.pipe';

// Transloco
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';

@Component({
  selector: 'app-product-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ImageTransformPipe,
    FormatPricePipe,
    SafeHtmlPipe,
    TranslocoModule // TranslocoModule hinzugefügt
  ],
  templateUrl: './product-page.component.html',
  styleUrls: ['./product-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe]
})
export class ProductPageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private shopifyService = inject(ShopifyService);
  private titleService = inject(Title);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private location = inject(Location);
  private cartService = inject(CartService);
  private wishlistService = inject(WishlistService);
  private authService = inject(AuthService);
  private translocoService = inject(TranslocoService); // TranslocoService injiziert

  product: WritableSignal<Product | null> = signal(null);
  isLoading: WritableSignal<boolean> = signal(true);
  error: WritableSignal<string | null> = signal(null);
  selectedImage: WritableSignal<ShopifyImage | null | undefined> = signal(null);
  isAddingToCart: WritableSignal<boolean> = signal(false);
  addToCartError: WritableSignal<string | null> = signal(null);

  readonly isOnWishlist: Signal<boolean> = computed(() => {
      const handle = this.product()?.handle;
      return handle ? this.wishlistService.isOnWishlist(handle) : false;
  });

  isLoggedIn: WritableSignal<boolean> = signal(false);
  private authSubscription: Subscription | null = null;
  private routeSubscription?: Subscription;
  private langChangeSubscription?: Subscription;

  ngOnInit(): void {
    this.authSubscription = this.authService.isLoggedIn().subscribe(loggedIn => {
        this.isLoggedIn.set(loggedIn);
        this.cdr.markForCheck();
    });

    this.routeSubscription?.unsubscribe();
    this.routeSubscription = this.route.paramMap.pipe(
      map(params => params.get('handle')),
      tap(handle => {
         this.isLoading.set(true);
         this.product.set(null);
         this.error.set(null);
         this.selectedImage.set(null);
         this.addToCartError.set(null);
         this.isAddingToCart.set(false);
         console.log(`ProductPage: Loading product with handle: ${handle}`);
       }),
      filter((handle): handle is string => {
            if (!handle) {
                this.error.set(this.translocoService.translate('productPage.errorNoHandle'));
                this.isLoading.set(false);
                this.titleService.setTitle(`${this.translocoService.translate('productPage.errorTitle')} - Your Garden Eden`);
                return false;
            }
            return true;
      }),
      switchMap(handle => from(this.shopifyService.getProductByHandle(handle)).pipe(
          catchError(err => {
             console.error(`Error loading product ${handle}:`, err);
             this.error.set(this.translocoService.translate('productPage.errorLoadingProduct'));
             this.titleService.setTitle(`${this.translocoService.translate('productPage.errorTitle')} - Your Garden Eden`);
             return of(null);
          })
      ))
    ).subscribe((productData: Product | null) => {
        if (productData) {
            this.product.set(productData);
            this.selectedImage.set(productData.images?.edges?.[0]?.node);
            this.titleService.setTitle(`${productData.title} - Your Garden Eden`); // Produktname bleibt dynamisch
            this.error.set(null);
            console.log('Produktdaten geladen:', productData);
        } else if (!this.error()) { // Nur wenn kein Fehler im catchError gesetzt wurde
            this.error.set(this.translocoService.translate('productPage.errorNotFound'));
            this.titleService.setTitle(`${this.translocoService.translate('productPage.notFoundTitle')} - Your Garden Eden`);
        }
        this.isLoading.set(false);
        this.cdr.markForCheck();
    });

    // Auf Sprachänderungen hören, um Fehler ggf. neu zu übersetzen
    this.langChangeSubscription = this.translocoService.langChanges$.subscribe(() => {
      if (this.error()) { // Wenn ein Fehler gesetzt ist, neu übersetzen
        const currentErrorKey = this.getCurrentErrorKey();
        if (currentErrorKey) {
          this.error.set(this.translocoService.translate(currentErrorKey));
        }
        // Auch Seitentitel für Fehlerfälle neu setzen
        if (this.product() === null) { // Nur wenn kein Produkt geladen ist (also Fehlerfall)
            if (this.error() === this.translocoService.translate('productPage.errorNoHandle') ||
                this.error() === this.translocoService.translate('productPage.errorLoadingProduct')) {
                 this.titleService.setTitle(`${this.translocoService.translate('productPage.errorTitle')} - Your Garden Eden`);
            } else if (this.error() === this.translocoService.translate('productPage.errorNotFound')) {
                 this.titleService.setTitle(`${this.translocoService.translate('productPage.notFoundTitle')} - Your Garden Eden`);
            }
        }
      }
      if (this.addToCartError()) {
        const currentAddToCartErrorKey = this.getCurrentAddToCartErrorKey();
        if (currentAddToCartErrorKey) {
            this.addToCartError.set(this.translocoService.translate(currentAddToCartErrorKey));
        }
      }
      this.cdr.markForCheck();
    });
  }

  // Hilfsmethode, um den Key des aktuellen Fehlers zu bekommen (vereinfacht)
  private getCurrentErrorKey(): string | null {
    // Diese Methode müsste man erweitern, wenn man viele verschiedene Fehler-Keys hat
    // Für jetzt gehen wir davon aus, dass die Fehler-Strings den Keys direkt entsprechen (nach Übersetzung)
    if (this.error()?.includes(this.translocoService.translate('productPage.errorNoHandle', {}, this.translocoService.getActiveLang()))) return 'productPage.errorNoHandle';
    if (this.error()?.includes(this.translocoService.translate('productPage.errorLoadingProduct', {}, this.translocoService.getActiveLang()))) return 'productPage.errorLoadingProduct';
    if (this.error()?.includes(this.translocoService.translate('productPage.errorNotFound', {}, this.translocoService.getActiveLang()))) return 'productPage.errorNotFound';
    return null;
  }
  private getCurrentAddToCartErrorKey(): string | null {
    if (this.addToCartError()?.includes(this.translocoService.translate('productPage.errorVariantNotAvailable', {}, this.translocoService.getActiveLang()))) return 'productPage.errorVariantNotAvailable';
    if (this.addToCartError()?.includes(this.translocoService.translate('productPage.errorAddingToCart', {}, this.translocoService.getActiveLang()))) return 'productPage.errorAddingToCart';
    return null;
  }


  ngOnDestroy(): void {
      this.routeSubscription?.unsubscribe();
      this.authSubscription?.unsubscribe();
      this.langChangeSubscription?.unsubscribe();
  }

  selectImage(imageNode: ShopifyImage | null | undefined): void {
    if (imageNode) {
        this.selectedImage.set(imageNode);
    }
  }

  get firstAvailableVariantId(): string | null {
    const productData = this.product();
    if (!productData?.variants?.edges) { return null; }
    const availableVariant = productData.variants.edges.find(edge => edge.node.availableForSale);
    return availableVariant?.node?.id ?? null;
  }

  async addToCart(): Promise<void> {
    const variantId = this.firstAvailableVariantId;
    if (!variantId) {
      this.addToCartError.set(this.translocoService.translate('productPage.errorVariantNotAvailable'));
      this.cdr.markForCheck();
      return;
    }
    this.isAddingToCart.set(true);
    this.addToCartError.set(null);
    try {
      await this.cartService.addLine(variantId, 1);
      console.log(`ProductPage: Variant ${variantId} added successfully.`);
    } catch (error) {
      console.error(`ProductPage: Error adding variant ${variantId} to cart:`, error);
      this.addToCartError.set(this.translocoService.translate('productPage.errorAddingToCart'));
    } finally {
      this.isAddingToCart.set(false);
      this.cdr.markForCheck();
    }
  }

  async toggleWishlist(): Promise<void> {
    const handle = this.product()?.handle;
    if (!handle) {
        console.error("Product handle not available for wishlist action.");
        return;
    }
    if (!this.isLoggedIn()) {
        console.warn("User not logged in. Cannot toggle wishlist.");
        // Hier könnte man auch eine (übersetzbare) Meldung anzeigen
        return;
    }
    try {
      if (this.isOnWishlist()) {
        await this.wishlistService.removeFromWishlist(handle);
        console.log(`ProductPage: Removed ${handle} from wishlist.`);
      } else {
        await this.wishlistService.addToWishlist(handle);
        console.log(`ProductPage: Added ${handle} to wishlist.`);
      }
    } catch (error) {
        console.error("Error toggling wishlist:", error);
        // Hier könnte man auch eine (übersetzbare) Fehlermeldung anzeigen
    }
  }

  goBack(): void {
    this.location.back();
  }
}