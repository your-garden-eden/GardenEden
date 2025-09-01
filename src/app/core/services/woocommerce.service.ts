// /src/app/core/services/woocommerce.service.ts (FINALE, KORRIGIERTE VERSION)
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject, PLATFORM_ID, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, throwError, of, from, Subscription, firstValueFrom } from 'rxjs';
import { catchError, map, tap, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../shared/services/auth.service';

// --- Interfaces (unverändert) ---
export interface WooCommerceImage { id: number; date_created: string; date_created_gmt: string; date_modified: string; date_modified_gmt: string; src: string; name: string; alt: string; position?: number; }
export interface WooCommerceCategoryRef { id: number; name: string; slug: string; }
export interface WooCommerceTagRef { id: number; name: string; slug: string; }
export interface WooCommerceAttribute { id: number; name: string; slug?: string; position: number; visible: boolean; variation: boolean; options: string[]; }
export interface WooCommerceDefaultAttribute { id: number; name: string; option: string; }
export interface WooCommerceProductDimension { length: string; width: string; height: string; }
export interface WooCommerceMetaData { id?: number; key: string; value: any; }
export interface WooCommerceProduct { id: number; name: string; slug: string; permalink: string; date_created: string; date_created_gmt: string; date_modified: string; date_modified_gmt: string; type: 'simple' | 'variable' | 'grouped' | 'external'; status: 'publish' | 'pending' | 'draft' | 'private' | 'future' | 'trash'; featured: boolean; catalog_visibility: 'visible' | 'catalog' | 'search' | 'hidden'; description: string; short_description: string; sku: string; price: string; regular_price: string; sale_price: string; price_html?: string; date_on_sale_from: string | null; date_on_sale_from_gmt: string | null; date_on_sale_to: string | null; date_on_sale_to_gmt: string | null; on_sale: boolean; purchasable: boolean; total_sales: number; virtual: boolean; downloadable: boolean; downloads?: any[]; download_limit?: number; download_expiry?: number; external_url?: string; button_text?: string; tax_status: 'taxable' | 'shipping' | 'none'; tax_class?: string; manage_stock: boolean; stock_quantity: number | null; stock_status: 'instock' | 'outofstock' | 'onbackorder'; backorders: 'no' | 'notify' | 'yes'; backorders_allowed: boolean; backordered: boolean; low_stock_amount: number | null; sold_individually: boolean; weight: string | null; dimensions: WooCommerceProductDimension; shipping_required: boolean; shipping_taxable: boolean; shipping_class?: string; shipping_class_id: number; reviews_allowed: boolean; average_rating: string; rating_count: number; related_ids: number[]; upsell_ids: number[]; cross_sell_ids: number[]; parent_id: number; purchase_note?: string; categories: WooCommerceCategoryRef[]; tags: WooCommerceTagRef[]; images: WooCommerceImage[]; attributes: WooCommerceAttribute[]; default_attributes: WooCommerceDefaultAttribute[]; variations: number[]; grouped_products?: number[]; menu_order: number; meta_data: WooCommerceMetaData[]; }
export interface WooCommerceProductVariation { id: number; date_created: string; date_created_gmt: string; date_modified: string; date_modified_gmt: string; description: string; permalink: string; sku: string; price: string; regular_price: string; sale_price: string; price_html?: string; date_on_sale_from: string | null; date_on_sale_from_gmt: string | null; date_on_sale_to: string | null; date_on_sale_to_gmt: string | null; on_sale: boolean; status: 'publish' | 'private' | 'draft'; purchasable: boolean; virtual: boolean; downloadable: boolean; downloads?: any[]; download_limit?: number; download_expiry?: number; tax_status: 'taxable' | 'shipping' | 'none' | 'parent'; tax_class?: string; manage_stock: boolean; stock_quantity: number | null; stock_status: 'instock' | 'outofstock' | 'onbackorder'; backorders: 'no' | 'notify' | 'yes'; backorders_allowed: boolean; backordered: boolean; low_stock_amount: number | null; weight: string | null; dimensions: WooCommerceProductDimension; shipping_class?: string; shipping_class_id: number; image: WooCommerceImage | null; attributes: { id: number; name: string; slug?: string; option: string; }[]; menu_order: number; meta_data: WooCommerceMetaData[]; }
export interface WooCommerceCategory { id: number; name: string; slug: string; parent: number; description: string; display: 'default' | 'products' | 'subcategories' | 'both'; image: WooCommerceImage | null; menu_order: number; count: number; }
export interface WooCommerceProductsResponse { products: WooCommerceProduct[]; totalPages: number; totalCount: number; }
export interface WooCommerceStoreCartItemImage { id: number; src: string; thumbnail: string; srcset: string; sizes: string; name: string; alt: string; }
export interface WooCommerceStoreCartItemTotals { line_subtotal: string; line_subtotal_tax: string; line_total: string; line_total_tax: string; currency_code: string; currency_symbol: string; currency_minor_unit: number; currency_decimal_separator: string; currency_thousand_separator: string; currency_prefix: string; currency_suffix: string; }
export interface WooCommerceStoreCartItem { key: string; id: number; quantity: number; name: string; short_description?: string; description?: string; sku?: string; low_stock_remaining?: number | null; backorders_allowed?: boolean; show_backorder_badge?: boolean; sold_individually?: boolean; permalink?: string; images: WooCommerceStoreCartItemImage[]; variation: { attribute: string; value: string }[]; item_data?: any[]; prices?: { price: string; regular_price: string; sale_price: string; price_range: null | { min_amount: string; max_amount: string }; currency_code: string; }; totals: WooCommerceStoreCartItemTotals; catalog_visibility?: string; parent_product_id?: number; }
export interface WooCommerceStoreCartTotals { total_items: string; total_items_tax: string; total_price: string; total_tax: string; total_shipping?: string; total_shipping_tax?: string; total_discount?: string; total_discount_tax?: string; currency_code: string; currency_symbol: string; currency_minor_unit: number; tax_lines?: { name: string; price: string; rate: string }[]; }
export interface WooCommerceStoreCartCoupon { code: string; discount_type: string; totals: WooCommerceStoreCartTotals; }
export interface WooCommerceProductVariationAttribute { attribute: string; value: string; }
export interface WooCommerceStoreAddress { first_name?: string; last_name?: string; company?: string; address_1?: string; address_2?: string; city?: string; state?: string; postcode?: string; country?: string; email?: string; phone?: string; [key: string]: any; }
export interface WooCommerceStoreShippingRate { rate_id: string; name: string; description?: string; delivery_time?: { value: string; unit: string; }; price: string; taxes: string; method_id: string; instance_id?: number; meta_data?: WooCommerceMetaData[]; selected?: boolean; currency_code?: string; currency_symbol?: string; }
export interface WooCommerceStoreShippingPackage { package_id: string; name: string; destination: WooCommerceStoreAddress; items: Array<{ key: string; name: string; quantity: number; }>; shipping_rates: WooCommerceStoreShippingRate[]; }
export interface WooCommerceStoreCart { coupons: WooCommerceStoreCartCoupon[]; shipping_rates: WooCommerceStoreShippingPackage[]; shipping_address: WooCommerceStoreAddress; billing_address: WooCommerceStoreAddress; items: WooCommerceStoreCartItem[]; items_count: number; items_weight: number; needs_payment: boolean; needs_shipping: boolean; has_calculated_shipping: boolean; totals: WooCommerceStoreCartTotals; errors?: any[]; _links?: any; extensions?: object; }
export interface StageCartPayload { items: { product_id: number; quantity: number; variation_id?: number; }[]; billing_address: WooCommerceStoreAddress; shipping_address?: WooCommerceStoreAddress; coupon_code?: string; }
export interface StageCartResponse { success: boolean; token: string; message?: string; expires_in: number; }
export interface OrderDetailsLineItem { id: number; name: string; product_id: number; quantity: number; total: string; image_url: string | null; }
export interface OrderDetails { id: number; order_key: string; order_number: string; status: string; date_created: string; total: string; currency: string; payment_method_title: string; billing_address: string; shipping_address: string; line_items: OrderDetailsLineItem[]; }
export interface WooCommerceCountry { code: string; name: string; }

@Injectable({
  providedIn: 'root',
})
export class WoocommerceService implements OnDestroy {
  private http = inject(HttpClient);
  private platformId: object = inject(PLATFORM_ID);
  private authService = inject(AuthService);

  private backendBaseUrl = environment.woocommerce.apiUrl.split('/wc/v3/')[0];
  private proxyApiUrlV3 = `${this.backendBaseUrl}/your-garden-eden/v1/wc-proxy/`;
  private storeApiUrl = `${environment.woocommerce.storeUrl}/wp-json/wc/store/v1`;
  private storeUrl = environment.woocommerce.storeUrl;

  private _storeApiNonce: string | null = null;
  private _cartToken: string | null = null;
  private readonly CART_TOKEN_STORAGE_KEY = 'wc_cart_token';

  // Shared observable for in-flight WC token requests.
  private wcTokenRequest$: Observable<{ cartToken: string | null, nonce: string | null }> | null = null;

  private guestTokenRefreshedSub: Subscription | null = null;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this._cartToken = localStorage.getItem(this.CART_TOKEN_STORAGE_KEY);
      // No eager initialization. Tokens will be fetched lazily when first needed.
      
      this.guestTokenRefreshedSub = this.authService.guestTokenRefreshed$.subscribe(() => {
        console.log('[WC_SERVICE] Guest token was refreshed. Clearing old WC store tokens.');
        this.clearLocalCartToken();
        // No need to re-initialize here. The next call that requires tokens will trigger the fetch.
      });
    }
  }

  ngOnDestroy(): void {
    this.guestTokenRefreshedSub?.unsubscribe();
  }

  private getStoreApiHeaders(customHeaders?: { [header: string]: string | string[] }): HttpHeaders {
    let headers = new HttpHeaders().set('Content-Type', 'application/json');
    if (this._cartToken) {
      headers = headers.set('Cart-Token', this._cartToken);
    }
    const authToken = this.authService.activeJwt();
    if(authToken) {
      if (!headers.has('Authorization')) {
        headers = headers.set('Authorization', `Bearer ${authToken}`);
      }
    }
    if (this._storeApiNonce) {
      headers = headers.set('X-WC-Store-API-Nonce', this._storeApiNonce);
    }
    if (customHeaders) {
      Object.keys(customHeaders).forEach(key => {
        headers = headers.set(key, customHeaders[key]);
      });
    }
    return headers;
  }

  private updateTokensFromResponse(response: HttpResponse<any>, requestUrlForLog: string = 'N/A'): void {
    const cartTokenHeaderKey = 'Cart-Token';
    const nonceHeaderKey = 'X-WC-Store-API-Nonce';
    
    const newCartToken: string | null = response.headers.get(cartTokenHeaderKey);
    if (newCartToken && newCartToken.trim() !== '') {
      if (newCartToken !== this._cartToken) {
        this._cartToken = newCartToken.trim();
        if (isPlatformBrowser(this.platformId)) { localStorage.setItem(this.CART_TOKEN_STORAGE_KEY, this._cartToken); }
      }
    } 

    const newNonce: string | null = response.headers.get(nonceHeaderKey);
    if (newNonce && newNonce.trim() !== '') {
      if (newNonce !== this._storeApiNonce) {
        this._storeApiNonce = newNonce.trim();
      }
    }
  }

  private ensureTokensPresent$(): Observable<{ cartToken: string | null, nonce: string | null }> {
    if (!isPlatformBrowser(this.platformId)) {
      return throwError(() => new Error('Token operations are not supported on non-browser platforms.'));
    }

    // If a token request is already in flight, return it.
    if (this.wcTokenRequest$) {
      return this.wcTokenRequest$;
    }

    // If tokens are already present and valid, return them as an observable.
    if (this._cartToken && this._storeApiNonce) {
      return of({ cartToken: this._cartToken, nonce: this._storeApiNonce });
    }

    // Otherwise, create a new token request.
    const requestUrl = `${this.storeApiUrl}/cart`;
    const initialHeaders = this.getStoreApiHeaders();

    this.wcTokenRequest$ = this.http.get<WooCommerceStoreCart>(requestUrl, { headers: initialHeaders, observe: 'response', withCredentials: true }).pipe(
      tap(response => {
        this.updateTokensFromResponse(response, `GET ${requestUrl} (initial token fetch)`);
      }),
      map(() => ({ cartToken: this._cartToken, nonce: this._storeApiNonce })),
      catchError((err: any) => {
        console.warn(`[WC_SERVICE] ensureTokensPresent$: Error during GET ${requestUrl}. Status: ${err.status}`, err);
        if (err.status === 403 || err.status === 401 || (err.error?.code && (err.error.code.includes('cart_token_invalid') || err.error.code.includes('nonce_invalid')))) {
          this.clearLocalCartToken(); // This will also nullify wcTokenRequest$
        } else {
          // On other errors, just nullify the request to allow retries.
          this.wcTokenRequest$ = null;
        }

        // Still update tokens from error response headers if they exist
        if (err.headers) {
          this.updateTokensFromResponse(err as HttpResponse<any>, `ERROR ${requestUrl} (token fetch)`);
        }

        // Propagate a non-fatal value to allow call chains to continue gracefully if needed
        return of({ cartToken: this._cartToken, nonce: this._storeApiNonce });
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    return this.wcTokenRequest$;
  }

  private buildProxyUrl(endpoint: string): string {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    return `${this.proxyApiUrlV3}${cleanEndpoint}`;
  }

  getProducts( categoryId?: number, perPage: number = 10, page: number = 1, otherParams?: HttpParams ): Observable<WooCommerceProductsResponse> {
    let params = new HttpParams()
      .set('per_page', perPage.toString())
      .set('page', page.toString())
      // --- NEU: BEGINN - Problem 2 Behebung ---
      // Stellt sicher, dass nur veröffentlichte Produkte abgefragt werden.
      .set('status', 'publish');
      // --- NEU: ENDE ---
      
    if (categoryId) { 
      params = params.set('category', categoryId.toString()); 
    }
    params = this.appendParams(params, otherParams);
    
    const requestUrl = this.buildProxyUrl('products');
    
    return this.http.get<WooCommerceProduct[]>(requestUrl, { params, observe: 'response' })
      .pipe(
          map((res: HttpResponse<WooCommerceProduct[]>) => {
            return { products: res.body || [], totalPages: parseInt(res.headers.get('x-wp-totalpages') || '0', 10), totalCount: parseInt(res.headers.get('x-wp-total') || '0', 10) };
          }),
          catchError(this.handleError)
      );
  }

  getProductById(productId: number): Observable<WooCommerceProduct> {
    const requestUrl = this.buildProxyUrl(`products/${productId}`);
    return this.http.get<WooCommerceProduct>(requestUrl).pipe(catchError(this.handleError));
  }

  getProductBySlug(productSlug: string): Observable<WooCommerceProduct | undefined> {
    const params = new HttpParams().set('slug', productSlug).set('status', 'publish');
    const requestUrl = this.buildProxyUrl('products');
    return this.http.get<WooCommerceProduct[]>(requestUrl, { params }).pipe(map(p => p && p.length > 0 ? p[0] : undefined), catchError(this.handleError));
  }
  
  getProductsByIds(productIds: number[]): Observable<WooCommerceProduct[]> {
    if (!productIds || productIds.length === 0) {
      return of([]);
    }
    const params = new HttpParams()
      .set('include', productIds.join(','))
      .set('per_page', productIds.length.toString())
      .set('status', 'publish');
      
    const requestUrl = this.buildProxyUrl('products');
    
    return this.http.get<WooCommerceProduct[]>(requestUrl, { params }).pipe(
      catchError(this.handleError)
    );
  }

  getProductVariations(productId: number): Observable<WooCommerceProductVariation[]> {
    const params = new HttpParams().set('per_page', '100');
    const requestUrl = this.buildProxyUrl(`products/${productId}/variations`);
    return this.http.get<WooCommerceProductVariation[]>(requestUrl, { params }).pipe(catchError(this.handleError));
  }

  getCategories(parentId?: number, otherParams?: HttpParams): Observable<WooCommerceCategory[]> {
    let params = new HttpParams();
    if (parentId !== undefined) { 
      params = params.set('parent', parentId.toString()); 
    }
    if (!otherParams || !otherParams.has('hide_empty')) { 
      params = params.set('hide_empty', 'true');
    }
    params = this.appendParams(params, otherParams);
    const requestUrl = this.buildProxyUrl('products/categories');
    return this.http.get<WooCommerceCategory[]>(requestUrl, { params }).pipe(catchError(this.handleError));
  }

  getCategoryBySlug(categorySlug: string): Observable<WooCommerceCategory | undefined> {
    const params = new HttpParams().set('slug', categorySlug);
    const requestUrl = this.buildProxyUrl('products/categories');
    return this.http.get<WooCommerceCategory[]>(requestUrl, { params }).pipe(map(c => c && c.length > 0 ? c[0] : undefined), catchError(this.handleError));
  }

  public getWcCart(): Observable<WooCommerceStoreCart | null> {
    if (!isPlatformBrowser(this.platformId)) { return of(null); }
    const requestUrl = `${this.storeApiUrl}/cart`;
    return this.ensureTokensPresent$().pipe(
      switchMap(() => {
        const headers = this.getStoreApiHeaders();
        return this.http.get<WooCommerceStoreCart>(requestUrl, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, `GET ${requestUrl}`)),
      map(res => res.body),
      catchError(err => {
        if (err.status === 404 && err.error?.code === 'woocommerce_rest_cart_empty') return of(null);
        if (err.status === 403 && err.error?.code?.includes('cart_token_invalid')) { this.clearLocalCartToken(); return of(null); }
        return this.handleError(err);
      })
    );
  }

  public addItemToWcCart(productId: number, quantity: number, variationAttributes?: WooCommerceProductVariationAttribute[], variationId?: number): Observable<WooCommerceStoreCart | null> {
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart operations are not supported on non-browser platform.'));
    return this.ensureTokensPresent$().pipe(
      switchMap(() => {
        const headers = this.getStoreApiHeaders(); 
        const requestUrl = `${this.storeApiUrl}/cart/add-item`;
        let body: any = { quantity };
        if (variationId) { body.id = variationId; }
        else if (variationAttributes && variationAttributes.length > 0) { body.id = productId; body.variation = variationAttributes; }
        else { body.id = productId; }
        return this.http.post<WooCommerceStoreCart>(requestUrl, body, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, 'POST /cart/add-item')),
      map(res => res.body),
      catchError(this.handleError)
    );
  }

  public updateWcCartItemQuantity(itemKey: string, quantity: number): Observable<WooCommerceStoreCart | null> {
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart operations are not supported on non-browser platform.'));
    return this.ensureTokensPresent$().pipe(
      switchMap(() => {
        const headers = this.getStoreApiHeaders(); const body = { key: itemKey, quantity };
        return this.http.post<WooCommerceStoreCart>(`${this.storeApiUrl}/cart/update-item`, body, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, 'POST /cart/update-item')),
      map(res => res.body),
      catchError(this.handleError)
    );
  }

  public removeWcCartItem(itemKey: string): Observable<WooCommerceStoreCart | null> {
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart operations are not supported on non-browser platform.'));
    return this.ensureTokensPresent$().pipe(
      switchMap(() => {
        const headers = this.getStoreApiHeaders(); const body = { key: itemKey };
        return this.http.post<WooCommerceStoreCart>(`${this.storeApiUrl}/cart/remove-item`, body, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, 'POST /cart/remove-item')),
      map(res => res.body),
      catchError(this.handleError)
    );
  }
  
  public clearWcCart(): Observable<WooCommerceStoreCart | null> {
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart operations are not supported on non-browser platform.'));
    return this.ensureTokensPresent$().pipe(
      switchMap(() => {
        const headers = this.getStoreApiHeaders(); 
        const requestUrl = `${this.storeApiUrl}/cart/items`;
        return this.http.delete<WooCommerceStoreCart>(requestUrl, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => {
        this.updateTokensFromResponse(res, 'DELETE /cart/items');
      }),
      map(res => res.body),
      catchError(this.handleError)
    );
  }

  public updateWcCustomer(customerData: { billing_address: Partial<WooCommerceStoreAddress>, shipping_address?: Partial<WooCommerceStoreAddress> }): Observable<WooCommerceStoreCart | null> {
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart operations are not supported on non-browser platform.'));
    return this.ensureTokensPresent$().pipe(
        switchMap(tokens => {
            if (!tokens.cartToken && !tokens.nonce) return throwError(() => new Error('Auth token missing for updateWcCustomer.'));
            const headers = this.getStoreApiHeaders(); const requestUrl = `${this.storeApiUrl}/cart/update-customer`;
            return this.http.post<WooCommerceStoreCart>(requestUrl, customerData, { headers, observe: 'response', withCredentials: true });
        }),
        tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, 'POST /cart/update-customer')),
        map(res => res.body),
        catchError(this.handleError)
    );
  }

  public getCountries(): Observable<WooCommerceCountry[]> {
    const requestUrl = `${this.storeUrl}/wp-json/your-garden-eden/v1/data/countries`;
    return this.http.get<WooCommerceCountry[]>(requestUrl, { withCredentials: true })
      .pipe(
        catchError(this.handleError)
      );
  }
  
  public getCheckoutUrl(cartPopulationToken?: string, jwt?: string | null): string {
    let url = `${this.storeUrl}/checkout`;
    let hasParams = false;

    if (cartPopulationToken) {
      url += `?yge_cart_token=${encodeURIComponent(cartPopulationToken)}`;
      hasParams = true;
    }

    if (jwt) {
      url += hasParams ? '&' : '?';
      url += `JWT=${encodeURIComponent(jwt)}`;
    }
    
    return url;
  }

  public getLocalCartToken(): string | null {
    return this._cartToken;
  }

  public clearLocalCartToken(): void {
    if (isPlatformBrowser(this.platformId)) {
        localStorage.removeItem(this.CART_TOKEN_STORAGE_KEY);
        this._cartToken = null;
        this._storeApiNonce = null;
        // Also clear the in-flight request observable.
        this.wcTokenRequest$ = null;
    }
  }

  private handleError(error: any): Observable<never> {
    // By returning the original error, we allow interceptors to see the full HttpErrorResponse
    // instead of a generic Error, which is crucial for the auth self-healing process.
    console.error(`[WC_SERVICE_ERROR_HANDLER] WooCommerce API Error`, error);
    return throwError(() => error);
  }
  
  public stageCartForPopulation(cartData: StageCartPayload): Observable<StageCartResponse> {
    const requestUrl = `${this.storeUrl}/wp-json/your-garden-eden/v1/stage-cart-for-population`;
    return this.http.post<StageCartResponse>(requestUrl, cartData, { withCredentials: true })
      .pipe(
        catchError(this.handleError)
      );
  }
  
  public getOrderDetails(orderId: string, orderKey: string): Observable<OrderDetails> {
    const requestUrl = `${this.storeUrl}/wp-json/your-garden-eden/v1/order-details`;
    let params = new HttpParams()
      .set('order_id', orderId)
      .set('order_key', orderKey);
      
    return this.http.get<OrderDetails>(requestUrl, { params, withCredentials: true })
      .pipe(
        catchError(this.handleError)
      );
  }
  
  private appendParams(existingParams: HttpParams, additionalParams?: HttpParams): HttpParams {
    let newParams = existingParams;
    if (additionalParams) {
      additionalParams.keys().forEach(key => {
        const value = additionalParams.get(key);
        if (value !== null && value !== undefined) { newParams = newParams.set(key, value as string); }
      });
    }
    return newParams;
  }
}