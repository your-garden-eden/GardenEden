import { Injectable, signal, computed, inject, WritableSignal, Signal, OnDestroy, PLATFORM_ID, effect, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription, of, firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TranslocoService } from '@ngneat/transloco';

import { AuthService, WordPressUser } from './auth.service';
import { WoocommerceService, WooCommerceProduct, WooCommerceProductVariation } from '../../core/services/woocommerce.service';
import { WishlistData, WishlistItem, DisplayWishlistItem } from './wishlist.models';

@Injectable({
  providedIn: 'root'
})
export class WishlistService implements OnDestroy {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private woocommerceService = inject(WoocommerceService);
  private translocoService = inject(TranslocoService);
  private platformId = inject(PLATFORM_ID);

  // --- Private State Signals ---
  private readonly rawWishlistData: WritableSignal<WishlistData | null> = signal(null);

  // --- Public State Signals ---
  readonly displayWishlist: WritableSignal<DisplayWishlistItem[]> = signal([]);
  readonly isLoading: WritableSignal<boolean> = signal(false);
  readonly error: WritableSignal<string | null> = signal(null);

  readonly wishlistProductIds: Signal<Set<string>> = computed(() => {
    const data = this.rawWishlistData();
    const ids = new Set<string>();
    if (data?.items) {
      for (const item of data.items) {
        ids.add(`${item.product_id}_${item.variation_id || 0}`);
      }
    }
    return ids;
  });

  readonly wishlistItemCount: Signal<number> = computed(() => this.wishlistProductIds().size);

  private authSubscription: Subscription | null = null;
  private ygeApiBaseUrl = 'https://your-garden-eden-4ujzpfm5qt.live-website.com/wp-json/your-garden-eden/v1';

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.subscribeToAuthState();

      effect(() => {
        const data = this.rawWishlistData();
        untracked(() => this._mapWishlistToDisplayItems(data));
      });
    }
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }

  private subscribeToAuthState(): void {
    this.authSubscription = this.authService.currentWordPressUser$.subscribe((user: WordPressUser | null) => {
      if (user) {
        console.log('[WishlistService] User logged in. Loading wishlist from server.');
        this._loadWishlistFromServer();
      } else {
        console.log('[WishlistService] User logged out. Clearing wishlist data.');
        this.rawWishlistData.set(null);
        this.displayWishlist.set([]);
        this.error.set(null);
      }
    });
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.getStoredToken();
    if (!token) {
      throw new Error('Nicht authentifiziert: Kein Token gefunden.');
    }
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  private async _loadWishlistFromServer(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const headers = this.getAuthHeaders();
      const url = `${this.ygeApiBaseUrl}/wishlist`;
      const wishlistData = await firstValueFrom(this.http.get<WishlistData>(url, { headers }));
      this.rawWishlistData.set(wishlistData);
    } catch (e) {
      console.error('[WishlistService] Error loading wishlist:', e);
      this.error.set(this.translocoService.translate('wishlist.errors.load'));
      this.rawWishlistData.set(null);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async _mapWishlistToDisplayItems(wishlistData: WishlistData | null): Promise<void> {
    if (!wishlistData || wishlistData.items.length === 0) {
      this.displayWishlist.set([]);
      return;
    }

    this.isLoading.set(true);
    try {
      const displayItems: DisplayWishlistItem[] = await Promise.all(
        wishlistData.items.map(async (item): Promise<DisplayWishlistItem | null> => {
          try {
            const productDetails = await firstValueFrom(this.woocommerceService.getProductById(item.product_id));
            let variationDetails: WooCommerceProductVariation | undefined;

            if (item.variation_id && productDetails?.type === 'variable') {
              const variations = await firstValueFrom(this.woocommerceService.getProductVariations(item.product_id));
              variationDetails = variations.find(v => v.id === item.variation_id);
            }
            return { ...item, productDetails, variationDetails };
          } catch (e) {
            console.error(`[WishlistService] Could not fetch details for product ID ${item.product_id}`, e);
            return null;
          }
        })
      ).then(items => items.filter((item): item is DisplayWishlistItem => item !== null));

      this.displayWishlist.set(displayItems);
    } catch (e) {
      this.error.set(this.translocoService.translate('wishlist.errors.display'));
      this.displayWishlist.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  public async addToWishlist(productId: number, variationId?: number): Promise<void> {
    if (!this.authService.getStoredToken()) {
      this.error.set(this.translocoService.translate('wishlist.errors.notLoggedIn'));
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    try {
      const headers = this.getAuthHeaders();
      const url = `${this.ygeApiBaseUrl}/wishlist/item/add`;
      const payload = { product_id: productId, variation_id: variationId };
      const updatedWishlist = await firstValueFrom(this.http.post<WishlistData>(url, payload, { headers }));
      this.rawWishlistData.set(updatedWishlist);
    } catch (e) {
      console.error('[WishlistService] Error adding to wishlist:', e);
      this.error.set(this.translocoService.translate('wishlist.errors.add'));
    } finally {
      this.isLoading.set(false);
    }
  }

  public async removeFromWishlist(productId: number, variationId?: number): Promise<void> {
    if (!this.authService.getStoredToken()) {
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    try {
      const headers = this.getAuthHeaders();
      const url = `${this.ygeApiBaseUrl}/wishlist/item/remove`;
      const payload = { product_id: productId, variation_id: variationId };
      const updatedWishlist = await firstValueFrom(this.http.post<WishlistData>(url, payload, { headers }));
      this.rawWishlistData.set(updatedWishlist);
    } catch (e) {
      console.error('[WishlistService] Error removing from wishlist:', e);
      this.error.set(this.translocoService.translate('wishlist.errors.remove'));
    } finally {
      this.isLoading.set(false);
    }
  }

  // HIER IST DIE KORREKTUR: Neue Methode zum Leeren der gesamten Wunschliste
  public async clearWishlist(): Promise<void> {
    if (!this.authService.getStoredToken()) {
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    try {
      const headers = this.getAuthHeaders();
      const url = `${this.ygeApiBaseUrl}/wishlist`;
      await firstValueFrom(this.http.delete(url, { headers }));
      // UI direkt und optimistisch aktualisieren
      this.rawWishlistData.set({ items: [] });
    } catch (e) {
      console.error('[WishlistService] Error clearing wishlist:', e);
      // Den Fehler an die UI weitergeben. Wir haben auch einen neuen Übersetzungsschlüssel.
      this.error.set(this.translocoService.translate('wishlist.errors.clearAll'));
    } finally {
      this.isLoading.set(false);
    }
  }
}