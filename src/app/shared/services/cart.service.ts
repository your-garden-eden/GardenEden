// /src/app/shared/services/cart.service.ts
import { Injectable, signal, computed, inject, WritableSignal, Signal, OnDestroy, PLATFORM_ID, effect, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
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
} from '../../core/services/woocommerce.service';
import { AuthService, WordPressUser } from './auth.service';
import { Subscription, of, firstValueFrom, Observable, throwError } from 'rxjs';
import { catchError, tap, distinctUntilChanged, switchMap, map } from 'rxjs/operators';
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

  readonly cart: WritableSignal<WooCommerceStoreCart | null> = signal(null);
  private readonly userCartData: WritableSignal<UserCartData | null> = signal(null);
  readonly isLoading: WritableSignal<boolean> = signal(false);
  readonly error: WritableSignal<string | null> = signal(null);
  private readonly currentUserId: WritableSignal<number | null> = signal(null);

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
    console.log('[CartService] Constructor initializing.');
    if (isPlatformBrowser(this.platformId)) {
      console.log('[CartService] Platform is browser. Initializing cart and auth subscription.');
      this.subscribeToAuthState();
      effect(() => {
        const loggedInUserId = this.currentUserId();
        const currentUserCart = this.userCartData();
        
        console.log('[CartService Effect] Triggered. UserID:', loggedInUserId, 'UserCart:', currentUserCart ? `Items: ${currentUserCart.items.length}` : 'Null');
        
        untracked(() => {
          if (loggedInUserId) {
            this.mapUserCartToDisplayCart(currentUserCart);
          }
        });
      });
    } else {
      console.log('[CartService] Platform is not browser. Skipping client-side initializations.');
    }
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }

 private subscribeToAuthState(): void {
    this.authSubscription = this.authService.currentWordPressUser$.pipe(
      distinctUntilChanged((prev, curr) => prev?.id === curr?.id)
    ).subscribe(async (user: WordPressUser | null) => {
      const newUserId = user?.id ?? null;
      // +++ NEUER LOG +++
      console.log(`[CartService] Auth state received in subscribeToAuthState. User Object:`, user ? {...user, jwt: '***', refreshToken: '***'} : null, `New UserID: ${newUserId}`);
      const previousUserId = this.currentUserId();
      this.currentUserId.set(newUserId);

      if (newUserId) {
        console.log('[CartService] User is logged in. Attempting to load/sync user cart.');
        this.isLoading.set(true);
        this.error.set(null);
        try {
          const localStoreApiCart = untracked(() => this.cart());
          const serverUserCart = await this._fetchUserCartFromServer();
          
          this.userCartData.set(serverUserCart ?? { items: [], updated_at: null });

          if (previousUserId === null && localStoreApiCart && localStoreApiCart.items_count > 0 && serverUserCart) {
            console.log('[CartService] User just logged in. Both local anonymous cart and server cart exist. Merging...');
            const mergedCart = this._mergeLocalAndServerCarts(localStoreApiCart, serverUserCart);
            const updatedServerCart = await this._updateUserCartOnServer(mergedCart);
            this.userCartData.set(updatedServerCart);
            this.woocommerceService.clearLocalCartToken();
            await firstValueFrom(this.woocommerceService.clearWcCart().pipe(catchError(() => of(null))));
            console.log('[CartService] Carts merged and server updated. Local anonymous cart cleared.');
          } else if (previousUserId === null && localStoreApiCart && localStoreApiCart.items_count > 0 && (!serverUserCart || serverUserCart.items.length === 0)) {
            console.log('[CartService] User just logged in. Only local anonymous cart exists. Pushing to server.');
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
            console.log('[CartService] Local cart pushed to server. Local anonymous cart cleared.');
          } else if (serverUserCart && serverUserCart.items.length > 0) {
            console.log('[CartService] Server cart exists and will be used (or was already loaded).');
          } else {
            console.log('[CartService] No existing cart found for logged-in user, or server cart is empty. Initializing empty user cart.');
             this.userCartData.set({ items: [], updated_at: null });
             this.cart.set(null);
          }
        } catch (e) {
          console.error('[CartService] Error during user cart sync on login:', e);
          this.error.set(this.translocoService.translate('cartService.errorSyncingCart', {details: (e as Error).message || 'Unknown'}));
          this.userCartData.set(null);
        } finally {
          this.isLoading.set(false);
        }
      } else {
        console.log('[CartService] User is logged out or anonymous. Clearing user cart data and loading Store API cart.');
        this.userCartData.set(null);
        this.woocommerceService.clearLocalCartToken();
        await this.loadInitialStoreApiCart();
      }
    });
  }

  private _convertPricesInObject<T extends { [key: string]: any }>(obj: T, priceKeys: (keyof T)[]): T {
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
  }
  
  private _convertStoreApiPricesInCart(cart: WooCommerceStoreCart | null): WooCommerceStoreCart | null {
    if (!cart) return null;
    const newCart = JSON.parse(JSON.stringify(cart)) as WooCommerceStoreCart;

    newCart.items.forEach((item: WooCommerceStoreCartItem) => {
      if (item.prices) item.prices = this._convertPricesInObject(item.prices, ['price', 'regular_price', 'sale_price']);
      if (item.prices?.price_range) item.prices.price_range = this._convertPricesInObject(item.prices.price_range, ['min_amount', 'max_amount']);
      if (item.totals) item.totals = this._convertPricesInObject(item.totals, ['line_subtotal', 'line_subtotal_tax', 'line_total', 'line_total_tax']);
    });
    if (newCart.totals) newCart.totals = this._convertPricesInObject(newCart.totals, ['total_items', 'total_items_tax', 'total_price', 'total_tax', 'total_shipping', 'total_shipping_tax', 'total_discount', 'total_discount_tax']);
    if (newCart.totals.tax_lines) newCart.totals.tax_lines.forEach(tl => { if (tl.price) tl.price = (parseFloat(tl.price)/100).toString(); });
    
    return newCart;
  }

  public async loadInitialStoreApiCart(): Promise<void> {
    if (this.currentUserId()) {
      console.log('[CartService] User is logged in, skipping Store API cart load. User cart is handled by auth state.');
      return;
    }
    if (!isPlatformBrowser(this.platformId)) return;
    console.log('[CartService] Attempting to load initial STORE API cart (anonymous user)...');
    this.isLoading.set(true); this.error.set(null);
    try {
      const fetchedCart = await firstValueFrom(this.woocommerceService.getWcCart().pipe(
         catchError(err => {
           this.error.set(this.translocoService.translate('cartService.errorLoadingCart'));
           return of(null);
         })
      ));
      this.cart.set(this._convertStoreApiPricesInCart(fetchedCart));
    } catch (err) {
      this.cart.set(null);
      if (!this.error()) this.error.set(this.translocoService.translate('cartService.errorUnknown'));
    } finally {
      this.isLoading.set(false);
    }
  }

  async addItem(productId: number, quantity: number, variationId?: number): Promise<void> {
    // +++ NEUER LOG +++
    console.log(`[CartService addItem] Called. Current UserID at decision point: ${this.currentUserId()}, ProductID: ${productId}, Quantity: ${quantity}, VariationID: ${variationId}`);
    if (!isPlatformBrowser(this.platformId)) return;
    this.isLoading.set(true); this.error.set(null);
    try {
      if (this.currentUserId()) {
        // +++ NEUER LOG +++
        console.log('[CartService addItem] User IS LOGGED IN. Calling _addUserCartItemToServer (Custom API).');
        await this._addUserCartItemToServer({ product_id: productId, quantity, variation_id: variationId });
      } else {
        // +++ NEUER LOG +++
        console.log('[CartService addItem] User IS ANONYMOUS or currentUserId is null. Calling _addStoreApiCartItem (Store API).');
        await this._addStoreApiCartItem(productId, quantity, variationId);
      }
    } catch(err: any) {
      if(!this.error()) this.error.set(this.translocoService.translate('cartService.errorAddingItem', {details: err.message || 'Unknown'}));
       console.error('[CartService] Error in addItem dispatcher:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async updateItemQuantity(itemKeyOrProductId: string | number, quantity: number, variationId?: number): Promise<void> {
    // +++ NEUER LOG (optional, aber konsistent) +++
    console.log(`[CartService updateItemQuantity] Called. UserID: ${this.currentUserId()}, Identifier: ${itemKeyOrProductId}, Qty: ${quantity}, VarID: ${variationId}`);
    if (!isPlatformBrowser(this.platformId)) return;
    if (quantity <= 0) {
      await this.removeItem(itemKeyOrProductId, variationId); return;
    }
    this.isLoading.set(true); this.error.set(null);
    try {
      if (this.currentUserId() && typeof itemKeyOrProductId === 'number') {
        console.log('[CartService updateItemQuantity] User IS LOGGED IN. Calling _addUserCartItemToServer (Custom API for update).');
        await this._addUserCartItemToServer({ product_id: itemKeyOrProductId, quantity, variation_id: variationId });
      } else if (!this.currentUserId() && typeof itemKeyOrProductId === 'string'){
        console.log('[CartService updateItemQuantity] User IS ANONYMOUS. Calling _updateStoreApiItemQuantity (Store API).');
        await this._updateStoreApiItemQuantity(itemKeyOrProductId, quantity);
      } else {
        console.error('Invalid parameters for updateItemQuantity based on login state:', {itemKeyOrProductId, quantity, variationId, userId: this.currentUserId()});
        throw new Error('Invalid parameters for updateItemQuantity');
      }
    } catch(err: any) {
      if(!this.error()) this.error.set(this.translocoService.translate('cartService.errorUpdatingQuantity', {details: err.message || 'Unknown'}));
      console.error('[CartService] Error in updateItemQuantity dispatcher:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async removeItem(itemKeyOrProductId: string | number, variationId?: number): Promise<void> {
    // +++ NEUER LOG (optional, aber konsistent) +++
    console.log(`[CartService removeItem] Called. UserID: ${this.currentUserId()}, Identifier: ${itemKeyOrProductId}, VarID: ${variationId}`);
    if (!isPlatformBrowser(this.platformId)) return;
    this.isLoading.set(true); this.error.set(null);
    try {
      if (this.currentUserId() && typeof itemKeyOrProductId === 'number') {
        console.log('[CartService removeItem] User IS LOGGED IN. Calling _removeUserCartItemFromServer (Custom API).');
        await this._removeUserCartItemFromServer({ product_id: itemKeyOrProductId, variation_id: variationId });
      } else if (!this.currentUserId() && typeof itemKeyOrProductId === 'string') {
        console.log('[CartService removeItem] User IS ANONYMOUS. Calling _removeStoreApiCartItem (Store API).');
        await this._removeStoreApiCartItem(itemKeyOrProductId);
      } else {
        console.error('Invalid parameters for removeItem based on login state:', {itemKeyOrProductId, variationId, userId: this.currentUserId()});
        throw new Error('Invalid parameters for removeItem');
      }
    } catch(err: any) {
      if(!this.error()) this.error.set(this.translocoService.translate('cartService.errorRemovingItem', {details: err.message || 'Unknown'}));
      console.error('[CartService] Error in removeItem dispatcher:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async clearCart(): Promise<void> {
    // +++ NEUER LOG (optional) +++
    console.log(`[CartService clearCart] Called. UserID: ${this.currentUserId()}`);
    if (!isPlatformBrowser(this.platformId)) return;
    this.isLoading.set(true); this.error.set(null);
    try {
      if (this.currentUserId()) {
        console.log('[CartService clearCart] User IS LOGGED IN. Calling _clearUserCartOnServer (Custom API).');
        await this._clearUserCartOnServer();
      } else {
        console.log('[CartService clearCart] User IS ANONYMOUS. Calling _clearStoreApiCart (Store API).');
        await this._clearStoreApiCart();
      }
    } catch(err: any) {
      if(!this.error()) this.error.set(this.translocoService.translate('cartService.errorClearingCart', {details: err.message || 'Unknown'}));
      console.error('[CartService] Error in clearCart dispatcher:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async _addStoreApiCartItem(productId: number, quantity: number, variationId?: number): Promise<void> {
    const updatedCart = await firstValueFrom(this.woocommerceService.addItemToWcCart(productId, quantity, undefined, variationId)
      .pipe(catchError(err => {
        this.error.set(this.translocoService.translate('cartService.errorAddingItemApi'));
        return of(this.cart());
      }))
    );
    if (updatedCart !== undefined) this.cart.set(this._convertStoreApiPricesInCart(updatedCart));
  }

  private async _updateStoreApiItemQuantity(itemKey: string, quantity: number): Promise<void> {
    const updatedCart = await firstValueFrom(this.woocommerceService.updateWcCartItemQuantity(itemKey, quantity)
      .pipe(catchError(err => {
        this.error.set(this.translocoService.translate('cartService.errorUpdatingQuantityApi'));
        return of(this.cart());
      }))
    );
    if (updatedCart !== undefined) this.cart.set(this._convertStoreApiPricesInCart(updatedCart));
  }

  private async _removeStoreApiCartItem(itemKey: string): Promise<void> {
    const updatedCart = await firstValueFrom(this.woocommerceService.removeWcCartItem(itemKey)
      .pipe(catchError(err => {
        this.error.set(this.translocoService.translate('cartService.errorRemovingItemApi'));
        return of(this.cart());
      }))
    );
     if (updatedCart !== undefined) this.cart.set(this._convertStoreApiPricesInCart(updatedCart));
  }

  private async _clearStoreApiCart(): Promise<void> {
    const clearedCart = await firstValueFrom(this.woocommerceService.clearWcCart()
      .pipe(catchError(err => {
        this.error.set(this.translocoService.translate('cartService.errorClearingCartApi'));
        return of(this.cart());
      }))
    );
    this.cart.set(this._convertStoreApiPricesInCart(clearedCart ?? null));
  }

  private _buildUrlWithJwt(endpoint: string): string {
    const token = this.authService.getStoredToken();
    if (!token) {
      console.error("[CartService] Attempted to build URL with JWT, but no token found.");
      throw new Error('User not authenticated for user cart operation.');
    }
    return `${this.ygeApiBaseUrl}${endpoint}?JWT=${encodeURIComponent(token)}`;
  }

  private async _fetchUserCartFromServer(): Promise<UserCartData | null> {
    const url = this._buildUrlWithJwt('/cart');
    try {
      const cartData = await firstValueFrom(this.http.get<UserCartData>(url));
      return cartData;
    } catch (e) {
      this.error.set(this.translocoService.translate('cartService.errorLoadingUserCart', {details: (e as Error).message || 'Unknown'}));
      return null;
    }
  }

  private async _updateUserCartOnServer(cartData: UserCartData): Promise<UserCartData> {
    const url = this._buildUrlWithJwt('/cart');
    try {
      const payload = { items: cartData.items };
      const updatedCart = await firstValueFrom(this.http.post<UserCartData>(url, payload));
      return updatedCart;
    } catch (e) {
      this.error.set(this.translocoService.translate('cartService.errorUpdatingUserCart', {details: (e as Error).message || 'Unknown'}));
      throw e;
    }
  }
  
  private async _addUserCartItemToServer(item: {product_id: number, quantity: number, variation_id?: number}): Promise<void> {
    const url = this._buildUrlWithJwt('/cart/item');
    try {
      const updatedUserCart = await firstValueFrom(this.http.post<UserCartData>(url, item));
      this.userCartData.set(updatedUserCart);
    } catch (e) {
      this.error.set(this.translocoService.translate('cartService.errorAddingUserCartItem', {details: (e as Error).message || 'Unknown'}));
    }
  }

  private async _removeUserCartItemFromServer(itemIdentifier: { product_id: number, variation_id?: number }): Promise<void> {
    const url = this._buildUrlWithJwt('/cart/item/remove');
    try {
      const updatedUserCart = await firstValueFrom(this.http.post<UserCartData>(url, itemIdentifier));
      this.userCartData.set(updatedUserCart);
    } catch (e) {
      this.error.set(this.translocoService.translate('cartService.errorRemovingUserCartItem', {details: (e as Error).message || 'Unknown'}));
    }
  }

  private async _clearUserCartOnServer(): Promise<void> {
    const url = this._buildUrlWithJwt('/cart');
    try {
      await firstValueFrom(this.http.delete<{success: boolean, message: string}>(url));
      this.userCartData.set({ items: [], updated_at: new Date().toISOString() });
    } catch (e) {
      this.error.set(this.translocoService.translate('cartService.errorClearingUserCart', {details: (e as Error).message || 'Unknown'}));
    }
  }

  private _mergeLocalAndServerCarts(localCart: WooCommerceStoreCart, serverCart: UserCartData): UserCartData {
    const mergedItemsMap = new Map<string, UserCartItem>();

    serverCart.items.forEach(item => {
        const key = `${item.product_id}_${item.variation_id || 0}`;
        mergedItemsMap.set(key, { ...item });
    });

    localCart.items.forEach(localItem => {
        let baseProductId = localItem.id;
        let variationIdLocal: number | undefined = undefined;
        if (localItem.parent_product_id && localItem.id !== localItem.parent_product_id) {
           variationIdLocal = localItem.id;
           baseProductId = localItem.parent_product_id;
        }
        const key = `${baseProductId}_${variationIdLocal || 0}`;
        
        const newItemData: UserCartItem = {
            product_id: baseProductId,
            quantity: localItem.quantity, 
            variation_id: variationIdLocal
        };
        mergedItemsMap.set(key, newItemData); 
    });
    return { items: Array.from(mergedItemsMap.values()), updated_at: new Date().toISOString() };
  }
  
  private async mapUserCartToDisplayCart(userCart: UserCartData | null): Promise<void> {
    if (!this.currentUserId()) {
      if (this.cart() !== null) this.cart.set(null);
      return;
    }
    if (!userCart) {
      if (this.cart() !== null) this.cart.set(null);
      console.log('[CartService] mapUserCartToDisplayCart: User cart is null, setting display cart to null.');
      return;
    }

    this.isLoading.set(true);
    console.log('[CartService] mapUserCartToDisplayCart: START - Mapping user cart:', JSON.parse(JSON.stringify(userCart)));

    try {
      if (userCart.items.length === 0) {
        this.cart.set({
          coupons: [], items: [], items_count: 0, items_weight: 0, needs_payment: false, needs_shipping: false,
          shipping_address: {}, billing_address: {},
          totals: { 
            currency_code: 'EUR', currency_symbol: '€', total_items:"0", total_items_tax:"0",
            total_price:"0", total_tax:"0", tax_lines: []
          },
          errors: [], has_calculated_shipping: false, shipping_rates: [], extensions: {}
        });
        console.log('[CartService] mapUserCartToDisplayCart: Mapped empty user cart to display cart.');
        this.isLoading.set(false);
        return;
      }

      const displayItems: WooCommerceStoreCartItem[] = await Promise.all(
        userCart.items.map(async (uItem): Promise<WooCommerceStoreCartItem> => {
          let productDetails: WooCommerceProduct | null = null;
          let variationProductDetails: WooCommerceProductVariation | null = null;

          try {
              productDetails = await firstValueFrom(this.woocommerceService.getProductById(uItem.product_id));
              if (uItem.variation_id && productDetails && productDetails.type === 'variable') {
                  const variations = await firstValueFrom(this.woocommerceService.getProductVariations(uItem.product_id));
                  variationProductDetails = variations.find(v => v.id === uItem.variation_id) || null;
              }
          } catch (e) { console.warn(`[CartService Map] Could not fetch product/variation details for P_ID ${uItem.product_id}, V_ID ${uItem.variation_id}`, e); }

          const isVariation = !!variationProductDetails;
          const itemName = productDetails?.name || uItem.name || `Produkt ${uItem.product_id}`; 
          const itemShortDescription = productDetails?.short_description || (isVariation && variationProductDetails ? variationProductDetails.description : productDetails?.description) || '';
          const itemDescription = (isVariation && variationProductDetails ? variationProductDetails.description : productDetails?.description) || '';
          const itemSku = (isVariation && variationProductDetails ? variationProductDetails.sku : productDetails?.sku) || '';
          const itemPermalink = (isVariation && variationProductDetails ? variationProductDetails.permalink : productDetails?.permalink) || '';
          
          const itemStoreImages: WooCommerceStoreCartItemImage[] = [];
          let sourceImageForStoreItem: WooCommerceImage | null = null; 
          if (isVariation && variationProductDetails?.image) {
            sourceImageForStoreItem = variationProductDetails.image;
          } else if (productDetails?.images && productDetails.images.length > 0) {
            sourceImageForStoreItem = productDetails.images[0];
          }

          if (sourceImageForStoreItem) {
            itemStoreImages.push({
                id: sourceImageForStoreItem.id, src: sourceImageForStoreItem.src,
                thumbnail: sourceImageForStoreItem.src, srcset: '', sizes: '',  
                name: sourceImageForStoreItem.name, alt: sourceImageForStoreItem.alt,
            });
          }

          const itemPriceFromCoreApi = variationProductDetails?.price || productDetails?.price || "0";
          const regularPriceFromCoreApi = variationProductDetails?.regular_price || productDetails?.regular_price || itemPriceFromCoreApi;
          const salePriceFromCoreApi = variationProductDetails?.sale_price || productDetails?.sale_price || itemPriceFromCoreApi;

          const itemPriceNumber = parseFloat(itemPriceFromCoreApi);
          const lineSubtotalNumber = !isNaN(itemPriceNumber) ? itemPriceNumber * uItem.quantity : 0;

          const itemTotals: WooCommerceStoreCartItemTotals = {
              line_subtotal: lineSubtotalNumber.toFixed(2),
              line_subtotal_tax: "0", 
              line_total: lineSubtotalNumber.toFixed(2),
              line_total_tax: "0",    
              currency_code: "EUR", currency_symbol:"€", currency_minor_unit:2,
              currency_decimal_separator:",", currency_thousand_separator:".", currency_prefix:"", currency_suffix:" €"
          };

          const pricesForDisplay = { 
            price: itemPriceFromCoreApi, 
            regular_price: regularPriceFromCoreApi, 
            sale_price: salePriceFromCoreApi,
            price_range: null, 
            currency_code: 'EUR'
          };

          return {
            key: `${uItem.product_id}_${uItem.variation_id ?? 0}`,
            id: uItem.variation_id || uItem.product_id,
            quantity: uItem.quantity,
            name: itemName,
            short_description: itemShortDescription,
            description: itemDescription,
            sku: itemSku,
            permalink: itemPermalink,
            images: itemStoreImages, 
            variation: variationProductDetails?.attributes?.map((attr: {name:string, option:string}) => ({ attribute: attr.name, value: attr.option })) || [],
            item_data: [],
            prices: pricesForDisplay, 
            totals: itemTotals, 
            parent_product_id: productDetails && variationProductDetails ? productDetails.id : undefined,
            low_stock_remaining: (isVariation && variationProductDetails ? variationProductDetails.low_stock_amount : productDetails?.low_stock_amount) ?? null,
            backorders_allowed: (isVariation && variationProductDetails ? variationProductDetails.backorders_allowed : productDetails?.backorders_allowed) ?? false,
            show_backorder_badge: productDetails?.backorders_allowed && productDetails?.stock_status === 'onbackorder',
            sold_individually: (isVariation && variationProductDetails ? (variationProductDetails as any).sold_individually : productDetails?.sold_individually) ?? false,
            catalog_visibility: productDetails?.catalog_visibility || 'visible',
          };
        })
      );

      const totalItemsQuantity = displayItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalPriceValueNumber = displayItems.reduce((sum, item) => {
          const lineTotalNum = parseFloat(item.totals.line_total);
          return sum + (isNaN(lineTotalNum) ? 0 : lineTotalNum);
      }, 0);

      const displayCartTotals: WooCommerceStoreCartTotals = {
          currency_code: 'EUR', currency_symbol: '€',
          total_items: totalItemsQuantity.toString(),
          total_items_tax: "0",
          total_price: totalPriceValueNumber.toFixed(2), 
          total_tax: "0",
          tax_lines: []
      };

      this.cart.set({
        coupons: [], items: displayItems, items_count: totalItemsQuantity, items_weight: 0,
        needs_payment: true, needs_shipping: true, shipping_address: {}, billing_address: {},
        totals: displayCartTotals,
        errors: [], has_calculated_shipping: false, shipping_rates: [], extensions: {}
      });
      console.log('[CartService] mapUserCartToDisplayCart: FINISHED - Mapped user cart to display cart structure:', JSON.parse(JSON.stringify(this.cart())));
    } catch (e) {
      this.error.set(this.translocoService.translate('cartService.errorDisplayingUserCart', {details: (e as Error).message || 'Unknown'}));
      this.cart.set(null);
       console.error('[CartService] mapUserCartToDisplayCart: Error during mapping:', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  public async loadCartWithToken(token: string): Promise<void> {
    if (this.currentUserId()) {
      console.warn("[CartService] loadCartWithToken called while user is logged in. This is not expected. User cart will be prioritized.");
      return;
    }
    if (!isPlatformBrowser(this.platformId)) return;
    this.isLoading.set(true); this.error.set(null);
    try {
        const loadedCart = await this.woocommerceService.loadCartFromToken(token);
        this.cart.set(this._convertStoreApiPricesInCart(loadedCart));
    } catch (error) {
        this.error.set(this.translocoService.translate('cartService.errorLoadingCartWithToken'));
        this.cart.set(null);
    } finally {
        this.isLoading.set(false);
    }
  }

  public clearLocalCartStateForCheckout(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    console.log('[CartService] Clearing local UI cart state (this.cart signal). User cart data remains if logged in.');
    this.cart.set(null);
    this.error.set(null);
  }
}