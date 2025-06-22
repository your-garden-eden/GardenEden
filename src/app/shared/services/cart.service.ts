// /src/app/shared/services/cart.service.ts
import { Injectable, signal, computed, inject, WritableSignal, Signal, OnDestroy, PLATFORM_ID, effect, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  WoocommerceService,
  WooCommerceStoreCart,
  WooCommerceStoreCartItem,
  WooCommerceStoreCartTotals,
  StageCartPayload,
  WooCommerceStoreAddress,
  WooCommerceStoreCartCoupon,
  WooCommerceProduct,
} from '../../core/services/woocommerce.service';
import { AuthService, WordPressUser } from './auth.service';
import { AccountService } from '../../features/account/services/account.service';
import { Subscription, of, firstValueFrom, Observable, throwError } from 'rxjs';
import { catchError, tap, distinctUntilChanged, switchMap, map } from 'rxjs/operators';
import { TranslocoService } from '@ngneat/transloco';

export interface ExtendedCartItem extends WooCommerceStoreCartItem {
  slug?: string;
  prices: WooCommerceStoreCartItem['prices'] & {
    line_regular_price?: string;
  }
}
export interface ExtendedWooCommerceStoreCart extends Omit<WooCommerceStoreCart, 'items'> {
  items: ExtendedCartItem[];
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

  readonly cart: WritableSignal<ExtendedWooCommerceStoreCart | null> = signal(null);
  readonly error: WritableSignal<string | null> = signal(null);

  readonly isProcessing: WritableSignal<boolean> = signal(false);
  readonly isAddingItemId: WritableSignal<number | null> = signal(null);
  readonly isUpdatingItemKey: WritableSignal<string | null> = signal(null);
  readonly isClearingCart: WritableSignal<boolean> = signal(false);
  readonly isApplyingCoupon: WritableSignal<boolean> = signal(false);

  readonly cartItemCount: Signal<number> = computed(() => this.cart()?.items_count ?? 0);
  readonly cartTotals: Signal<WooCommerceStoreCartTotals | null> = computed(() => this.cart()?.totals ?? null);
  readonly cartItems: Signal<ExtendedCartItem[]> = computed(() => this.cart()?.items ?? []);

