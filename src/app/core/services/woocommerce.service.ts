// /src/app/core/services/woocommerce.service.ts
import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, throwError, of, from, firstValueFrom } from 'rxjs';
import { catchError, map, tap, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

// --- WooCommerce Data Interfaces (unverändert) ---
export interface WooCommerceImage { id: number; date_created: string; date_created_gmt: string; date_modified: string; date_modified_gmt: string; src: string; name: string; alt: string; position?: number; }
export interface WooCommerceCategoryRef { id: number; name: string; slug: string; }
// ... (alle anderen Interfaces bleiben gleich wie in der vorherigen vollständigen Version) ...
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
export interface WooCommerceStoreCartTotals { total_items: string; total_items_tax: string; total_price: string; total_tax: string; total_shipping?: string; total_shipping_tax?: string; total_discount?: string; total_discount_tax?: string; currency_code: string; currency_symbol: string; tax_lines?: { name: string; price: string; rate: string }[]; }
export interface WooCommerceStoreCartCoupon { code: string; discount_type: string; totals: WooCommerceStoreCartTotals; }
export interface WooCommerceProductVariationAttribute { attribute: string; value: string; }
export interface WooCommerceStoreAddress { first_name?: string; last_name?: string; company?: string; address_1?: string; address_2?: string; city?: string; state?: string; postcode?: string; country?: string; email?: string; phone?: string; [key: string]: any; }
export interface WooCommerceStoreShippingRate { rate_id: string; name: string; description?: string; delivery_time?: { value: string; unit: string; }; price: string; taxes: string; method_id: string; instance_id?: number; meta_data?: WooCommerceMetaData[]; selected?: boolean; currency_code?: string; currency_symbol?: string; }
export interface WooCommerceStoreShippingPackage { package_id: string; name: string; destination: WooCommerceStoreAddress; items: Array<{ key: string; name: string; quantity: number; }>; shipping_rates: WooCommerceStoreShippingRate[]; }
export interface WooCommerceStoreCart { coupons: WooCommerceStoreCartCoupon[]; shipping_rates: WooCommerceStoreShippingPackage[]; shipping_address: WooCommerceStoreAddress; billing_address: WooCommerceStoreAddress; items: WooCommerceStoreCartItem[]; items_count: number; items_weight: number; needs_payment: boolean; needs_shipping: boolean; has_calculated_shipping: boolean; totals: WooCommerceStoreCartTotals; errors?: any[]; _links?: any; extensions?: object; }

// Payload für den neuen Staging-Endpunkt
export interface StageCartPayload { // Umbenannt von PopulateSessionCartPayload für Klarheit
  items: {
    product_id: number;
    quantity: number;
    variation_id?: number;
  }[];
  billing_address: WooCommerceStoreAddress;
  shipping_address?: WooCommerceStoreAddress;
}

// Antworttyp für den neuen Staging-Endpunkt
export interface StageCartResponse {
  success: boolean;
  token: string;
  message?: string; // Optional, falls der Server eine Nachricht sendet
  expires_in: number;
}


@Injectable({
  providedIn: 'root',
})
export class WoocommerceService {
  private http = inject(HttpClient);
  private platformId: object = inject(PLATFORM_ID);
  private apiUrlV3 = environment.woocommerce.apiUrl;
  private storeApiUrl = `${environment.woocommerce.storeUrl}/wp-json/wc/store/v1`;
  private consumerKey = environment.woocommerce.consumerKey;
  private consumerSecret = environment.woocommerce.consumerSecret;
  private storeUrl = environment.woocommerce.storeUrl;

  private _storeApiNonce: string | null = null;
  private _cartToken: string | null = null;
  private readonly CART_TOKEN_STORAGE_KEY = 'wc_cart_token';
  private tokenPromise: Promise<{ cartToken: string | null, nonce: string | null }> | null = null;

  constructor() {
    // ... (Konstruktor-Logik bleibt gleich wie in der letzten korrigierten Version) ...
    console.log('[WC_SERVICE] Constructor initializing.');
    if (!this.apiUrlV3 || !this.consumerKey || !this.consumerSecret || !this.storeUrl) {
      console.error('[WC_SERVICE] Constructor Error: WooCommerce Core API URL, Consumer Key, Consumer Secret, or Store URL is not set in environment variables.');
    } else {
      console.log(`[WC_SERVICE] apiUrlV3: ${this.apiUrlV3}`);
      console.log(`[WC_SERVICE] storeApiUrl: ${this.storeApiUrl}`);
    }
    if (this.apiUrlV3 && !this.apiUrlV3.endsWith('/')) {
        console.warn(`[WC_SERVICE] Warning: apiUrlV3 ("${this.apiUrlV3}") from environment.ts does not end with a trailing slash. This service expects it to simplify endpoint concatenation.`);
    }
    if (isPlatformBrowser(this.platformId)) {
      this._cartToken = localStorage.getItem(this.CART_TOKEN_STORAGE_KEY);
      console.log(`[WC_SERVICE] Initial cart token from localStorage: ${this._cartToken}`);
      this.initializeTokens();
    }
  }

  private getAuthParamsV3(): HttpParams { /* ... unverändert ... */
    if (!this.consumerKey || !this.consumerSecret) {
        console.error("[WC_SERVICE] Consumer Key or Secret is MISSING for getAuthParamsV3!");
    }
    return new HttpParams()
      .set('consumer_key', this.consumerKey)
      .set('consumer_secret', this.consumerSecret);
  }

  private getStoreApiHeaders(customHeaders?: { [header: string]: string | string[] }): HttpHeaders { /* ... unverändert ... */
    let headers = new HttpHeaders().set('Content-Type', 'application/json');
    if (this._cartToken) {
      headers = headers.set('Cart-Token', this._cartToken);
    } else if (this._storeApiNonce) {
      headers = headers.set('X-WC-Store-API-Nonce', this._storeApiNonce);
    }
    if (customHeaders) {
      Object.keys(customHeaders).forEach(key => {
        headers = headers.set(key, customHeaders[key]);
      });
    }
    return headers;
  }

  private updateTokensFromResponse(response: HttpResponse<any>, requestUrlForLog: string = 'N/A'): void { /* ... unverändert ... */
    const cartTokenHeaderKey = 'Cart-Token';
    const nonceHeaderKey = 'X-WC-Store-API-Nonce';
    const newCartToken: string | null = response.headers.get(cartTokenHeaderKey);
    if (newCartToken && newCartToken.trim() !== '') {
      if (newCartToken !== this._cartToken) {
        this._cartToken = newCartToken.trim();
        if (isPlatformBrowser(this.platformId)) { localStorage.setItem(this.CART_TOKEN_STORAGE_KEY, this._cartToken); }
         console.log(`[WC_SERVICE] ${requestUrlForLog}: Cart-Token updated to ${this._cartToken}`);
      }
    } else if (!response.headers.has(cartTokenHeaderKey) && this._cartToken && (requestUrlForLog.includes("/cart/clear") || (requestUrlForLog.includes("/cart/items") && response.status === 200 && requestUrlForLog.startsWith('DELETE')) )) {
       console.log(`[WC_SERVICE] ${requestUrlForLog}: Cart-Token header was missing, clearing local token.`);
      this.clearLocalCartToken();
    }
    const newNonce: string | null = response.headers.get(nonceHeaderKey);
    if (newNonce && newNonce.trim() !== '') {
      if (newNonce !== this._storeApiNonce) {
        this._storeApiNonce = newNonce.trim();
         console.log(`[WC_SERVICE] ${requestUrlForLog}: X-WC-Store-API-Nonce updated to ${this._storeApiNonce}`);
      }
    }
  }
  private async fetchAndSetTokensAsync(): Promise<{ cartToken: string | null, nonce: string | null }> { /* ... unverändert ... */
    if (!isPlatformBrowser(this.platformId)) { return { cartToken: null, nonce: null }; }
    const requestUrl = `${this.storeApiUrl}/cart`;
    let initialHeaders = new HttpHeaders().set('Content-Type', 'application/json');
    if (this._cartToken) { initialHeaders = initialHeaders.set('Cart-Token', this._cartToken); }
    console.log(`[WC_SERVICE] fetchAndSetTokensAsync: Attempting GET ${requestUrl} with current Cart-Token: ${this._cartToken}`);
    try {
      const response = await firstValueFrom(this.http.get<WooCommerceStoreCart>(requestUrl, { headers: initialHeaders, observe: 'response', withCredentials: true }));
      this.updateTokensFromResponse(response, `GET ${requestUrl} (initial token fetch)`);
      return { cartToken: this._cartToken, nonce: this._storeApiNonce };
    } catch (err: any) {
      console.warn(`[WC_SERVICE] fetchAndSetTokensAsync: Error during GET ${requestUrl}. Status: ${err.status}`, err);
      if (err.status === 403 || err.status === 401 || (err.error?.code && (err.error.code.includes('cart_token_invalid') || err.error.code.includes('nonce_invalid')) )) {
          console.log(`[WC_SERVICE] fetchAndSetTokensAsync: Invalid token or nonce detected. Clearing local tokens.`);
          this.clearLocalCartToken();
      }
      if (err.headers) { this.updateTokensFromResponse(err as HttpResponse<any>, `ERROR ${requestUrl} (initial token fetch)`); }
      return { cartToken: this._cartToken, nonce: this._storeApiNonce };
    }
  }
  private initializeTokens(): void { /* ... unverändert ... */
    if (!isPlatformBrowser(this.platformId) || this.tokenPromise) { return; }
    if (!this._cartToken || !this._storeApiNonce) {
        console.log(`[WC_SERVICE] initializeTokens: Cart token (${this._cartToken}) or Nonce (${this._storeApiNonce}) is missing, initiating fetchAndSetTokensAsync.`);
        this.tokenPromise = this.fetchAndSetTokensAsync().finally(() => { this.tokenPromise = null; });
    } else {
        console.log(`[WC_SERVICE] initializeTokens: Cart token and Nonce seem present.`);
    }
  }
  public async ensureTokensPresent(): Promise<{ cartToken: string | null, nonce: string | null }> { /* ... unverändert ... */
    if (!isPlatformBrowser(this.platformId)) { throw new Error('Token operations are not supported on non-browser platform.');}
    if (this.tokenPromise) {
        console.log(`[WC_SERVICE] ensureTokensPresent: Token promise is active, awaiting its completion.`);
        return this.tokenPromise;
    }
    if (!this._cartToken || !this._storeApiNonce) {
        console.log(`[WC_SERVICE] ensureTokensPresent: No cart token or no nonce, starting new fetchAndSetTokensAsync.`);
        this.tokenPromise = this.fetchAndSetTokensAsync();
        try { return await this.tokenPromise; } finally { this.tokenPromise = null; }
    }
    return { cartToken: this._cartToken, nonce: this._storeApiNonce };
  }

  private buildCoreApiUrl(endpoint: string): string { /* ... unverändert (korrigierte Version) ... */
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    return `${this.apiUrlV3}${cleanEndpoint}`;
  }

  getProducts( categoryId?: number, perPage: number = 10, page: number = 1, otherParams?: HttpParams ): Observable<WooCommerceProductsResponse> { /* ... unverändert (korrigierte Version) ... */
    let params = this.getAuthParamsV3().set('per_page', perPage.toString()).set('page', page.toString());
    if (categoryId) { params = params.set('category', categoryId.toString()); }
    params = this.appendParams(params, otherParams);
    const requestUrl = this.buildCoreApiUrl('products');
    console.log(`[WC_SERVICE] getProducts - Requesting from URL: ${requestUrl} with params:`, params.toString());
    return this.http.get<WooCommerceProduct[]>(requestUrl, { params, observe: 'response' })
      .pipe(
          tap(response => console.log('[WC_SERVICE] getProducts - Raw HTTP Response Status:', response.status)),
          map((res: HttpResponse<WooCommerceProduct[]>) => {
            return { products: res.body || [], totalPages: parseInt(res.headers.get('X-WP-TotalPages') || '0', 10), totalCount: parseInt(res.headers.get('X-WP-Total') || '0', 10) };
          }),
          catchError(this.handleError)
      );
  }
  getProductById(productId: number): Observable<WooCommerceProduct> { /* ... unverändert (korrigierte Version) ... */
    const params = this.getAuthParamsV3();
    const requestUrl = this.buildCoreApiUrl(`products/${productId}`);
    console.log(`[WC_SERVICE] getProductById - Requesting product ${productId} from URL: ${requestUrl}`);
    return this.http.get<WooCommerceProduct>(requestUrl, { params }).pipe(catchError(this.handleError));
  }
  getProductBySlug(productSlug: string): Observable<WooCommerceProduct | undefined> { /* ... unverändert (korrigierte Version) ... */
    const params = this.getAuthParamsV3().set('slug', productSlug);
    const requestUrl = this.buildCoreApiUrl('products');
    console.log(`[WC_SERVICE] getProductBySlug - Requesting product with slug ${productSlug} from URL: ${requestUrl}`);
    return this.http.get<WooCommerceProduct[]>(requestUrl, { params }).pipe(map(p => p && p.length > 0 ? p[0] : undefined), catchError(this.handleError));
  }
  getProductVariations(productId: number): Observable<WooCommerceProductVariation[]> { /* ... unverändert (korrigierte Version) ... */
    const params = this.getAuthParamsV3().set('per_page', '100');
    const requestUrl = this.buildCoreApiUrl(`products/${productId}/variations`);
    console.log(`[WC_SERVICE] getProductVariations - Requesting variations for product ${productId} from URL: ${requestUrl}`);
    return this.http.get<WooCommerceProductVariation[]>(requestUrl, { params }).pipe(catchError(this.handleError));
  }
  getCategories(parentId?: number, otherParams?: HttpParams): Observable<WooCommerceCategory[]> { /* ... unverändert (korrigierte Version) ... */
    let params = this.getAuthParamsV3();
    if (parentId !== undefined) { params = params.set('parent', parentId.toString()); }
    if (!otherParams || !otherParams.has('hide_empty')) { params = params.set('hide_empty', 'true');}
    params = this.appendParams(params, otherParams);
    const requestUrl = this.buildCoreApiUrl('products/categories');
    console.log(`[WC_SERVICE] getCategories - Requesting categories from URL: ${requestUrl}`);
    return this.http.get<WooCommerceCategory[]>(requestUrl, { params }).pipe(catchError(this.handleError));
  }
  getCategoryBySlug(categorySlug: string): Observable<WooCommerceCategory | undefined> { /* ... unverändert (korrigierte Version) ... */
    const params = this.getAuthParamsV3().set('slug', categorySlug);
    const requestUrl = this.buildCoreApiUrl('products/categories');
    console.log(`[WC_SERVICE] getCategoryBySlug - Requesting category with slug ${categorySlug} from URL: ${requestUrl}`);
    return this.http.get<WooCommerceCategory[]>(requestUrl, { params }).pipe(map(c => c && c.length > 0 ? c[0] : undefined), catchError(this.handleError));
  }

  public getWcCart(): Observable<WooCommerceStoreCart | null> { /* ... unverändert ... */
    if (!isPlatformBrowser(this.platformId)) { return of(null); }
    const requestUrl = `${this.storeApiUrl}/cart`;
    return from(this.ensureTokensPresent()).pipe(
      switchMap((tokens) => {
        console.log(`[WC_SERVICE] getWcCart - Ensured tokens: cartToken=${tokens.cartToken}, nonce=${tokens.nonce}`);
        const headers = this.getStoreApiHeaders();
        return this.http.get<WooCommerceStoreCart>(requestUrl, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, `GET ${requestUrl}`)),
      map(res => res.body),
      catchError(err => {
        console.warn(`[WC_SERVICE] getWcCart: Error fetching cart. Status: ${err.status}`, err);
        if (err.status === 404 && err.error?.code === 'woocommerce_rest_cart_empty') return of(null);
        if (err.status === 403 && err.error?.code?.includes('cart_token_invalid')) { this.clearLocalCartToken(); return of(null); }
        return this.handleError(err);
      })
    );
  }
  public addItemToWcCart(productId: number, quantity: number, variationAttributes?: WooCommerceProductVariationAttribute[], variationId?: number): Observable<WooCommerceStoreCart | null> { /* ... unverändert ... */
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart operations are not supported on non-browser platform.'));
    return from(this.ensureTokensPresent()).pipe(
      switchMap(tokens => {
        if (!tokens.cartToken && !tokens.nonce) return throwError(() => new Error('Auth token (Cart-Token or Nonce) missing for addItemToWcCart.'));
        const headers = this.getStoreApiHeaders(); const requestUrl = `${this.storeApiUrl}/cart/add-item`;
        let body: any = { quantity };
        if (variationId) { body.id = variationId; }
        else if (variationAttributes && variationAttributes.length > 0) { body.id = productId; body.variation = variationAttributes; }
        else { body.id = productId; }
        console.log(`[WC_SERVICE] addItemToWcCart: POST to ${requestUrl} with body:`, body);
        return this.http.post<WooCommerceStoreCart>(requestUrl, body, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, 'POST /cart/add-item')),
      map(res => res.body),
      catchError(this.handleError)
    );
  }
  public updateWcCartItemQuantity(itemKey: string, quantity: number): Observable<WooCommerceStoreCart | null> { /* ... unverändert ... */
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart operations are not supported on non-browser platform.'));
    return from(this.ensureTokensPresent()).pipe(
      switchMap(tokens => {
        if (!tokens.cartToken && !tokens.nonce) return throwError(() => new Error('Auth token missing for updateWcCartItemQuantity.'));
        const headers = this.getStoreApiHeaders(); const body = { key: itemKey, quantity };
        return this.http.post<WooCommerceStoreCart>(`${this.storeApiUrl}/cart/update-item`, body, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, 'POST /cart/update-item')),
      map(res => res.body),
      catchError(this.handleError)
    );
  }
  public removeWcCartItem(itemKey: string): Observable<WooCommerceStoreCart | null> { /* ... unverändert ... */
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart operations are not supported on non-browser platform.'));
    return from(this.ensureTokensPresent()).pipe(
      switchMap(tokens => {
        if (!tokens.cartToken && !tokens.nonce) return throwError(() => new Error('Auth token missing for removeWcCartItem.'));
        const headers = this.getStoreApiHeaders(); const body = { key: itemKey };
        return this.http.post<WooCommerceStoreCart>(`${this.storeApiUrl}/cart/remove-item`, body, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, 'POST /cart/remove-item')),
      map(res => res.body),
      catchError(this.handleError)
    );
  }
  public clearWcCart(): Observable<WooCommerceStoreCart | null> { /* ... unverändert ... */
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart operations are not supported on non-browser platform.'));
    return from(this.ensureTokensPresent()).pipe(
      switchMap(tokens => {
        if (!tokens.cartToken && !tokens.nonce) return throwError(() => new Error('Auth token missing for clearWcCart.'));
        const headers = this.getStoreApiHeaders(); const requestUrl = `${this.storeApiUrl}/cart/items`;
        return this.http.delete<WooCommerceStoreCart>(requestUrl, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => {
        this.updateTokensFromResponse(res, 'DELETE /cart/items');
        if (!res.headers.get('Cart-Token') && !res.headers.get('cart-token')) { this.clearLocalCartToken(); }
      }),
      map(res => res.body),
      catchError(this.handleError)
    );
  }
  public updateCartCustomer(customerData: { billing_address: WooCommerceStoreAddress, shipping_address?: WooCommerceStoreAddress }): Observable<WooCommerceStoreCart | null> { /* ... unverändert ... */
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart operations are not supported on non-browser platform.'));
    return from(this.ensureTokensPresent()).pipe(
      switchMap(tokens => {
        if (!tokens.cartToken && !tokens.nonce) return throwError(() => new Error('Auth token missing for updateCartCustomer.'));
        const headers = this.getStoreApiHeaders(); const requestUrl = `${this.storeApiUrl}/cart/update-customer`;
        return this.http.post<WooCommerceStoreCart>(requestUrl, customerData, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, 'POST /cart/update-customer')),
      map(res => res.body),
      catchError(this.handleError)
    );
  }
  public getCartShippingRates(): Observable<WooCommerceStoreShippingPackage[] | null> { /* ... unverändert ... */
    if (!isPlatformBrowser(this.platformId)) return of(null);
    return from(this.ensureTokensPresent()).pipe(
      switchMap(tokens => {
        if (!tokens.cartToken && !tokens.nonce) return throwError(() => new Error('Auth token missing for getCartShippingRates.'));
        const headers = this.getStoreApiHeaders(); const requestUrl = `${this.storeApiUrl}/cart/shipping-rates`;
        return this.http.get<WooCommerceStoreShippingPackage[]>(requestUrl, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreShippingPackage[] | null>) => this.updateTokensFromResponse(res, 'GET /cart/shipping-rates')),
      map(res => res.body),
      catchError(this.handleError)
    );
  }
  public selectCartShippingRate(packageId: string, rateId: string): Observable<WooCommerceStoreCart | null> { /* ... unverändert ... */
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart operations are not supported on non-browser platform.'));
    return from(this.ensureTokensPresent()).pipe(
      switchMap(tokens => {
        if (!tokens.cartToken && !tokens.nonce) return throwError(() => new Error('Auth token missing for selectCartShippingRate.'));
        const headers = this.getStoreApiHeaders(); const requestUrl = `${this.storeApiUrl}/cart/select-shipping-rate`;
        const body = { package_id: packageId, rate_id: rateId };
        return this.http.post<WooCommerceStoreCart>(requestUrl, body, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, 'POST /cart/select-shipping-rate')),
      map(res => res.body),
      catchError(this.handleError)
    );
  }

  public getCheckoutUrl(cartPopulationToken?: string): string {
    let url = `${this.storeUrl}/checkout`;
    if (cartPopulationToken) {
      // Sicherstellen, dass der Parameter korrekt angehängt wird, auch wenn schon andere Parameter existieren (sollte hier nicht der Fall sein)
      url += url.includes('?') ? '&' : '?';
      url += `yge_cart_token=${encodeURIComponent(cartPopulationToken)}`;
    }
    return url;
  }

  public clearLocalCartToken(): void { /* ... unverändert ... */
    if (isPlatformBrowser(this.platformId)) {
        console.log(`[WC_SERVICE] clearLocalCartToken: Clearing Cart-Token and Nonce from localStorage and service state.`);
        localStorage.removeItem(this.CART_TOKEN_STORAGE_KEY);
        this._cartToken = null;
        this._storeApiNonce = null;
    }
  }
  private handleError(error: any): Observable<never> { /* ... unverändert ... */
    let errorMessage = `WooCommerce API Error! Status: ${error.status || 'N/A'}`;
    if (error.error && typeof error.error === 'object') {
        const errDetails = error.error;
        errorMessage += `. Code: ${errDetails.code || 'N/A'}. Message: ${errDetails.message || JSON.stringify(errDetails)}`;
        if(errDetails.data && errDetails.data.details) { errorMessage += ` Details: ${JSON.stringify(errDetails.data.details)}`; }
    } else if (error.message) {
        errorMessage += `. Message: ${error.message}`;
    } else if (typeof error.error === 'string') {
        errorMessage += `. Message: ${error.error}`;
    }
    console.error(`[WC_SERVICE_ERROR_HANDLER] ${errorMessage}`, error);
    return throwError(() => new Error(errorMessage));
  }
  public async loadCartFromToken(token: string): Promise<WooCommerceStoreCart | null> { /* ... unverändert ... */
    if (!isPlatformBrowser(this.platformId)) throw new Error('Cannot load cart from token on non-browser platform.');
    console.log(`[WC_SERVICE] loadCartFromToken: Attempting to load cart with token: ${token}`);
    this._cartToken = token;
    localStorage.setItem(this.CART_TOKEN_STORAGE_KEY, token);
    this._storeApiNonce = null;
    try {
        const cart = await firstValueFrom(this.getWcCart());
        if (!this._cartToken) {
             console.warn(`[WC_SERVICE] loadCartFromToken: Cart-Token was cleared during getWcCart for token ${token}.`);
             throw new Error (`Failed to load cart with token ${token}. It might be invalid or expired, and was cleared.`);
        }
        console.log(`[WC_SERVICE] loadCartFromToken: Successfully loaded cart with token ${token}.`);
        return cart;
    } catch (error) {
        console.error(`[WC_SERVICE] Error in loadCartFromToken for token ${token}:`, error);
        this.clearLocalCartToken();
        throw error;
    }
  }
  private appendParams(existingParams: HttpParams, additionalParams?: HttpParams): HttpParams { /* ... unverändert ... */
    let newParams = existingParams;
    if (additionalParams) {
      additionalParams.keys().forEach(key => {
        const value = additionalParams.get(key);
        if (value !== null && value !== undefined) { newParams = newParams.set(key, value as string); }
      });
    }
    return newParams;
  }

  // +++ NEUE METHODE FÜR OPTION 4: Staging Endpoint +++
  public stageCartForPopulation(cartData: StageCartPayload): Observable<StageCartResponse> {
    if (!isPlatformBrowser(this.platformId)) {
      return throwError(() => new Error('Cannot stage cart for population on non-browser platform.'));
    }
    const requestUrl = `${this.storeUrl}/wp-json/your-garden-eden/v1/stage-cart-for-population`;
    console.log(`[WC_SERVICE] stageCartForPopulation: POST to ${requestUrl} with payload:`, cartData);
    return this.http.post<StageCartResponse>(requestUrl, cartData, { withCredentials: true }) // withCredentials für Cookies/Session
      .pipe(
        tap(response => console.log(`[WC_SERVICE] stageCartForPopulation response:`, response)),
        catchError(this.handleError)
      );
  }

  // --- Alte Methoden für Option 2 (können entfernt oder auskommentiert werden) ---
  /*
  public requestCartPopulationToken(): Observable<{ success: boolean, token: string, expires_in: number }> {
    // ... alter Code ...
  }

  public populateSessionCartWithToken(
    cartData: PopulateSessionCartPayload, // Beachten Sie, dass StageCartPayload hier passen würde
    token: string
  ): Observable<{ success: boolean; message: string; cart_hash?: string, added_items_feedback?: any[] }> {
    // ... alter Code ...
  }
  */
}