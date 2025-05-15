// /src/app/shared/services/cart.service.ts
import { Injectable, signal, computed, inject, WritableSignal, Signal, OnDestroy, PLATFORM_ID } from '@angular/core'; // PLATFORM_ID importiert
import { isPlatformBrowser } from '@angular/common';
import { WoocommerceService, WooCommerceProduct, WooCommerceStoreCart, WooCommerceStoreCartItem } from '../../core/services/woocommerce.service'; // WooCommerceStoreCart etc. hier importieren
import { AuthService } from './auth.service';
import { Subscription, of, firstValueFrom } from 'rxjs'; // firstValueFrom importiert, of war schon da
import { catchError, tap } from 'rxjs/operators';

// WooCommerceCart und WooCommerceCartItem Interfaces werden jetzt aus woocommerce.service bezogen
// export interface WooCommerceCartItem { ... } // Entfernt
// export interface WooCommerceCart { ... } // Entfernt

@Injectable({
  providedIn: 'root'
})
export class CartService implements OnDestroy {
  private woocommerceService = inject(WoocommerceService);
  private authService = inject(AuthService);
  private platformId = inject(PLATFORM_ID); // Korrekt injiziert

  readonly cart: WritableSignal<WooCommerceStoreCart | null> = signal(null); // Typ auf WooCommerceStoreCart geändert
  readonly isLoading: WritableSignal<boolean> = signal(false);
  readonly error: WritableSignal<string | null> = signal(null);
  readonly cartItemCount: Signal<number> = computed(() => this.cart()?.items_count ?? 0); // Angepasst an WooCommerceStoreCart

  private authSubscription: Subscription | null = null;
  private currentUserId: WritableSignal<string | null> = signal(null);

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
      this.currentUserId.set(newUserId);
      console.log(`CartService: User changed to ${newUserId}. Reloading cart from server.`);
      this.loadInitialCartFromServer();
    });
  }

  private async loadInitialCartFromServer(): Promise<void> {
    console.log('CartService: Attempting to load cart from server...');
    this.isLoading.set(true);
    this.error.set(null);
    try {
      // firstValueFrom wird verwendet, um das Observable in ein Promise umzuwandeln
      const fetchedCart = await firstValueFrom(this.woocommerceService.getWcCart().pipe(
         catchError(err => {
           console.error('Error fetching initial cart:', err);
           this.error.set('Warenkorb konnte nicht geladen werden.');
           return of(null);
         })
      ));
      this.cart.set(fetchedCart);
      console.log('CartService: Initial cart loaded/set:', fetchedCart);
    } catch (err) {
      // Fehlerbehandlung ist schon in der Pipe
      console.error('CartService: Uncaught error during loadInitialCartFromServer', err);
      this.cart.set(null); // Sicherstellen, dass cart null ist bei Fehler
    } finally {
      this.isLoading.set(false);
    }
  }

  async addItem(productId: number, quantity: number, variationId?: number): Promise<void> {
    console.log(`CartService: Attempting to add item - ProductID: ${productId}, Quantity: ${quantity}, VariationID: ${variationId}`);
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const updatedCart = await firstValueFrom(this.woocommerceService.addItemToWcCart(productId, quantity, variationId).pipe(
        catchError(err => {
          console.error('Error adding item to cart:', err);
          this.error.set('Fehler beim Hinzufügen zum Warenkorb.');
          return of(this.cart());
        })
      ));
      if (updatedCart !== undefined) { // Prüfen, ob nicht undefined, null ist okay für leeren cart
          this.cart.set(updatedCart);
      } else {
          // Fall, wenn addItemToWcCart undefined zurückgibt (sollte nicht passieren, wenn pipe richtig ist)
          console.warn('CartService: addItemToWcCart returned undefined, cart not updated.');
      }
    } catch (err) {
       if (!this.error()) { this.error.set('Fehler beim Hinzufügen zum Warenkorb.'); }
       console.error('CartService: Uncaught error during addItem', err);
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
           console.error('Error updating item quantity:', err);
           this.error.set('Menge konnte nicht aktualisiert werden.');
           return of(this.cart());
         })
      ));
      if (updatedCart !== undefined) { this.cart.set(updatedCart); }
    } catch (err) {
      if (!this.error()) { this.error.set('Menge konnte nicht aktualisiert werden.');}
      console.error('CartService: Uncaught error during updateItemQuantity', err);
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
           console.error('Error removing item from cart:', err);
           this.error.set('Artikel konnte nicht entfernt werden.');
           return of(this.cart());
         })
      ));
      if (updatedCart !== undefined) { this.cart.set(updatedCart); }
    } catch (err) {
      if (!this.error()) { this.error.set('Artikel konnte nicht entfernt werden.'); }
      console.error('CartService: Uncaught error during removeItem', err);
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
           console.error('Error clearing cart:', err);
           this.error.set('Warenkorb konnte nicht geleert werden.');
           return of(this.cart()); // Behalte alten Cart-Status bei Fehler
         })
      ));
      this.cart.set(clearedCart ?? null);
    } catch (err) {
       if (!this.error()) { this.error.set('Warenkorb konnte nicht geleert werden.'); }
       console.error('CartService: Uncaught error during clearCart', err);
    } finally {
      this.isLoading.set(false);
    }
  }
}