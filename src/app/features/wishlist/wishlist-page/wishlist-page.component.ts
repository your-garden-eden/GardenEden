// src/app/features/wishlist/wishlist-page/wishlist-page.component.ts
import { Component, inject, signal, WritableSignal, Signal, computed, effect, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy, untracked } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WishlistService } from '../../../shared/services/wishlist.service';
import { ShopifyService, Product, CartLineInput, ShopifyProductVariant } from '../../../core/services/shopify.service';
import { CartService } from '../../../shared/services/cart.service';
import { ProductCardComponent } from '../../../shared/components/product-card/product-card.component'; // Bleibt vorerst importiert
import { FormatPricePipe } from '../../../shared/pipes/format-price.pipe';

@Component({
  selector: 'app-wishlist-page',
  standalone: true,
  imports: [ CommonModule, RouterLink, FormatPricePipe, CurrencyPipe /* ProductCardComponent */ ],
  templateUrl: './wishlist-page.component.html',
  styleUrls: ['./wishlist-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe]
})
export class WishlistPageComponent implements OnInit {
  private wishlistService = inject(WishlistService);
  private shopifyService = inject(ShopifyService);
  private cartService = inject(CartService);
  private cdr = inject(ChangeDetectorRef);

  // Signale vom WishlistService
  isLoadingWishlist = this.wishlistService.isLoading;
  wishlistError = this.wishlistService.error;
  wishlistHandles = this.wishlistService.wishlistHandles$;

  // Signale für diese Komponente
  isLoadingProducts: WritableSignal<boolean> = signal(false);
  productsError: WritableSignal<string | null> = signal(null);
  wishlistProducts: WritableSignal<Product[]> = signal([]);

  // Computed Signal für Gesamtpreis
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

  // Computed Signal, ob die Wunschliste leer ist
  isEmptyWishlist = computed(() => this.wishlistHandles().length === 0);

  // NEUES Computed Signal für den Disabled-Status des "Alle hinzufügen"-Buttons
  readonly isAddAllDisabled: Signal<boolean> = computed(() => {
      const loadingProd = this.isLoadingProducts();
      const loadingWish = this.isLoadingWishlist();
      const emptyWish = this.isEmptyWishlist();
      // console.log('Computed isAddAllDisabled:', {loadingProd, loadingWish, emptyWish, result: loadingProd || loadingWish || emptyWish});
      return loadingProd || loadingWish || emptyWish;
  });

  constructor() {
    // Effekt zum Laden der Produkte bei Handle-Änderung
    effect(() => {
      const handles = this.wishlistHandles();
      console.log('WishlistPage EFFECT: Handles changed, checking handles:', handles);
      // Verhindere Ausführung, wenn gerade Produkte geladen werden
      if (untracked(this.isLoadingProducts)) {
          console.log("WishlistPage EFFECT: Skipping because products are already loading.");
          return;
      }
      if (handles.length > 0) {
        this.loadProductsByHandles(handles); // await ist hier nicht nötig, da der Effekt asynchron ist
      } else {
        if(untracked(this.wishlistProducts).length > 0) { this.wishlistProducts.set([]); }
        if(untracked(this.productsError)) { this.productsError.set(null); }
      }
      this.cdr.markForCheck(); // Sicherstellen, dass die UI nach dem Effekt aktualisiert wird
    });
  }

  ngOnInit(): void {
    console.log("WishlistPageComponent initialized.");
    this.wishlistService.error.set(null); // Initiale Fehler vom Service löschen
  }

  /** Lädt die Produktdetails für die gegebenen Handles */
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
      }
    } catch (error) {
      console.error("WishlistPage loadProductsByHandles: Error during Promise.all execution:", error);
      this.productsError.set("Fehler beim Laden der Wunschlisten-Produkte.");
      this.wishlistProducts.set([]);
    } finally {
      console.log("WishlistPage loadProductsByHandles: Setting isLoadingProducts to false.");
      this.isLoadingProducts.set(false);
      console.log("WishlistPage loadProductsByHandles: Triggering Change Detection after loading.");
      this.cdr.markForCheck();
    }
  }

  /** Entfernt ein Produkt von der Wunschliste */
  async removeFromWishlist(productHandle: string): Promise<void> {
      this.productsError.set(null);
      await this.wishlistService.removeFromWishlist(productHandle);
  }

  /** Verschiebt ein Produkt von der Wunschliste in den Warenkorb */
  async moveFromWishlistToCart(product: Product): Promise<void> {
    if (!product.availableForSale) {
        this.productsError.set(`${product.title} ist derzeit nicht verfügbar.`);
        console.warn(`Product ${product.handle} is not available for sale.`);
        return;
    }
    const availableVariant = product.variants?.edges?.find(edge => edge.node.availableForSale);
    let variantId: string | null | undefined = availableVariant?.node?.id;
    if (!variantId && product.variants?.edges?.[0]?.node?.id) {
        console.warn(`Konnte keine explizit verfügbare Variante für ${product.handle} finden. Nehme erste Variante an.`);
        variantId = product.variants.edges[0].node.id;
    }
    if (!variantId) {
        this.productsError.set(`Keine Variante für ${product.title} zum Hinzufügen gefunden.`);
        console.error(`No variant ID found for product handle: ${product.handle}`);
        return;
    }
    console.log(`Moving ${product.handle} (Variant: ${variantId}) from wishlist to cart.`);
    this.isLoadingProducts.set(true);
    this.productsError.set(null);
    try {
        await this.cartService.addLine(variantId, 1);
        await this.wishlistService.removeFromWishlist(product.handle);
    } catch (error: any) {
        console.error(`Error moving ${product.handle} to cart:`, error);
        this.productsError.set(error.message || `Fehler beim Verschieben von ${product.title}.`);
    } finally {
        this.isLoadingProducts.set(false);
    }
  }

  /** Fügt alle Produkte von der Wunschliste zum Warenkorb hinzu */
  async addAllToCart(): Promise<void> {
      // Rufe die implementierte Methode im Service auf
      await this.wishlistService.addAllToCartAndClearWishlist();
  }

  /** TrackBy Funktion für die @for Schleife */
  getProductIdentifier(index: number, product: Product): string {
    return product.id;
  }

} // Ende WishlistPageComponent Klasse