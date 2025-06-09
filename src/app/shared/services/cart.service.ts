// /src/app/shared/services/cart.service.ts
import { Injectable, signal, computed, inject, WritableSignal, Signal, OnDestroy, PLATFORM_ID, effect, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  WoocommerceService,
  WooCommerceStoreCart,
  WooCommerceStoreCartItem,
  WooCommerceStoreCartItemTotals,
  WooCommerceStoreCartTotals,
  WooCommerceProduct,
  WooCommerceProductVariation,
  WooCommerceImage,
  WooCommerceStoreCartItemImage,
  StageCartPayload,
  WooCommerceStoreAddress,
} from '../../core/services/woocommerce.service';
import { AuthService, WordPressUser } from './auth.service';
import { AccountService } from '../../features/account/services/account.service';
import { UserAddressesResponse } from '../../features/account/services/account.models';
import { Subscription, of, firstValueFrom, Observable, throwError } from 'rxjs';
import { catchError, tap, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { TranslocoService } from '@ngneat/transloco';

export interface UserCartData {
  items: UserCartItem[];
  updated_at: string | null;
}

export interface UserCartItem {
  product_id: number;
  quantity: number;
  variation_id?: number;
  name?: string;
  price?: string;
  images?: WooCommerceImage[];
  permalink?: string;
  totals?: WooCommerceStoreCartItemTotals;
}

@Injectable({
  providedIn: 'root'
})
export class CartService implements OnDestroy {
  private woocommerceService = inject(WoocommerceService);
  private authService = inject(AuthService);
  private http = inject(HttpClient);
  private translocoService = inject(TranslocoService);
  private platformId = inject(PLATFORM_ID);
  private accountService = inject(AccountService);
  private router = inject(Router);

  readonly cart: WritableSignal<WooCommerceStoreCart | null> = signal(null);
  private readonly userCartData: WritableSignal<UserCartData | null> = signal(null);
  readonly error: WritableSignal<string | null> = signal(null);
  private readonly currentUserId: WritableSignal<number | null> = signal(null);

  readonly isProcessing: WritableSignal<boolean> = signal(false);
  readonly isAddingItemId: WritableSignal<number | null> = signal(null);
  readonly isUpdatingItemKey: WritableSignal<string | null> = signal(null);
  readonly isClearingCart: WritableSignal<boolean> = signal(false);

  readonly cartItemCount: Signal<number> = computed(() => {
    const userId = this.currentUserId();
    if (userId) {
      const uCart = this.userCartData();
      return uCart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
    } else {
      const storeCart = this.cart();
      return storeCart?.items_count ?? 0;
    }
  });

  private authSubscription: Subscription | null = null;
  private ygeApiBaseUrl = 'https://your-garden-eden-4ujzpfm5qt.live-website.com/wp-json/your-garden-eden/v1';

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.subscribeToAuthState();
      effect(() => {
        const loggedInUserId = this.currentUserId();
        const currentUserCart = this.userCartData();
        untracked(() => {
          if (loggedInUserId) {
            this.mapUserCartToDisplayCart(currentUserCart);
          }
        });
      });
    }
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }

  public async initiateCheckout(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    this.isProcessing.set(true);
    this.error.set(null);

    const currentUser = this.authService.getCurrentUserValue();
    const currentCart = untracked(() => this.cart());

    if (!currentCart || this.cartItemCount() === 0) {
      this.error.set(this.translocoService.translate('cartPage.errors.emptyCartCheckout'));
      this.isProcessing.set(false);
      this.router.navigate(['/warenkorb']);
      return;
    }

    let billing_address: WooCommerceStoreAddress;
    let shipping_address: WooCommerceStoreAddress | undefined;

    try {
      if (currentUser) {
        const addresses = await firstValueFrom(this.accountService.getUserAddresses());
        billing_address = addresses.billing;
        shipping_address = addresses.shipping;
        billing_address.first_name = billing_address.first_name || currentUser.firstName || '';
        billing_address.last_name = billing_address.last_name || currentUser.lastName || '';
        billing_address.email = billing_address.email || currentUser.email;
      } else {
        this.router.navigate(['/checkout-details']);
        this.isProcessing.set(false);
        return;
      }

      const cartItemsForStaging = currentCart.items.map(item => ({
        product_id: item.parent_product_id || item.id,
        quantity: item.quantity,
        variation_id: item.id !== (item.parent_product_id || item.id) ? item.id : undefined
      }));

      const payload: StageCartPayload = {
        items: cartItemsForStaging,
        billing_address: billing_address,
        shipping_address: shipping_address
      };
      
      const stageResponse = await firstValueFrom(this.woocommerceService.stageCartForPopulation(payload));

      if (stageResponse?.success && stageResponse.token) {
        this.woocommerceService.clearLocalCartToken();
        window.location.href = this.woocommerceService.getCheckoutUrl(stageResponse.token);
      } else {
        throw new Error(stageResponse.message || 'Vorbereitung des Warenkorbs fehlgeschlagen.');
      }

    } catch (error: any) {
      console.error('[CartService] initiateCheckout: Error during process:', error);
      this.error.set(error.message || this.translocoService.translate('cartPage.errors.checkoutNotPossible'));
      this.isProcessing.set(false);
    }
  }

  private subscribeToAuthState(): void {
    this.authSubscription = this.authService.currentWordPressUser$.pipe(
      distinctUntilChanged((prev, curr) => prev?.id === curr?.id)
    ).subscribe(async (user: WordPressUser | null) => {
      const newUserId = user?.id ?? null;
      const previousUserId = this.currentUserId();
      this.currentUserId.set(newUserId);

      if (newUserId) {
        this.isProcessing.set(true);
        this.error.set(null);
        try {
          const localStoreApiCart = untracked(() => this.cart());
          const serverUserCart = await this._fetchUserCartFromServer();
          
          this.userCartData.set(serverUserCart ?? { items: [], updated_at: null });

          if (previousUserId === null && localStoreApiCart && localStoreApiCart.items_count > 0 && serverUserCart) {
            const mergedCart = this._mergeLocalAndServerCarts(localStoreApiCart, serverUserCart);
            const updatedServerCart = await this._updateUserCartOnServer(mergedCart);
            this.userCartData.set(updatedServerCart);
            this.woocommerceService.clearLocalCartToken();
            await firstValueFrom(this.woocommerceService.clearWcCart().pipe(catchError(() => of(null))));
          } else if (previousUserId === null && localStoreApiCart && localStoreApiCart.items_count > 0 && (!serverUserCart || serverUserCart.items.length === 0)) {
            const itemsToPush: UserCartItem[] = localStoreApiCart.items.map(item => {
                let variationId: number | undefined = undefined;
                if (item.parent_product_id && item.id !== item.parent_product_id) {
                   variationId = item.id;
                }
                return { product_id: item.parent_product_id || item.id, quantity: item.quantity, variation_id: variationId };
            });
            const cartToPush: UserCartData = { items: itemsToPush, updated_at: new Date().toISOString() };
            const pushedCart = await this._updateUserCartOnServer(cartToPush);
            this.userCartData.set(pushedCart);
            this.woocommerceService.clearLocalCartToken();
            await firstValueFrom(this.woocommerceService.clearWcCart().pipe(catchError(() => of(null))));
          }
        } catch (e) {
          console.error('[CartService] Error during user cart sync on login:', e);
          this.error.set(this.translocoService.translate('cartService.errorSyncingCart', {details: (e as Error).message || 'Unknown'}));
          this.userCartData.set(null);
        } finally {
          this.isProcessing.set(false);
        }
      } else {
        this.userCartData.set(null);
        await this.loadInitialStoreApiCart();
      }
    });
  }

  public async loadInitialStoreApiCart(): Promise<void> {
    if (this.currentUserId() || !isPlatformBrowser(this.platformId)) return;
    this.isProcessing.set(true); this.error.set(null);
    try {
      const fetchedCart = await firstValueFrom(this.woocommerceService.getWcCart().pipe(catchError(() => of(null))));
      this.cart.set(this._convertStoreApiPricesInCart(fetchedCart));
    } catch (err) {
      this.cart.set(null);
    } finally {
      this.isProcessing.set(false);
    }
  }

  async addItem(productId: number, quantity: number, variationId?: number): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    this.isAddingItemId.set(productId); this.error.set(null);
    try {
      if (this.currentUserId()) {
        await this._addUserCartItemToServer({ product_id: productId, quantity, variation_id: variationId });
      } else {
        await this._addStoreApiCartItem(productId, quantity, variationId);
      }
    } catch(err: any) {
      if(!this.error()) this.error.set(this.translocoService.translate('cartService.errorAddingItem', {details: err.message || 'Unknown'}));
      throw err;
    } finally {
      this.isAddingItemId.set(null);
    }
  }

  async updateItemQuantity(itemKeyOrProductId: string | number, quantity: number, variationId?: number): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (quantity <= 0) {
      await this.removeItem(itemKeyOrProductId, variationId); return;
    }
    const loadingKey = typeof itemKeyOrProductId === 'string' ? itemKeyOrProductId : `${itemKeyOrProductId}_${variationId || 0}`;
    this.isUpdatingItemKey.set(loadingKey); this.error.set(null);
    try {
      if (this.currentUserId() && typeof itemKeyOrProductId === 'number') {
        await this._addUserCartItemToServer({ product_id: itemKeyOrProductId, quantity, variation_id: variationId });
      } else if (!this.currentUserId() && typeof itemKeyOrProductId === 'string'){
        await this._updateStoreApiItemQuantity(itemKeyOrProductId, quantity);
      }
    } catch(err: any) {
      if(!this.error()) this.error.set(this.translocoService.translate('cartService.errorUpdatingQuantity', {details: err.message || 'Unknown'}));
      throw err;
    } finally {
      this.isUpdatingItemKey.set(null);
    }
  }

  async removeItem(itemKeyOrProductId: string | number, variationId?: number): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const loadingKey = typeof itemKeyOrProductId === 'string' ? itemKeyOrProductId : `${itemKeyOrProductId}_${variationId || 0}`;
    this.isUpdatingItemKey.set(loadingKey); this.error.set(null);
    try {
      if (this.currentUserId() && typeof itemKeyOrProductId === 'number') {
        await this._removeUserCartItemFromServer({ product_id: itemKeyOrProductId, variation_id: variationId });
      } else if (!this.currentUserId() && typeof itemKeyOrProductId === 'string') {
        await this._removeStoreApiCartItem(itemKeyOrProductId);
      }
    } catch(err: any) {
      if(!this.error()) this.error.set(this.translocoService.translate('cartService.errorRemovingItem', {details: err.message || 'Unknown'}));
      throw err;
    } finally {
      this.isUpdatingItemKey.set(null);
    }
  }

  public async clearCart(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    this.isClearingCart.set(true);
    this.error.set(null);
    try {
      if (this.currentUserId()) {
        await this._clearUserCartOnServer();
      } else {
        await this._clearStoreApiCart();
      }
    } catch (err: any) {
      if(!this.error()) this.error.set(this.translocoService.translate('cartService.errorClearingCart'));
      throw err;
    } finally {
      this.isClearingCart.set(false);
    }
  }

  public async handleSuccessfulOrder(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const userId = untracked(() => this.currentUserId()); 
    this.error.set(null);
    try {
      if (userId) {
        await this._clearUserCartOnServer();
      } else {
        await this._clearStoreApiCart();
        this.woocommerceService.clearLocalCartToken();
      }
    } catch(e) {
      console.error('[CartService] Error during handleSuccessfulOrder:', e);
      this.userCartData.set({items: [], updated_at: null});
      this.cart.set(null);
    }
  }
  
  private async _addStoreApiCartItem(productId: number, quantity: number, variationId?: number): Promise<void> {
    const updatedCart = await firstValueFrom(this.woocommerceService.addItemToWcCart(productId, quantity, undefined, variationId));
    this.cart.set(this._convertStoreApiPricesInCart(updatedCart));
  }
  private async _updateStoreApiItemQuantity(itemKey: string, quantity: number): Promise<void> {
    const updatedCart = await firstValueFrom(this.woocommerceService.updateWcCartItemQuantity(itemKey, quantity));
    this.cart.set(this._convertStoreApiPricesInCart(updatedCart));
  }
  private async _removeStoreApiCartItem(itemKey: string): Promise<void> {
    const updatedCart = await firstValueFrom(this.woocommerceService.removeWcCartItem(itemKey));
     this.cart.set(this._convertStoreApiPricesInCart(updatedCart));
  }
  private async _clearStoreApiCart(): Promise<void> {
    await firstValueFrom(this.woocommerceService.clearWcCart().pipe(
      catchError(err => {
        console.error("Error clearing Store API cart, but clearing UI anyway.", err);
        return of(null);
      })
    ));
    this.cart.set(null);
  }
  private _buildUrlWithJwt(endpoint: string): string {
    const token = this.authService.getStoredToken();
    if (!token) { throw new Error('User not authenticated for user cart operation.'); }
    return `${this.ygeApiBaseUrl}${endpoint}?JWT=${encodeURIComponent(token)}`;
  }
  private async _fetchUserCartFromServer(): Promise<UserCartData | null> {
    const url = this._buildUrlWithJwt('/cart');
    try {
      return await firstValueFrom(this.http.get<UserCartData>(url));
    } catch (e) {
      this.error.set(this.translocoService.translate('cartService.errorLoadingUserCart'));
      return null;
    }
  }
  private async _updateUserCartOnServer(cartData: UserCartData): Promise<UserCartData> {
    const url = this._buildUrlWithJwt('/cart');
    try {
      const payload = { items: cartData.items };
      return await firstValueFrom(this.http.post<UserCartData>(url, payload));
    } catch (e) {
      this.error.set(this.translocoService.translate('cartService.errorUpdatingUserCart'));
      throw e;
    }
  }
  private async _addUserCartItemToServer(item: {product_id: number, quantity: number, variation_id?: number}): Promise<void> {
    const url = this._buildUrlWithJwt('/cart/item');
    try {
      const updatedUserCart = await firstValueFrom(this.http.post<UserCartData>(url, item));
      this.userCartData.set(updatedUserCart);
    } catch (e) {
      this.error.set(this.translocoService.translate('cartService.errorAddingUserCartItem'));
      throw e;
    }
  }
  private async _removeUserCartItemFromServer(itemIdentifier: { product_id: number, variation_id?: number }): Promise<void> {
    const url = this._buildUrlWithJwt('/cart/item/remove');
    try {
      const updatedUserCart = await firstValueFrom(this.http.post<UserCartData>(url, itemIdentifier));
      this.userCartData.set(updatedUserCart);
    } catch (e) {
      this.error.set(this.translocoService.translate('cartService.errorRemovingUserCartItem'));
      throw e;
    }
  }
  private async _clearUserCartOnServer(): Promise<void> {
    const url = this._buildUrlWithJwt('/cart');
    try {
      await firstValueFrom(this.http.delete<{success: boolean, message: string}>(url));
      this.userCartData.set({ items: [], updated_at: new Date().toISOString() });
    } catch (e) {
      this.error.set(this.translocoService.translate('cartService.errorClearingUserCart'));
      throw e;
    }
  }
  private _mergeLocalAndServerCarts(localCart: WooCommerceStoreCart, serverCart: UserCartData): UserCartData {
    const mergedItemsMap = new Map<string, UserCartItem>();
    serverCart.items.forEach(item => { mergedItemsMap.set(`${item.product_id}_${item.variation_id || 0}`, { ...item }); });
    localCart.items.forEach(localItem => {
        let baseProductId = localItem.id;
        let variationIdLocal: number | undefined = undefined;
        if (localItem.parent_product_id && localItem.id !== localItem.parent_product_id) {
           variationIdLocal = localItem.id;
           baseProductId = localItem.parent_product_id;
        }
        const key = `${baseProductId}_${variationIdLocal || 0}`;
        mergedItemsMap.set(key, { product_id: baseProductId, quantity: localItem.quantity, variation_id: variationIdLocal }); 
    });
    return { items: Array.from(mergedItemsMap.values()), updated_at: new Date().toISOString() };
  }
  
  private async mapUserCartToDisplayCart(userCart: UserCartData | null): Promise<void> {
    if (!this.currentUserId() || !userCart) { 
      this.cart.set(null); 
      return; 
    }

    if (userCart.items.length === 0) {
      this.cart.set({ coupons: [], items: [], items_count: 0, items_weight: 0, needs_payment: false, needs_shipping: false, shipping_address: {}, billing_address: {}, totals: { currency_code: 'EUR', currency_symbol: '€', total_items:"0", total_items_tax:"0", total_price:"0", total_tax:"0", tax_lines: [] }, errors: [], has_calculated_shipping: false, shipping_rates: [], extensions: {} });
      return;
    }

    this.isProcessing.set(true);
    try {
      const displayItems: WooCommerceStoreCartItem[] = await Promise.all(
        userCart.items.map(async (uItem): Promise<WooCommerceStoreCartItem | null> => {
          let productDetails: WooCommerceProduct | null = null;
          let variationProductDetails: WooCommerceProductVariation | null = null;
          try {
              productDetails = await firstValueFrom(this.woocommerceService.getProductById(uItem.product_id));
              if (uItem.variation_id && productDetails?.type === 'variable') {
                  const variations = await firstValueFrom(this.woocommerceService.getProductVariations(uItem.product_id));
                  variationProductDetails = variations.find(v => v.id === uItem.variation_id) || null;
              }
          } catch (e) { return null; }

          const sourceForPrice = variationProductDetails || productDetails;
          const itemPrice = sourceForPrice?.price || "0";
          const lineSubtotalNumber = (parseFloat(itemPrice) || 0) * uItem.quantity;
          
          let image: WooCommerceStoreCartItemImage | undefined;
          if(variationProductDetails?.image) {
            image = { ...variationProductDetails.image, thumbnail: variationProductDetails.image.src, srcset: '', sizes: '' };
          } else if (productDetails?.images?.[0]) {
            image = { ...productDetails.images[0], thumbnail: productDetails.images[0].src, srcset: '', sizes: '' };
          }

          return {
            key: `${uItem.product_id}_${uItem.variation_id ?? 0}`,
            id: uItem.variation_id || uItem.product_id,
            quantity: uItem.quantity,
            name: productDetails?.name || `Produkt ${uItem.product_id}`,
            images: image ? [image] : [],
            prices: { price: itemPrice, regular_price: sourceForPrice?.regular_price || itemPrice, sale_price: sourceForPrice?.sale_price || itemPrice } as any,
            totals: { line_subtotal: lineSubtotalNumber.toFixed(2), line_total: lineSubtotalNumber.toFixed(2) } as WooCommerceStoreCartItemTotals,
            variation: variationProductDetails?.attributes?.map(attr => ({ attribute: attr.name, value: attr.option })) || [],
            parent_product_id: variationProductDetails ? productDetails?.id : undefined
          } as WooCommerceStoreCartItem;
        })
      ).then(items => items.filter((item): item is WooCommerceStoreCartItem => item !== null));
      
      const totalItemsQuantity = displayItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalPriceValueNumber = displayItems.reduce((sum, item) => sum + parseFloat(item.totals.line_total), 0);
      
      // *** HIER IST DER ENDGÜLTIGE FIX ***
      this.cart.set({
        items: displayItems,
        items_count: totalItemsQuantity,
        items_weight: 0,
        totals: { 
          total_price: totalPriceValueNumber.toFixed(2), 
          currency_code: 'EUR', 
          currency_symbol: '€', 
          // `total_items` muss die Summe der Preise sein, nicht die Anzahl.
          total_items: totalPriceValueNumber.toFixed(2), 
          total_items_tax: '0', // Diese werden bei eingeloggten Usern nicht separat berechnet
          total_tax: '0', 
          tax_lines: [] 
        },
        coupons: [], shipping_rates: [], shipping_address: {}, billing_address: {}, needs_payment: true, needs_shipping: true, has_calculated_shipping: false, errors: [], extensions: {}
      });
    } catch (e) {
      this.error.set(this.translocoService.translate('cartService.errorDisplayingUserCart'));
      this.cart.set(null);
    } finally {
      this.isProcessing.set(false);
    }
  }

  private _convertStoreApiPricesInCart(cart: WooCommerceStoreCart | null): WooCommerceStoreCart | null {
    if (!cart) return null;
    const newCart = JSON.parse(JSON.stringify(cart)) as WooCommerceStoreCart;

    const convertPricesInObject = <T extends { [key: string]: any }>(obj: T, priceKeys: (keyof T)[]): T => {
        if (!obj) return obj;
        const newObj = { ...obj };
        priceKeys.forEach(key => {
            if (newObj[key] !== undefined && newObj[key] !== null && typeof newObj[key] === 'string') {
                const numVal = parseFloat(newObj[key] as string);
                if (!isNaN(numVal)) {
                    (newObj as any)[key] = (numVal / 100).toString();
                }
            }
        });
        return newObj;
    };

    newCart.items.forEach((item: WooCommerceStoreCartItem) => {
      if (item.prices) item.prices = convertPricesInObject(item.prices, ['price', 'regular_price', 'sale_price']);
      if (item.prices?.price_range) item.prices.price_range = convertPricesInObject(item.prices.price_range, ['min_amount', 'max_amount']);
      if (item.totals) item.totals = convertPricesInObject(item.totals, ['line_subtotal', 'line_subtotal_tax', 'line_total', 'line_total_tax']);
    });
    if (newCart.totals) newCart.totals = convertPricesInObject(newCart.totals, ['total_items', 'total_items_tax', 'total_price', 'total_tax', 'total_shipping', 'total_shipping_tax', 'total_discount', 'total_discount_tax']);
    if (newCart.totals.tax_lines) newCart.totals.tax_lines.forEach(tl => { if (tl.price) tl.price = (parseFloat(tl.price)/100).toString(); });
    
    return newCart;
  }

  public async loadCartWithToken(token: string): Promise<void> {
    if (this.currentUserId() || !isPlatformBrowser(this.platformId)) return;
    this.isProcessing.set(true); this.error.set(null);
    try {
        const loadedCart = await this.woocommerceService.loadCartFromToken(token);
        this.cart.set(this._convertStoreApiPricesInCart(loadedCart));
    } catch (error) {
        this.error.set(this.translocoService.translate('cartService.errorLoadingCartWithToken'));
        this.cart.set(null);
    } finally {
        this.isProcessing.set(false);
    }
  }
}