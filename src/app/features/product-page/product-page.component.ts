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

@Component({
  selector: 'app-product-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ImageTransformPipe,
    FormatPricePipe,
    SafeHtmlPipe
  ],
  templateUrl: './product-page.component.html',
  styleUrls: ['./product-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe]
})
export class ProductPageComponent implements OnInit, OnDestroy {
  // Services injizieren
  private route = inject(ActivatedRoute);
  private shopifyService = inject(ShopifyService);
  private titleService = inject(Title);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private location = inject(Location);
  private cartService = inject(CartService);
  private wishlistService = inject(WishlistService);
  private authService = inject(AuthService);

  // Signals für Produkt und UI-Zustand
  product: WritableSignal<Product | null> = signal(null);
  isLoading: WritableSignal<boolean> = signal(true);
  error: WritableSignal<string | null> = signal(null);
  selectedImage: WritableSignal<ShopifyImage | null | undefined> = signal(null);
  isAddingToCart: WritableSignal<boolean> = signal(false);
  addToCartError: WritableSignal<string | null> = signal(null);

  // Computed Signal für Wishlist-Status
  readonly isOnWishlist: Signal<boolean> = computed(() => {
      const handle = this.product()?.handle;
      return handle ? this.wishlistService.isOnWishlist(handle) : false;
  });

  // Signal für Login-Status (KORRIGIERT: WritableSignal)
  isLoggedIn: WritableSignal<boolean> = signal(false);
  private authSubscription: Subscription | null = null;

  private routeSubscription?: Subscription;

  ngOnInit(): void {
    // Beobachte Login-Status
    this.authSubscription = this.authService.isLoggedIn().subscribe(loggedIn => {
        this.isLoggedIn.set(loggedIn); // Jetzt möglich, da WritableSignal
        this.cdr.markForCheck();
    });

    // Lade Produktdaten
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
                this.error.set('Kein Produkt-Handle angegeben.');
                this.isLoading.set(false);
                return false;
            }
            return true;
      }),
      switchMap(handle => from(this.shopifyService.getProductByHandle(handle)).pipe(
          catchError(err => {
             console.error(`Error loading product ${handle}:`, err);
             this.error.set('Fehler beim Laden des Produkts.');
             return of(null);
          })
      ))
    ).subscribe((productData: Product | null) => {
        if (productData) {
            this.product.set(productData);
            // Setze initial ausgewähltes Bild sicher
            this.selectedImage.set(productData.images?.edges?.[0]?.node); // ?. hier beibehalten, da images optional sein *könnte*
            this.titleService.setTitle(`${productData.title} - Your Garden Eden`);
            this.error.set(null);
            console.log('Produktdaten geladen:', productData);
        } else if (!this.error()) {
            this.error.set('Produkt nicht gefunden.');
            this.titleService.setTitle('Produkt nicht gefunden - Your Garden Eden');
        }
        this.isLoading.set(false);
        this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
      this.routeSubscription?.unsubscribe();
      this.authSubscription?.unsubscribe();
  }

  selectImage(imageNode: ShopifyImage | null | undefined): void {
    if (imageNode) {
        this.selectedImage.set(imageNode);
    }
  }

  get firstAvailableVariantId(): string | null {
    const productData = this.product();
    // ?. hier sicherheitshalber beibehalten, falls product noch null ist
    if (!productData?.variants?.edges) { return null; }
    const availableVariant = productData.variants.edges.find(edge => edge.node.availableForSale);
    return availableVariant?.node?.id ?? null;
  }

  async addToCart(): Promise<void> {
    const variantId = this.firstAvailableVariantId;
    if (!variantId) {
      this.addToCartError.set('Produktvariante nicht verfügbar oder nicht ausgewählt.');
      return;
    }
    this.isAddingToCart.set(true);
    this.addToCartError.set(null);
    try {
      await this.cartService.addLine(variantId, 1);
      console.log(`ProductPage: Variant ${variantId} added successfully.`);
    } catch (error) {
      console.error(`ProductPage: Error adding variant ${variantId} to cart:`, error);
      this.addToCartError.set('Fehler beim Hinzufügen zum Warenkorb.');
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
    } finally {
        // Kein explizites cdr.markForCheck nötig, da Signals die UI aktualisieren
    }
  }

  goBack(): void {
    this.location.back();
  }
}