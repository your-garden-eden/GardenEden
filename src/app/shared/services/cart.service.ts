// /src/app/shared/services/cart.service.ts
import { Injectable, signal, computed, inject, WritableSignal, Signal, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  WoocommerceService,
  WooCommerceStoreCart,
  WooCommerceStoreCartItem,
  WooCommerceStoreCartItemTotals,
  WooCommerceStoreCartTotals,
} from '../../core/services/woocommerce.service';
import { AuthService, WordPressUser } from './auth.service'; // WordPressUser importiert
import { Subscription, of, firstValueFrom } from 'rxjs';
import { catchError, tap, distinctUntilChanged } from 'rxjs/operators'; // distinctUntilChanged importiert

@Injectable({
  providedIn: 'root'
})
export class CartService implements OnDestroy {
  private woocommerceService = inject(WoocommerceService);
  private authService = inject(AuthService);
  private platformId = inject(PLATFORM_ID);

  readonly cart: WritableSignal<WooCommerceStoreCart | null> = signal(null);
  readonly isLoading: WritableSignal<boolean> = signal(false);
  readonly error: WritableSignal<string | null> = signal(null);
  readonly cartItemCount: Signal<number> = computed(() => this.cart()?.items_count ?? 0);

  private authSubscription: Subscription | null = null;
  private currentUserId: WritableSignal<string | number | null> = signal(null); // Kann jetzt auch number sein

  constructor() {
    console.log('[CartService] Constructor initializing.');
    if (isPlatformBrowser(this.platformId)) {
      console.log('[CartService] Platform is browser. Initializing cart and auth subscription.');
      this.loadInitialCartFromServer();
      this.subscribeToAuthState();
    } else {
      console.log('[CartService] Platform is not browser. Skipping client-side initializations.');
    }
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }

  private subscribeToAuthState(): void {
    // KORRIGIERT: currentWordPressUser$ verwenden und Typ anpassen
    this.authSubscription = this.authService.currentWordPressUser$.pipe(
      distinctUntilChanged((prev, curr) => prev?.id === curr?.id) // Nur reagieren, wenn sich die ID wirklich ändert
    ).subscribe((user: WordPressUser | null) => { // KORRIGIERT: Typ WordPressUser
      const newUserId = user?.id ?? null; // KORRIGIERT: user.id (number) verwenden
      if (this.currentUserId() !== newUserId) {
        console.log(`[CartService] Auth state changed: User ID from ${this.currentUserId()} to ${newUserId}. Clearing local WC token and reloading cart.`);
        this.currentUserId.set(newUserId);
        this.woocommerceService.clearLocalCartToken(); // Annahme: Diese Methode existiert im WoocommerceService
        this.loadInitialCartFromServer();
      } else if (this.currentUserId() === null && newUserId === null && !this.cart()) {
        // Fall: User war null und ist immer noch null, aber Warenkorb wurde vielleicht nie geladen
        console.log(`[CartService] User is still null, ensuring cart is loaded.`);
        this.loadInitialCartFromServer();
      } else {
        // Dies stellt sicher, dass die currentUserId auch aktualisiert wird, wenn es keine ID-Änderung gab,
        // aber das user-Objekt sich vielleicht anderweitig geändert hat (obwohl distinctUntilChanged auf ID prüft)
        // oder wenn der User von einem Wert zu einem anderen Wert wechselt, der nicht null ist.
        this.currentUserId.set(newUserId);
      }
    });
  }

