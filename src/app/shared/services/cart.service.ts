// /src/app/shared/services/cart.service.ts
import { Injectable, signal, computed, inject, WritableSignal, Signal, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  WoocommerceService,
  WooCommerceStoreCart,
  // WooCommerceProductVariationAttribute // Importieren, falls Sie es direkt verwenden
} from '../../core/services/woocommerce.service';
import { AuthService } from './auth.service';
import { Subscription, of, firstValueFrom } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

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
  private currentUserId: WritableSignal<string | null> = signal(null); // Wird derzeit nicht direkt für Cart-Logik verwendet, aber für Auth-Reaktion

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadInitialCartFromServer();
      this.subscribeToAuthState();
    }
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }

  private subscribeToAuthState(): void {
    this.authSubscription = this.authService.authState$.subscribe(user => {
      const newUserId = user?.uid ?? null;
      // Wenn sich der Benutzer ändert, möchten Sie möglicherweise den lokalen Cart-Token löschen,
      // damit WooCommerce einen neuen/passenden für den eingeloggten Benutzer oder einen neuen Gast-Cart ausgibt.
      if (this.currentUserId() !== newUserId) {
        console.log(`CartService: User changed from ${this.currentUserId()} to ${newUserId}. Clearing local cart token and reloading cart.`);
        this.woocommerceService.clearLocalCartToken(); // Lokalen Token löschen
        this.currentUserId.set(newUserId);
        this.loadInitialCartFromServer(); // Cart neu laden (wird neuen Token holen)
      } else {
        this.currentUserId.set(newUserId); // Nur setzen, falls gleich geblieben
      }
    });
  }

  public async loadInitialCartFromServer(): Promise<void> {
    console.log('CartService: Attempting to load cart from server...');
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const fetchedCart = await firstValueFrom(this.woocommerceService.getWcCart().pipe(
         catchError(err => {
           console.error('CartService: Error fetching initial cart:', err);
           this.error.set('Warenkorb konnte nicht geladen werden.');
           return of(null); // Gibt null zurück, um den Stream nicht abzubrechen
         })
      ));
      this.cart.set(fetchedCart);
      console.log('CartService: Initial cart loaded/set:', fetchedCart);
    } catch (err) {
      // Sollte durch catchError in der Pipe abgefangen werden, aber als Fallback
      console.error('CartService: Uncaught error during loadInitialCartFromServer execution:', err);
      this.cart.set(null);
      if (!this.error()) { // Setze Fehler, falls nicht schon durch pipe geschehen
        this.error.set('Ein unbekannter Fehler beim Laden des Warenkorbs ist aufgetreten.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async addItem(productId: number, quantity: number, variationId?: number): Promise<void> {
    console.log(`CartService: Attempting to add item - ProductID: ${productId}, Quantity: ${quantity}, VariationID: ${variationId}`);
    this.isLoading.set(true);
    this.error.set(null);
    try {
      // Korrigierter Aufruf:
      // Der dritte Parameter ist `variationAttributes` (hier undefined, da wir variationId nutzen wollen).
      // Der vierte Parameter ist `variationId`.
      const updatedCart = await firstValueFrom(this.woocommerceService.addItemToWcCart(
        productId,
        quantity,
        undefined, // variationAttributes (Array von {attribute: string, value: string})
        variationId  // variationId (die spezifische ID der Produktvariation)
      ).pipe(
        catchError(err => {
          console.error('CartService: Error adding item to cart:', err);
          this.error.set('Fehler beim Hinzufügen zum Warenkorb.');
          return of(this.cart()); // Gibt den aktuellen Warenkorb-Status zurück, um UI konsistent zu halten
        })
      ));

      // Prüfen, ob updatedCart definiert ist, da `of(this.cart())` auch null sein kann, wenn cart initial null war
      if (updatedCart !== undefined) {
          this.cart.set(updatedCart);
      } else {
          console.warn('CartService: addItemToWcCart (or error fallback) resulted in undefined cart state.');
          // Optional: Fehler setzen oder bestehenden Warenkorb beibehalten, falls `of(this.cart())` undefined liefert.
          // Da `this.cart()` ein Signal ist, sollte es immer einen Wert (ggf. null) haben.
      }
    } catch (err) {
       // Sollte durch catchError in der Pipe abgefangen werden
       if (!this.error()) { this.error.set('Ein unbekannter Fehler beim Hinzufügen zum Warenkorb ist aufgetreten.'); }
       console.error('CartService: Uncaught error during addItem execution:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async updateItemQuantity(itemKey: string, quantity: number): Promise<void> {
    if (quantity <= 0) {
      await this.removeItem(itemKey);
      return;
    }
    console.log(`CartService: Attempting to update quantity for itemKey ${itemKey} to ${quantity}`);
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const updatedCart = await firstValueFrom(this.woocommerceService.updateWcCartItemQuantity(itemKey, quantity).pipe(
         catchError(err => {
           console.error('CartService: Error updating item quantity:', err);
           this.error.set('Menge konnte nicht aktualisiert werden.');
           return of(this.cart());
         })
      ));
      if (updatedCart !== undefined) { this.cart.set(updatedCart); }
    } catch (err) {
      if (!this.error()) { this.error.set('Ein unbekannter Fehler beim Aktualisieren der Menge ist aufgetreten.');}
      console.error('CartService: Uncaught error during updateItemQuantity execution:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async removeItem(itemKey: string): Promise<void> {
    console.log(`CartService: Attempting to remove itemKey ${itemKey}`);
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const updatedCart = await firstValueFrom(this.woocommerceService.removeWcCartItem(itemKey).pipe(
         catchError(err => {
           console.error('CartService: Error removing item from cart:', err);
           this.error.set('Artikel konnte nicht entfernt werden.');
           return of(this.cart());
         })
      ));
      if (updatedCart !== undefined) { this.cart.set(updatedCart); }
    } catch (err) {
      if (!this.error()) { this.error.set('Ein unbekannter Fehler beim Entfernen des Artikels ist aufgetreten.'); }
      console.error('CartService: Uncaught error during removeItem execution:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async clearCart(): Promise<void> {
    console.log(`CartService: Attempting to clear cart.`);
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const clearedCart = await firstValueFrom(this.woocommerceService.clearWcCart().pipe(
         catchError(err => {
           console.error('CartService: Error clearing cart:', err);
           this.error.set('Warenkorb konnte nicht geleert werden.');
           return of(this.cart());
         })
      ));
      this.cart.set(clearedCart ?? null); // Stellt sicher, dass cart auf null gesetzt wird, wenn API null zurückgibt
    } catch (err) {
       if (!this.error()) { this.error.set('Ein unbekannter Fehler beim Leeren des Warenkorbs ist aufgetreten.'); }
       console.error('CartService: Uncaught error during clearCart execution:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  // Methode zum manuellen Laden eines Warenkorbs über einen Token (z.B. von URL)
  async loadCartWithToken(token: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    console.log(`CartService: Attempting to load cart with token: ${token}`);
    this.isLoading.set(true);
    this.error.set(null);
    try {
        const loadedCart = await this.woocommerceService.loadCartFromToken(token);
        this.cart.set(loadedCart);
        console.log('CartService: Cart loaded with token:', loadedCart);
    } catch (error) {
        console.error('CartService: Error loading cart with token:', error);
        this.error.set('Warenkorb konnte mit dem Token nicht geladen werden.');
        this.cart.set(null); // Setze Cart auf null, da Laden fehlgeschlagen
    } finally {
        this.isLoading.set(false);
    }
  }
}