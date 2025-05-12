// src/app/features/wishlist/wishlist-page/wishlist-page.component.ts
import { Component, inject, signal, WritableSignal, Signal, computed, effect, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy, untracked } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WishlistService } from '../../../shared/services/wishlist.service';
import { ShopifyService, Product, CartLineInput, ShopifyProductVariant } from '../../../core/services/shopify.service';
import { CartService } from '../../../shared/services/cart.service';
// ProductCardComponent wird hier nicht direkt verwendet, falls doch, wieder einkommentieren
// import { ProductCardComponent } from '../../../shared/components/product-card/product-card.component';
import { FormatPricePipe } from '../../../shared/pipes/format-price.pipe';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs';
import { startWith, switchMap, tap } from 'rxjs/operators';

@Component({
  selector: 'app-wishlist-page',
  standalone: true,
  imports: [ CommonModule, RouterLink, FormatPricePipe, CurrencyPipe, TranslocoModule ],
  templateUrl: './wishlist-page.component.html',
  styleUrls: ['./wishlist-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe] // CurrencyPipe ist okay hier, wenn nur lokal benötigt oder zur Sicherheit
})
export class WishlistPageComponent implements OnInit, OnDestroy {
  private wishlistService = inject(WishlistService);
  private shopifyService = inject(ShopifyService);
  private cartService = inject(CartService);
  private cdr = inject(ChangeDetectorRef);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);

  isLoadingWishlist = this.wishlistService.isLoading;
  wishlistError = this.wishlistService.error; // Wird vom Service behandelt
  wishlistHandles = this.wishlistService.wishlistHandles$;

  isLoadingProducts: WritableSignal<boolean> = signal(false);
  productsError: WritableSignal<string | null> = signal(null); // Hält den übersetzten Fehlertext
  private productsErrorKey: WritableSignal<string | null> = signal(null); // Hält den Key für Neuübersetzung
  wishlistProducts: WritableSignal<Product[]> = signal([]);

  private subscriptions = new Subscription();

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
      const loadingWish = this.isLoadingWishlist(); // isLoading vom Service
      const emptyWish = this.isEmptyWishlist();
      const noProducts = this.wishlistProducts().length === 0;
      const allUnavailable = this.wishlistProducts().every(p => !p.availableForSale);
      return loadingProd || loadingWish || emptyWish || noProducts || allUnavailable;
  });

  constructor() {
    // Effect zum Laden der Produkte, wenn sich die Wishlist-Handles ändern
    effect(() => {
      const handles = this.wishlistHandles();
      // Verhindere mehrfaches Laden, wenn isLoadingProducts bereits true ist
      if (untracked(this.isLoadingProducts)) {
          return;
      }
      if (handles.length > 0) {
        this.loadProductsByHandles(handles);
      } else {
        // Wenn keine Handles mehr da sind, leere die Produktliste und Fehler
        if(untracked(this.wishlistProducts).length > 0) { this.wishlistProducts.set([]); }
        if(untracked(this.productsError)) { 
            this.productsError.set(null); 
            this.productsErrorKey.set(null);
        }
      }
      this.cdr.markForCheck(); // Stelle sicher, dass die UI aktualisiert wird
    });
  }

  ngOnInit(): void {
    this.wishlistService.error.set(null); // Setze Service-Fehler zurück beim Init

    // Titel und sprachabhängige UI-Texte (Fehler) reaktiv setzen
    const langChangeSub = this.translocoService.langChanges$.pipe(
      startWith(this.translocoService.getActiveLang()), // Auch initial ausführen
      switchMap(lang => 
        this.translocoService.selectTranslate('wishlistPage.title', {}, lang) 
      ),
      tap(translatedPageTitle => {
        this.titleService.setTitle(translatedPageTitle);
        
        // Produktladefehler neu übersetzen, falls vorhanden
        if (this.productsErrorKey()) {
          // Parameter für die Fehlermeldung, falls nötig (hier nur productName als Beispiel)
          const currentProductForError = this.wishlistProducts().find(p => 
              this.productsErrorKey() === 'wishlistPage.error.productNotAvailable' ||
              this.productsErrorKey() === 'wishlistPage.error.noVariantFound' ||
              this.productsErrorKey() === 'wishlistPage.error.movingToCartError'
          );
          const params = currentProductForError ? { productName: currentProductForError.title } : {};
          this.productsError.set(this.translocoService.translate(this.productsErrorKey()!, params));
        }
      })
    ).subscribe(() => {
      this.cdr.detectChanges(); // UI Update anstoßen
    });
    this.subscriptions.add(langChangeSub);
  }

  ngOnDestroy(): void {
      this.subscriptions.unsubscribe();
  }

  private async loadProductsByHandles(handles: string[]): Promise<void> {
    if (this.isLoadingProducts()) return; // Verhindere paralleles Laden

    this.isLoadingProducts.set(true);
    this.productsError.set(null);
    this.productsErrorKey.set(null);
    try {
      const productPromises = handles.map(handle => 
        this.shopifyService.getProductByHandle(handle).catch(err => {
          console.error(`WishlistPage: Error fetching product ${handle}:`, err);
          return null; // Wichtig, damit Promise.all nicht beim ersten Fehler abbricht
        })
      );
      const productsOrNulls = await Promise.all(productPromises);
      const products = productsOrNulls.filter(p => p !== null) as Product[];
      
      // Produkte in der Reihenfolge der Handles sortieren
      const sortedProducts = handles
        .map(handle => products.find(p => p.handle === handle))
        .filter(p => p !== undefined) as Product[];
      
      this.wishlistProducts.set(sortedProducts);

      if (sortedProducts.length !== handles.length) {
        console.warn("WishlistPage: Some wishlist products could not be loaded.");
        // Hier keinen globalen Fehler setzen, da es einzelne Produkte betrifft.
        // Man könnte eine separate Info-Meldung für den Nutzer anzeigen.
      }
    } catch (error) { // Fängt Fehler von Promise.all selbst ab (selten)
      console.error("WishlistPage: General error loading products by handles:", error);
      this.productsErrorKey.set('wishlistPage.error.loadingProducts');
      this.productsError.set(this.translocoService.translate(this.productsErrorKey()!));
      this.wishlistProducts.set([]);
    } finally {
      this.isLoadingProducts.set(false);
      this.cdr.markForCheck();
    }
  }

  async removeFromWishlist(productHandle: string): Promise<void> {
      this.productsError.set(null); // Fehler zurücksetzen
      this.productsErrorKey.set(null);
      await this.wishlistService.removeFromWishlist(productHandle);
      // Die Produktliste wird durch den effect-Hook automatisch aktualisiert.
  }

  async moveFromWishlistToCart(product: Product): Promise<void> {
    this.productsError.set(null);
    this.productsErrorKey.set(null);

    if (!product.availableForSale) {
        this.productsErrorKey.set('wishlistPage.error.productNotAvailable');
        this.productsError.set(this.translocoService.translate(this.productsErrorKey()!, { productName: product.title }));
        return;
    }
    // Finde die erste verfügbare Variante oder die erste Variante überhaupt
    let variantId = product.variants?.edges?.find(edge => edge.node.availableForSale)?.node?.id 
                  || product.variants?.edges?.[0]?.node?.id;

    if (!variantId) {
        this.productsErrorKey.set('wishlistPage.error.noVariantFound');
        this.productsError.set(this.translocoService.translate(this.productsErrorKey()!, { productName: product.title }));
        return;
    }
    
    // Ein spezifisches Loading-Signal für diese Aktion wäre besser, um nicht die ganze Liste auszublenden
    // Fürs Erste nutzen wir isLoadingProducts, aber idealerweise ein feingranulareres Signal.
    // this.isLoadingProducts.set(true); 
    try {
        await this.cartService.addLine(variantId, 1);
        await this.wishlistService.removeFromWishlist(product.handle); // Entfernt von Wunschliste nach erfolgreichem Hinzufügen
    } catch (error: any) {
        this.productsErrorKey.set('wishlistPage.error.movingToCartError');
        this.productsError.set(this.translocoService.translate(this.productsErrorKey()!, { productName: product.title }));
    } finally {
        // this.isLoadingProducts.set(false);
    }
  }

  async addAllToCart(): Promise<void> {
      this.productsError.set(null); // Fehler zurücksetzen
      this.productsErrorKey.set(null);
      // Die Logik in addAllToCartAndClearWishlist sollte Fehler behandeln
      // und ggf. einen Fehler über wishlistService.error setzen.
      await this.wishlistService.addAllToCartAndClearWishlist();
  }

  getProductIdentifier(index: number, product: Product): string {
    return product.id; // product.id ist stabiler als der Index
  }
}