  // Private Hilfsmethode zur Umrechnung der Preise aus der Store API
  private _convertStoreApiPricesInCart(cart: WooCommerceStoreCart | null): WooCommerceStoreCart | null {
    if (!cart) {
      return null;
    }
    const newCart = JSON.parse(JSON.stringify(cart)) as WooCommerceStoreCart;

    const priceKeysToConvertItemTotals: (keyof WooCommerceStoreCartItemTotals)[] = [
      'line_subtotal', 'line_subtotal_tax', 'line_total', 'line_total_tax'
    ];
    const priceKeysToConvertCartTotals: (keyof WooCommerceStoreCartTotals)[] = [
      'total_items', 'total_items_tax', 'total_price', 'total_tax',
      'total_shipping', 'total_shipping_tax', 'total_discount', 'total_discount_tax'
    ];

    newCart.items.forEach((item: WooCommerceStoreCartItem) => {
      if (item.prices) {
        if (item.prices.price) {
          item.prices.price = (parseFloat(item.prices.price) / 100).toString();
        }
        if (item.prices.regular_price) {
          item.prices.regular_price = (parseFloat(item.prices.regular_price) / 100).toString();
        }
        if (item.prices.sale_price) {
          item.prices.sale_price = (parseFloat(item.prices.sale_price) / 100).toString();
        }
        if (item.prices.price_range?.min_amount) {
            item.prices.price_range.min_amount = (parseFloat(item.prices.price_range.min_amount) / 100).toString();
        }
        if (item.prices.price_range?.max_amount) {
            item.prices.price_range.max_amount = (parseFloat(item.prices.price_range.max_amount) / 100).toString();
        }
      }
      priceKeysToConvertItemTotals.forEach(key => {
        if (item.totals[key] !== undefined && item.totals[key] !== null) {
          (item.totals as any)[key] = (parseFloat(item.totals[key] as string) / 100).toString();
        }
      });
    });

    priceKeysToConvertCartTotals.forEach(key => {
      if (newCart.totals[key] !== undefined && newCart.totals[key] !== null) {
        (newCart.totals as any)[key] = (parseFloat(newCart.totals[key] as string) / 100).toString();
      }
    });

    if (newCart.totals.tax_lines && newCart.totals.tax_lines.length > 0) {
        newCart.totals.tax_lines.forEach(taxLine => {
            if (taxLine.price) {
                taxLine.price = (parseFloat(taxLine.price) / 100).toString();
            }
        });
    }
    console.log('[CartService] _convertStoreApiPricesInCart: Prices converted.', newCart);
    return newCart;
  }

