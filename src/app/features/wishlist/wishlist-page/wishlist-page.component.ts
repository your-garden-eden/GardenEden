// src/app/features/wishlist/wishlist-page/wishlist-page.component.ts
import { Component, inject, signal, WritableSignal, Signal, computed, effect, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy, untracked } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WishlistService } from '../../../shared/services/wishlist.service';
import { ShopifyService, Product, CartLineInput, ShopifyProductVariant } from '../../../core/services/shopify.service';
import { CartService } from '../../../shared/services/cart.service';
import { ProductCardComponent } from '../../../shared/components/product-card/product-card.component';
import { FormatPricePipe } from '../../../shared/pipes/format-price.pipe';

// Transloco
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs'; // Subscription importieren

@Component({
  selector: 'app-wishlist-page',
  standalone: true,
  imports: [ CommonModule, RouterLink, FormatPricePipe, CurrencyPipe, TranslocoModule ],
  templateUrl: './wishlist-page.component.html',
  styleUrls: ['./wishlist-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe]
})
export class WishlistPageComponent implements OnInit, OnDestroy { // OnDestroy hinzugefügt
  private wishlistService = inject(WishlistService);
  private shopifyService = inject(ShopifyService);
  private cartService = inject(CartService);
  private cdr = inject(ChangeDetectorRef);
  private translocoService = inject(TranslocoService); // TranslocoService injiziert

  isLoadingWishlist = this.wishlistService.isLoading;
  wishlistError = this.wishlistService.error; // Wird ggf. vom Service schon übersetzt
  wishlistHandles = this.wishlistService.wishlistHandles$;

  isLoadingProducts: WritableSignal<boolean> = signal(false);
  productsError: WritableSignal<string | null> = signal(null);
  wishlistProducts: WritableSignal<Product[]> = signal([]);

  private langChangeSubscription?: Subscription; // Für Sprachwechsel

  totalPrice = computed(() => {
    let total = 0;
    for (const product of this.wishlistProducts()) {
      const priceString = product.priceRange?.minVariantPrice?.amount;
      if (priceString) {
        total += parseFloat(priceString);
      }
    }
    return total;
  });

  isEmptyWishlist = computed(() => this.wishlistHandles().length === 0);

  readonly isAddAllDisabled: Signal<boolean> = computed(() => {
      const loadingProd = this.isLoadingProducts();
      const loadingWish = this.isLoadingWishlist();
      const emptyWish = this.isEmptyWishlist();
      return loadingProd || loadingWish || emptyWish;
  });

  constructor() {
    effect(() => {
      const handles = this.wishlistHandles();
      console.log('WishlistPage EFFECT: Handles changed, checking handles:', handles);
      if (untracked(this.isLoadingProducts)) {
          console.log("WishlistPage EFFECT: Skipping because products are already loading.");
          return;
      }
      if (handles.length > 0) {
        this.loadProductsByHandles(handles);
      } else {
        if(untracked(this.wishlistProducts).length > 0) { this.wishlistProducts.set([]); }
        if(untracked(this.productsError)) { this.productsError.set(null); }
      }
      this.cdr.markForCheck();
    });
  }

  ngOnInit(): void {
    console.log("WishlistPageComponent initialized.");
    this.wishlistService.error.set(null);

    this.langChangeSubscription = this.translocoService.langChanges$.subscribe(() => {
        // Wenn Fehlertexte direkt im Component gesetzt werden, hier neu übersetzen
        if (this.productsError()) {
            // Diese Logik hängt davon ab, wie die Fehler gesetzt werden.
            // Einfacher Ansatz: Wenn ein Fehler da ist, versuche ihn neu zu setzen, falls er einem Key entspricht.
            // Besser: Fehler als Key speichern und bei Anzeige übersetzen oder hier Key neu übersetzen.
            // Für den Moment lassen wir das, da die meisten Fehler vom Service kommen könnten
            // oder spezifische Produktnamen enthalten.
        }
        this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
      this.langChangeSubscription?.unsubscribe();
  }

  private async loadProductsByHandles(handles: string[]): Promise<void> {
    if (this.isLoadingProducts()) {
        console.log("WishlistPage loadProductsByHandles: Already loading, skipping call.");
        return;
    }
    this.isLoadingProducts.set(true);
    this.productsError.set(null);
    console.log(`WishlistPage loadProductsByHandles: Starting to load ${handles.length} products individually...`);
    try {
      const productPromises = handles.map(async (handle) => {
         try {
             console.log(`WishlistPage loadProductsByHandles: Fetching handle: ${handle}`);
             const product = await this.shopifyService.getProductByHandle(handle);
             console.log(`WishlistPage loadProductsByHandles: Fetched product for ${handle}:`, !!product);
             return product;
         } catch (singleError) {
             console.error(`WishlistPage loadProductsByHandles: Error fetching single product ${handle}:`, singleError);
             return null;
         }
      });
      const productsOrNulls = await Promise.all(productPromises);
      const products = productsOrNulls.filter(p => p !== null) as Product[];
      console.log(`WishlistPage loadProductsByHandles: Promise.all resolved. Loaded ${products.length} products successfully.`);
      const sortedProducts = handles
        .map(handle => products.find(p => p.handle === handle))
        .filter(p => p !== undefined) as Product[];
      this.wishlistProducts.set(sortedProducts);
      if (sortedProducts.length !== handles.length) {
           console.warn("WishlistPage loadProductsByHandles: Some wishlist products could not be loaded.");
           // Optional: eine nicht-blockierende Info für den Nutzer
      }
    } catch (error) {
      console.error("WishlistPage loadProductsByHandles: Error during Promise.all execution:", error);
      this.productsError.set(this.translocoService.translate('wishlistPage.error.loadingProducts'));
      this.wishlistProducts.set([]);
    } finally {
      console.log("WishlistPage loadProductsByHandles: Setting isLoadingProducts to false.");
      this.isLoadingProducts.set(false);
      console.log("WishlistPage loadProductsByHandles: Triggering Change Detection after loading.");
      this.cdr.markForCheck();
    }
  }

  async removeFromWishlist(productHandle: string): Promise<void> {
      this.productsError.set(null);
      await this.wishlistService.removeFromWishlist(productHandle);
  }

  async moveFromWishlistToCart(product: Product): Promise<void> {
    if (!product.availableForSale) {
        this.productsError.set(this.translocoService.translate('wishlistPage.error.productNotAvailable', { productName: product.title }));
        console.warn(`Product ${product.handle} is not available for sale.`);
        return;
    }
    // ... (Rest der Logik bleibt gleich, aber Fehlermeldungen anpassen)
    let variantId: string | null | undefined = product.variants?.edges?.find(edge => edge.node.availableForSale)?.node?.id;

    if (!variantId && product.variants?.edges?.[0]?.node?.id) {
        variantId = product.variants.edges[0].node.id;
    }
    if (!variantId) {
        this.productsError.set(this.translocoService.translate('wishlistPage.error.noVariantFound', { productName: product.title }));
        console.error(`No variant ID found for product handle: ${product.handle}`);
        return;
    }
    console.log(`Moving ${product.handle} (Variant: ${variantId}) from wishlist to cart.`);
    this.isLoadingProducts.set(true); // oder ein spezifisches Loading-Signal für diese Aktion
    this.productsError.set(null);
    try {
        await this.cartService.addLine(variantId, 1);
        await this.wishlistService.removeFromWishlist(product.handle);
    } catch (error: any) {
        console.error(`Error moving ${product.handle} to cart:`, error);
        this.productsError.set(this.translocoService.translate('wishlistPage.error.movingToCartError', { productName: product.title }));
    } finally {
        this.isLoadingProducts.set(false); // oder spezifisches Loading-Signal zurücksetzen
    }
  }

  async addAllToCart(): Promise<void> {
      await this.wishlistService.addAllToCartAndClearWishlist();
      // Der WishlistService sollte idealerweise auch Fehler behandeln und ggf. übersetzbare Fehler liefern
  }

  getProductIdentifier(index: number, product: Product): string {
    return product.id;
  }
}