  private authSubscription: Subscription | null = null;
  private ygeApiBaseUrl = 'https://your-garden-eden-4ujzpfm5qt.live-website.com/wp-json/your-garden-eden/v1';

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.subscribeToAuthState();
    }
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }
  
  private async setProcessedCart(fetchedCart: WooCommerceStoreCart | null): Promise<void> {
    if (!fetchedCart) {
      this.cart.set(null);
      return;
    }
    const convertedCart = this._processAndConvertCart(fetchedCart);
    const enrichedCart = await this._enrichCartItemsWithSlugs(convertedCart);
    this.cart.set(enrichedCart);
  }

  private subscribeToAuthState(): void {
    this.authSubscription = this.authService.currentWordPressUser$.pipe(
      distinctUntilChanged((prev, curr) => prev?.id === curr?.id)
    ).subscribe(async (user: WordPressUser | null) => {
      await this.loadInitialStoreApiCart();
    });
  }

  public async loadInitialStoreApiCart(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    this.isProcessing.set(true); this.error.set(null);
    try {
      const fetchedCart = await firstValueFrom(this.woocommerceService.getWcCart());
      await this.setProcessedCart(fetchedCart);
    } catch (err) {
      this.cart.set(null);
      this.error.set(this.translocoService.translate('cartService.errorLoadingCart'));
      console.error('[CartService] Error loading initial cart:', err);
    } finally {
      this.isProcessing.set(false);
    }
  }

  async addItem(productId: number, quantity: number, variationId?: number): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    this.isAddingItemId.set(variationId || productId); this.error.set(null);
    try {
      const updatedCart = await firstValueFrom(this.woocommerceService.addItemToWcCart(productId, quantity, undefined, variationId));
      await this.setProcessedCart(updatedCart);
    } catch(err: any) {
      this.error.set(err.message || this.translocoService.translate('cartService.errorAddingItem'));
      throw err;
    } finally {
      this.isAddingItemId.set(null);
    }
  }

  async updateItemQuantity(itemKey: string, quantity: number): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (quantity <= 0) {
      await this.removeItem(itemKey); return;
    }
    this.isUpdatingItemKey.set(itemKey); this.error.set(null);
    try {
      const updatedCart = await firstValueFrom(this.woocommerceService.updateWcCartItemQuantity(itemKey, quantity));
      await this.setProcessedCart(updatedCart);
    } catch(err: any) {
      this.error.set(err.message || this.translocoService.translate('cartService.errorUpdatingQuantity'));
      throw err;
    } finally {
      this.isUpdatingItemKey.set(null);
    }
  }

  async removeItem(itemKey: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    this.isUpdatingItemKey.set(itemKey); this.error.set(null);
    try {
      const updatedCart = await firstValueFrom(this.woocommerceService.removeWcCartItem(itemKey));
      await this.setProcessedCart(updatedCart);
    } catch(err: any) {
      this.error.set(err.message || this.translocoService.translate('cartService.errorRemovingItem'));
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
      await firstValueFrom(this.woocommerceService.clearWcCart().pipe(catchError(() => of(null))));
      this.cart.set(null);
    } catch (err: any) {
      this.error.set(this.translocoService.translate('cartService.errorClearingCart'));
      throw err;
    } finally {
      this.isClearingCart.set(false);
    }
  }
  
  public async applyCoupon(code: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !code) return;
    this.isApplyingCoupon.set(true);
    this.error.set(null);
    try {
      const url = `${this.ygeApiBaseUrl}/cart/apply-coupon`;
      const body = { code };
      const updatedCart = await firstValueFrom(
        this.woocommerceService.proxyRequest<WooCommerceStoreCart>(url, body)
      );
      await this.setProcessedCart(updatedCart);
    } catch (err: any) {
      const errorMessage = err.error?.message || this.translocoService.translate('cartService.errorApplyingCoupon');
      this.error.set(errorMessage);
      console.error('[CartService] applyCoupon error:', err);
      throw new Error(errorMessage);
    } finally {
      this.isApplyingCoupon.set(false);
    }
  }
  
  public async removeCoupon(code: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !code) return;
    this.isApplyingCoupon.set(true);
    this.error.set(null);
    try {
      const url = `${this.ygeApiBaseUrl}/cart/remove-coupon`;
      const body = { code };
       const updatedCart = await firstValueFrom(
        this.woocommerceService.proxyRequest<WooCommerceStoreCart>(url, body)
      );
      await this.setProcessedCart(updatedCart);
    } catch (err: any) {
      const errorMessage = err.error?.message || this.translocoService.translate('cartService.errorRemovingCoupon');
      this.error.set(errorMessage);
      console.error('[CartService] removeCoupon error:', err);
      throw new Error(errorMessage);
    } finally {
      this.isApplyingCoupon.set(false);
    }
  }
  
  public async updateCustomerAddresses(billing: Partial<WooCommerceStoreAddress>, shipping: Partial<WooCommerceStoreAddress>): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const updatedCart = await firstValueFrom(this.woocommerceService.updateWcCustomer({
        billing_address: billing,
        shipping_address: shipping
      }));
      await this.setProcessedCart(updatedCart);
    } catch (err: any) {
       console.error('[CartService] Error updating customer addresses:', err);
       this.error.set(err.message || 'Error updating addresses.');
       throw err;
    }
  }

  public getCartToken(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    return this.woocommerceService.getLocalCartToken();
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
    
    if (!currentUser) {
      this.router.navigate(['/checkout-details']);
      this.isProcessing.set(false);
      return;
    }

    try {
      const addresses = await firstValueFrom(this.accountService.getUserAddresses());
      const billing_address = this._prepareAddress(addresses.billing, currentUser);
      const shipping_address = this._prepareAddress(addresses.shipping, currentUser);

      const couponCodes = currentCart.coupons.map(c => c.code).join(',');

      const payload: StageCartPayload = {
        items: currentCart.items.map(item => ({
          product_id: item.parent_product_id || item.id,
          quantity: item.quantity,
          variation_id: item.id !== (item.parent_product_id || item.id) ? item.id : undefined
        })),
        billing_address: billing_address,
        shipping_address: shipping_address,
        coupon_code: couponCodes || undefined
      };

      const stageResponse = await firstValueFrom(this.woocommerceService.stageCartForPopulation(payload));

      if (stageResponse?.success && stageResponse.token) {
        // NEU START: Der JWT des Benutzers wird an die URL-Generierung übergeben
        window.location.href = this.woocommerceService.getCheckoutUrl(stageResponse.token, currentUser.jwt);
        // NEU ENDE
      } else {
        throw new Error(stageResponse.message || 'Vorbereitung des Warenkorbs fehlgeschlagen.');
      }

    } catch (error: any) {
      console.error('[CartService] initiateCheckout: Error during process:', error);
      this.error.set(error.message || this.translocoService.translate('cartPage.errors.checkoutNotPossible'));
      this.isProcessing.set(false);
    }
  }

  public async handleSuccessfulOrder(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    this.error.set(null);
    try {
      await this.clearCart();
      this.woocommerceService.clearLocalCartToken();
    } catch(e) {
      console.error('[CartService] Error during handleSuccessfulOrder:', e);
      this.cart.set(null);
    }
  }
  
  public async loadCartWithToken(token: string): Promise<void> {
    const isLoggedIn = this.authService.getCurrentUserValue() !== null;
    if (isLoggedIn || !isPlatformBrowser(this.platformId)) return;
    this.isProcessing.set(true); this.error.set(null);
    try {
      const loadedCart = await this.woocommerceService.loadCartFromToken(token);
      await this.setProcessedCart(loadedCart);
    } catch (error) {
      this.error.set(this.translocoService.translate('cartService.errorLoadingCartWithToken'));
      this.cart.set(null);
    } finally {
      this.isProcessing.set(false);
    }
  }

  private _prepareAddress(address: WooCommerceStoreAddress, user: WordPressUser): WooCommerceStoreAddress {
    return {
      ...address,
      first_name: address.first_name || user.firstName || '',
      last_name: address.last_name || user.lastName || '',
      email: address.email || user.email
    };
  }
  
  private async _enrichCartItemsWithSlugs(cart: ExtendedWooCommerceStoreCart | null): Promise<ExtendedWooCommerceStoreCart | null> {
    if (!cart || !cart.items || cart.items.length === 0) {
      return cart;
    }
    const productIds = Array.from(new Set(cart.items.map(item => item.parent_product_id || item.id)));
    if (productIds.length === 0) {
      return cart;
    }
    try {
      const productsData = await firstValueFrom(this.woocommerceService.getProductsByIds(productIds));
      const slugMap = new Map<number, string>();
      productsData.forEach(product => { slugMap.set(product.id, product.slug); });
      cart.items.forEach(item => {
        const productId = item.parent_product_id || item.id;
        if (slugMap.has(productId)) { item.slug = slugMap.get(productId); }
      });
    } catch (error) {
      console.error("[CartService] Failed to enrich cart items with slugs:", error);
    }
    return cart;
  }
  
  private _processAndConvertCart(cart: WooCommerceStoreCart): ExtendedWooCommerceStoreCart {
    const newCart: ExtendedWooCommerceStoreCart = JSON.parse(JSON.stringify(cart));
    const minorUnit = newCart.totals.currency_minor_unit ?? 2;
    const convert = (value: string | undefined | null): string => {
      if (!value) return "0.00";
      return (parseFloat(value) / (10 ** minorUnit)).toFixed(minorUnit);
    };
    newCart.items.forEach((item: ExtendedCartItem) => {
      item.prices.price = convert(item.prices.price);
      item.prices.regular_price = convert(item.prices.regular_price);
      item.prices.sale_price = convert(item.prices.sale_price);
      item.totals.line_total = convert(item.totals.line_total);
      item.totals.line_subtotal = convert(item.totals.line_subtotal);
      item.totals.line_total_tax = convert(item.totals.line_total_tax);
    });
    newCart.totals.total_items = convert(newCart.totals.total_items);
    newCart.totals.total_price = convert(newCart.totals.total_price);
    newCart.totals.total_discount = convert(newCart.totals.total_discount);
    newCart.totals.total_tax = convert(newCart.totals.total_tax);
    newCart.totals.total_shipping = convert(newCart.totals.total_shipping);
    newCart.totals.total_shipping_tax = convert(newCart.totals.total_shipping_tax);
    if (newCart.coupons) {
      newCart.coupons.forEach((coupon: WooCommerceStoreCartCoupon) => {
         if (coupon.totals) {
            coupon.totals.total_discount = convert(coupon.totals.total_discount!);
            coupon.totals.total_discount_tax = convert(coupon.totals.total_discount_tax!);
         }
      });
    }
    return newCart;
  }
}