  public async loadInitialCartFromServer(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      console.log('[CartService] Skipping loadInitialCartFromServer on non-browser platform.');
      return;
    }
    console.log('[CartService] Attempting to load initial cart from server...');
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const fetchedCart = await firstValueFrom(this.woocommerceService.getWcCart().pipe(
         catchError(err => {
           console.error('[CartService] Error fetching initial cart:', err);
           this.error.set('Warenkorb konnte nicht geladen werden.'); // Hier eine Übersetzung verwenden, z.B. this.translocoService.translate('cartService.errorLoadingCart')
           return of(null);
         })
      ));
      this.cart.set(this._convertStoreApiPricesInCart(fetchedCart));
      console.log('[CartService] Initial cart loaded/set (prices converted):', this.cart() ? `Items: ${this.cart()!.items_count}` : 'Cart is null/empty');
    } catch (err) {
      console.error('[CartService] Uncaught error during loadInitialCartFromServer execution:', err);
      this.cart.set(null);
      if (!this.error()) {
        this.error.set('Ein unbekannter Fehler beim Laden des Warenkorbs ist aufgetreten.'); // Übersetzung
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async addItem(productId: number, quantity: number, variationId?: number): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    console.log(`[CartService] Attempting to add item - ProductID: ${productId}, Quantity: ${quantity}, VariationID: ${variationId}`);
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const updatedCart = await firstValueFrom(this.woocommerceService.addItemToWcCart(
        productId,
        quantity,
        undefined, // meta_data, falls benötigt
        variationId
      ).pipe(
        catchError(err => {
          console.error('[CartService] Error adding item to cart:', err);
          this.error.set('Fehler beim Hinzufügen zum Warenkorb.'); // Übersetzung
          return of(this.cart()); // Gibt den aktuellen Warenkorb zurück, um den State nicht zu verlieren
        })
      ));
      // Überprüfen, ob updatedCart nicht undefined ist, bevor es gesetzt wird
      if (updatedCart !== undefined) {
          this.cart.set(this._convertStoreApiPricesInCart(updatedCart));
          console.log('[CartService] Item added, cart updated (prices converted):', this.cart() ? `Items: ${this.cart()!.items_count}` : 'Cart is null');
      } else {
          console.warn('[CartService] addItemToWcCart (or error fallback) resulted in undefined cart state.');
      }
    } catch (err) {
       // Dieser Block wird erreicht, wenn im try-Block oberhalb von firstValueFrom ein Fehler auftritt
       // oder wenn der catchError in der Pipe einen Fehler weiterwirft (was hier nicht der Fall ist).
       if (!this.error()) { this.error.set('Ein unbekannter Fehler beim Hinzufügen zum Warenkorb ist aufgetreten.'); } // Übersetzung
       console.error('[CartService] Uncaught error during addItem execution:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async updateItemQuantity(itemKey: string, quantity: number): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (quantity <= 0) {
      console.log(`[CartService] Quantity for itemKey ${itemKey} is <= 0. Removing item instead.`);
      await this.removeItem(itemKey);
      return;
    }
    console.log(`[CartService] Attempting to update quantity for itemKey ${itemKey} to ${quantity}`);
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const updatedCart = await firstValueFrom(this.woocommerceService.updateWcCartItemQuantity(itemKey, quantity).pipe(
         catchError(err => {
           console.error('[CartService] Error updating item quantity:', err);
           this.error.set('Menge konnte nicht aktualisiert werden.'); // Übersetzung
           return of(this.cart());
         })
      ));
      if (updatedCart !== undefined) {
        this.cart.set(this._convertStoreApiPricesInCart(updatedCart));
        console.log('[CartService] Item quantity updated (prices converted):', this.cart() ? `Items: ${this.cart()!.items_count}` : 'Cart is null');
      }
    } catch (err) {
      if (!this.error()) { this.error.set('Ein unbekannter Fehler beim Aktualisieren der Menge ist aufgetreten.');} // Übersetzung
      console.error('[CartService] Uncaught error during updateItemQuantity execution:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async removeItem(itemKey: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    console.log(`[CartService] Attempting to remove itemKey ${itemKey}`);
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const updatedCart = await firstValueFrom(this.woocommerceService.removeWcCartItem(itemKey).pipe(
         catchError(err => {
           console.error('[CartService] Error removing item from cart:', err);
           this.error.set('Artikel konnte nicht entfernt werden.'); // Übersetzung
           return of(this.cart());
         })
      ));
      if (updatedCart !== undefined) {
        this.cart.set(this._convertStoreApiPricesInCart(updatedCart));
        console.log('[CartService] Item removed, cart updated (prices converted):', this.cart() ? `Items: ${this.cart()!.items_count}` : 'Cart is null/empty');
      }
    } catch (err) {
      if (!this.error()) { this.error.set('Ein unbekannter Fehler beim Entfernen des Artikels ist aufgetreten.'); } // Übersetzung
      console.error('[CartService] Uncaught error during removeItem execution:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async clearCart(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    console.log(`[CartService] Attempting to clear cart via API.`);
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const clearedCart = await firstValueFrom(this.woocommerceService.clearWcCart().pipe(
         catchError(err => {
           console.error('[CartService] Error clearing cart via API:', err);
           this.error.set('Warenkorb konnte nicht geleert werden.'); // Übersetzung
           return of(this.cart()); // Behält den alten Warenkorb bei Fehler
         })
      ));
      // clearWcCart gibt oft einen leeren Warenkorb oder null zurück.
      this.cart.set(this._convertStoreApiPricesInCart(clearedCart ?? null));
      console.log('[CartService] Cart cleared via API, cart set to (prices converted):', this.cart());
    } catch (err) {
       if (!this.error()) { this.error.set('Ein unbekannter Fehler beim Leeren des Warenkorbs ist aufgetreten.'); } // Übersetzung
       console.error('[CartService] Uncaught error during clearCart execution:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadCartWithToken(token: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    console.log(`[CartService] Attempting to load cart with token: ${token}`);
    this.isLoading.set(true);
    this.error.set(null);
    try {
        // Annahme: loadCartFromToken ist eine Methode im WoocommerceService, die einen Cart oder null/Error zurückgibt
        const loadedCart = await this.woocommerceService.loadCartFromToken(token);
        this.cart.set(this._convertStoreApiPricesInCart(loadedCart));
        console.log('[CartService] Cart loaded with token (prices converted):', this.cart() ? `Items: ${this.cart()!.items_count}` : 'Cart is null/empty');
    } catch (error) { // Hier den Variablennamen 'error' verwenden
        console.error('[CartService] Error loading cart with token:', error);
        this.error.set('Warenkorb konnte mit dem Token nicht geladen werden.'); // Übersetzung
        this.cart.set(null);
    } finally {
        this.isLoading.set(false);
    }
  }

  public clearLocalCartStateForCheckout(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    console.log('[CartService] Clearing local cart state for checkout transition (frontend only).');
    this.cart.set(null);
    this.error.set(null);
    // isLoading sollte hier vielleicht nicht verändert werden,
    // da ein Ladevorgang einer anderen Komponente noch laufen könnte.
    // Besser: isLoading.set(false); // Nur wenn sicher, dass keine anderen Cart-Operationen laufen.
    console.log('[CartService] Local cart state (signals) cleared.');
  }
}