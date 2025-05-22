// /src/app/core/services/woocommerce.service.ts
import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject, PLATFORM_ID } from '@angular/core'; // PLATFORM_ID hier
import { isPlatformBrowser } from '@angular/common';
import { Observable, throwError, of, from, firstValueFrom } from 'rxjs';
import { catchError, map, tap, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

// --- WooCommerce Data Interfaces (vollständig) ---
export interface WooCommerceImage {
  id: number;
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
  src: string;
  name: string;
  alt: string;
  position?: number;
}

export interface WooCommerceCategoryRef {
  id: number;
  name: string;
  slug: string;
}

export interface WooCommerceTagRef {
  id: number;
  name: string;
  slug: string;
}

export interface WooCommerceAttribute {
  id: number;
  name: string;
  slug?: string;
  position: number;
  visible: boolean;
  variation: boolean;
  options: string[];
}

export interface WooCommerceDefaultAttribute {
  id: number;
  name: string;
  option: string;
}

export interface WooCommerceProductDimension {
  length: string;
  width: string;
  height: string;
}

export interface WooCommerceMetaData {
  id?: number;
  key: string;
  value: any;
}

export interface WooCommerceProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
  type: 'simple' | 'variable' | 'grouped' | 'external';
  status: 'publish' | 'pending' | 'draft' | 'private' | 'future' | 'trash';
  featured: boolean;
  catalog_visibility: 'visible' | 'catalog' | 'search' | 'hidden';
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  price_html?: string;
  date_on_sale_from: string | null;
  date_on_sale_from_gmt: string | null;
  date_on_sale_to: string | null;
  date_on_sale_to_gmt: string | null;
  on_sale: boolean;
  purchasable: boolean;
  total_sales: number;
  virtual: boolean;
  downloadable: boolean;
  downloads?: any[];
  download_limit?: number;
  download_expiry?: number;
  external_url?: string;
  button_text?: string;
  tax_status: 'taxable' | 'shipping' | 'none';
  tax_class?: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  backorders: 'no' | 'notify' | 'yes';
  backorders_allowed: boolean;
  backordered: boolean;
  low_stock_amount: number | null;
  sold_individually: boolean;
  weight: string | null;
  dimensions: WooCommerceProductDimension;
  shipping_required: boolean;
  shipping_taxable: boolean;
  shipping_class?: string;
  shipping_class_id: number;
  reviews_allowed: boolean;
  average_rating: string;
  rating_count: number;
  related_ids: number[];
  upsell_ids: number[];
  cross_sell_ids: number[];
  parent_id: number;
  purchase_note?: string;
  categories: WooCommerceCategoryRef[];
  tags: WooCommerceTagRef[];
  images: WooCommerceImage[];
  attributes: WooCommerceAttribute[];
  default_attributes: WooCommerceDefaultAttribute[];
  variations: number[];
  grouped_products?: number[];
  menu_order: number;
  meta_data: WooCommerceMetaData[];
}

export interface WooCommerceProductVariation {
  id: number;
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
  description: string;
  permalink: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  price_html?: string;
  date_on_sale_from: string | null;
  date_on_sale_from_gmt: string | null;
  date_on_sale_to: string | null;
  date_on_sale_to_gmt: string | null;
  on_sale: boolean;
  status: 'publish' | 'private' | 'draft';
  purchasable: boolean;
  virtual: boolean;
  downloadable: boolean;
  downloads?: any[];
  download_limit?: number;
  download_expiry?: number;
  tax_status: 'taxable' | 'shipping' | 'none' | 'parent';
  tax_class?: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  backorders: 'no' | 'notify' | 'yes';
  backorders_allowed: boolean;
  backordered: boolean;
  low_stock_amount: number | null;
  weight: string | null;
  dimensions: WooCommerceProductDimension;
  shipping_class?: string;
  shipping_class_id: number;
  image: WooCommerceImage | null;
  attributes: { id: number; name: string; slug?: string; option: string; }[];
  menu_order: number;
  meta_data: WooCommerceMetaData[];
}

export interface WooCommerceCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  description: string;
  display: 'default' | 'products' | 'subcategories' | 'both';
  image: WooCommerceImage | null;
  menu_order: number;
  count: number;
}

export interface WooCommerceProductsResponse {
  products: WooCommerceProduct[];
  totalPages: number;
  totalCount: number;
}

export interface WooCommerceStoreCartItemImage {
  id: number;
  src: string;
  thumbnail: string;
  srcset: string;
  sizes: string;
  name: string;
  alt: string;
}

export interface WooCommerceStoreCartItemTotals {
  line_subtotal: string;
  line_subtotal_tax: string;
  line_total: string;
  line_total_tax: string;
  currency_code: string;
  currency_symbol: string;
  currency_minor_unit: number;
  currency_decimal_separator: string;
  currency_thousand_separator: string;
  currency_prefix: string;
  currency_suffix: string;
}

export interface WooCommerceStoreCartItem {
  key: string;
  id: number;
  quantity: number;
  name: string;
  short_description?: string;
  description?: string;
  sku?: string;
  low_stock_remaining?: number | null;
  backorders_allowed?: boolean;
  show_backorder_badge?: boolean;
  sold_individually?: boolean;
  permalink?: string;
  images: WooCommerceStoreCartItemImage[];
  variation: { attribute: string; value: string }[];
  item_data?: any[];
  prices?: {
    price: string;
    regular_price: string;
    sale_price: string;
    price_range: null | { min_amount: string; max_amount: string };
    currency_code: string;
  };
  totals: WooCommerceStoreCartItemTotals;
  catalog_visibility?: string;
}

export interface WooCommerceStoreCartTotals {
  total_items: string;
  total_items_tax: string;
  total_price: string;
  total_tax: string;
  total_shipping?: string;
  total_shipping_tax?: string;
  total_discount?: string;
  total_discount_tax?: string;
  currency_code: string;
  currency_symbol: string;
}

export interface WooCommerceStoreCartCoupon {
  code: string;
  discount_type: string;
  totals: WooCommerceStoreCartTotals;
}

export interface WooCommerceProductVariationAttribute {
  attribute: string;
  value: string;
}

export interface WooCommerceStoreAddress {
  first_name?: string;
  last_name?: string;
  company?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  email?: string;
  phone?: string;
  [key: string]: any;
}

export interface WooCommerceStoreShippingRate {
  rate_id: string;
  name: string;
  description?: string;
  delivery_time?: {
    value: string;
    unit: string;
  };
  price: string;
  taxes: string;
  method_id: string;
  instance_id?: number;
  meta_data?: WooCommerceMetaData[];
  selected?: boolean;
  currency_code?: string;
  currency_symbol?: string;
}

export interface WooCommerceStoreShippingPackage {
  package_id: string;
  name: string;
  destination: WooCommerceStoreAddress;
  items: Array<{
    key: string;
    name: string;
    quantity: number;
  }>;
  shipping_rates: WooCommerceStoreShippingRate[];
}


export interface WooCommerceStoreCart {
  coupons: WooCommerceStoreCartCoupon[];
  shipping_rates: WooCommerceStoreShippingPackage[];
  shipping_address: WooCommerceStoreAddress;
  billing_address: WooCommerceStoreAddress;
  items: WooCommerceStoreCartItem[];
  items_count: number;
  items_weight: number;
  needs_payment: boolean;
  needs_shipping: boolean;
  has_calculated_shipping: boolean;
  totals: WooCommerceStoreCartTotals;
  _links?: any;
  extensions?: object;
}


@Injectable({
  providedIn: 'root',
})
export class WoocommerceService {
  private http = inject(HttpClient);
  private platformId: object = inject(PLATFORM_ID); // Korrigierte Typisierung
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
    if (!this.apiUrlV3 || !this.consumerKey || !this.consumerSecret || !this.storeUrl) {
      console.error('[WC_SERVICE_DEBUG] Constructor: WooCommerce Core API URL, Consumer Key, Consumer Secret, or Store URL is not set in environment variables.');
    }
    if (!this.storeApiUrl.startsWith('http')) {
      console.error('[WC_SERVICE_DEBUG] Constructor: WooCommerce Store API URL seems to be misconfigured:', this.storeApiUrl);
    }

    if (isPlatformBrowser(this.platformId)) {
      this._cartToken = localStorage.getItem(this.CART_TOKEN_STORAGE_KEY);
      this.initializeTokens();
    }
  }

  private getAuthParamsV3(): HttpParams {
    return new HttpParams()
      .set('consumer_key', this.consumerKey)
      .set('consumer_secret', this.consumerSecret);
  }

  private getStoreApiHeaders(): HttpHeaders {
    let headers = new HttpHeaders().set('Content-Type', 'application/json');
    if (this._cartToken) {
      headers = headers.set('Cart-Token', this._cartToken);
    } else if (this._storeApiNonce) {
      headers = headers.set('X-WC-Store-API-Nonce', this._storeApiNonce);
    }
    return headers;
  }

  private updateTokensFromResponse(response: HttpResponse<any>, requestUrlForLog: string = 'N/A'): void {
    const cartTokenHeaderKey = 'Cart-Token';
    const nonceHeaderKey = 'X-WC-Store-API-Nonce';

    let newCartToken: string | null = response.headers.get(cartTokenHeaderKey) || response.headers.get(cartTokenHeaderKey.toLowerCase());
    if (newCartToken && newCartToken.trim() !== '') {
      if (newCartToken !== this._cartToken) {
        this._cartToken = newCartToken.trim();
        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem(this.CART_TOKEN_STORAGE_KEY, this._cartToken);
        }
      }
    } else if (requestUrlForLog.includes("/cart")) {
      // Token-Behandlung, wenn Server keinen mehr sendet
    }

    let newNonce: string | null = response.headers.get(nonceHeaderKey) || response.headers.get(nonceHeaderKey.toLowerCase());
    if (newNonce && newNonce.trim() !== '') {
      if (newNonce !== this._storeApiNonce) {
        this._storeApiNonce = newNonce.trim();
      }
    }
  }

  private async fetchAndSetTokensAsync(): Promise<{ cartToken: string | null, nonce: string | null }> {
    if (!isPlatformBrowser(this.platformId)) {
      return { cartToken: null, nonce: null };
    }
    const requestUrl = `${this.storeApiUrl}/cart`;
    let initialHeaders = new HttpHeaders().set('Content-Type', 'application/json');
    if (this._cartToken) {
        initialHeaders = initialHeaders.set('Cart-Token', this._cartToken);
    } else if (this._storeApiNonce) {
        initialHeaders = initialHeaders.set('X-WC-Store-API-Nonce', this._storeApiNonce);
    }

    try {
      const response = await firstValueFrom(
        this.http.get<WooCommerceStoreCart>(requestUrl, { headers: initialHeaders, observe: 'response', withCredentials: true })
      );
      this.updateTokensFromResponse(response, requestUrl);
      return { cartToken: this._cartToken, nonce: this._storeApiNonce };
    } catch (err: any) {
      if (err.status === 403 || err.status === 401 || (err.error?.code && err.error.code.includes('cart_token_invalid'))) {
          this._cartToken = null;
          if (isPlatformBrowser(this.platformId)) {
              localStorage.removeItem(this.CART_TOKEN_STORAGE_KEY);
          }
      }
      if (err.headers) {
        this.updateTokensFromResponse(err as HttpResponse<any>, `ERROR ${requestUrl}`);
      }
      return { cartToken: this._cartToken, nonce: this._storeApiNonce };
    }
  }

  private initializeTokens(): void {
    if (!isPlatformBrowser(this.platformId) || this.tokenPromise) { return; }
    if (!this._cartToken) {
      this.tokenPromise = this.fetchAndSetTokensAsync().finally(() => {
        this.tokenPromise = null;
      });
    }
  }

  public async ensureTokensPresent(): Promise<{ cartToken: string | null, nonce: string | null }> {
    if (!isPlatformBrowser(this.platformId)) {
      throw new Error('Token operations are not supported on the server / non-browser platform.');
    }
    if (this._cartToken) {
      return { cartToken: this._cartToken, nonce: this._storeApiNonce };
    }
    if (this.tokenPromise) {
      return this.tokenPromise;
    }
    this.tokenPromise = this.fetchAndSetTokensAsync();
    try {
      return await this.tokenPromise;
    } finally {
      this.tokenPromise = null;
    }
  }

  getProducts( categoryId?: number, perPage: number = 10, page: number = 1, otherParams?: HttpParams ): Observable<WooCommerceProductsResponse> {
    let params = this.getAuthParamsV3().set('per_page', perPage.toString()).set('page', page.toString());
    if (categoryId) { params = params.set('category', categoryId.toString()); }
    params = this.appendParams(params, otherParams);
    return this.http.get<WooCommerceProduct[]>(`${this.apiUrlV3}products`, { params, observe: 'response' })
      .pipe(map((res: HttpResponse<WooCommerceProduct[]>) => ({ products: res.body || [], totalPages: parseInt(res.headers.get('X-WP-TotalPages') || '0', 10), totalCount: parseInt(res.headers.get('X-WP-Total') || '0', 10) })), catchError(this.handleError));
  }
  getProductById(productId: number): Observable<WooCommerceProduct> { const params = this.getAuthParamsV3(); return this.http.get<WooCommerceProduct>(`${this.apiUrlV3}products/${productId}`, { params }).pipe(catchError(this.handleError)); }
  getProductBySlug(productSlug: string): Observable<WooCommerceProduct | undefined> { const params = this.getAuthParamsV3().set('slug', productSlug); return this.http.get<WooCommerceProduct[]>(`${this.apiUrlV3}products`, { params }).pipe(map(p => p && p.length > 0 ? p[0] : undefined), catchError(this.handleError)); }
  getProductVariations(productId: number): Observable<WooCommerceProductVariation[]> { const params = this.getAuthParamsV3().set('per_page', '100'); return this.http.get<WooCommerceProductVariation[]>(`${this.apiUrlV3}products/${productId}/variations`, { params }).pipe(catchError(this.handleError)); }
  getCategories(parentId?: number, otherParams?: HttpParams): Observable<WooCommerceCategory[]> { let params = this.getAuthParamsV3(); if (parentId !== undefined) { params = params.set('parent', parentId.toString()); } if (!otherParams || !otherParams.has('hide_empty')) { params = params.set('hide_empty', 'true'); } params = this.appendParams(params, otherParams); return this.http.get<WooCommerceCategory[]>(`${this.apiUrlV3}products/categories`, { params }).pipe(catchError(this.handleError)); }
  getCategoryBySlug(categorySlug: string): Observable<WooCommerceCategory | undefined> { const params = this.getAuthParamsV3().set('slug', categorySlug); return this.http.get<WooCommerceCategory[]>(`${this.apiUrlV3}products/categories`, { params }).pipe(map(c => c && c.length > 0 ? c[0] : undefined), catchError(this.handleError)); }


  public getWcCart(): Observable<WooCommerceStoreCart | null> {
    if (!isPlatformBrowser(this.platformId)) { return of(null); }
    const requestUrl = `${this.storeApiUrl}/cart`;
    return from(this.ensureTokensPresent()).pipe(
      switchMap(() => {
        const headers = this.getStoreApiHeaders();
        return this.http.get<WooCommerceStoreCart>(requestUrl, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, requestUrl)),
      map(res => res.body),
      catchError(err => {
        if (err.status === 404 && err.error?.code === 'woocommerce_rest_cart_empty') return of(null);
        return this.handleError(err);
      })
    );
  }

  public addItemToWcCart(productId: number, quantity: number, variationAttributes?: WooCommerceProductVariationAttribute[], variationId?: number): Observable<WooCommerceStoreCart | null> {
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart operations are not supported on the server.'));
    return from(this.ensureTokensPresent()).pipe(
      switchMap(() => {
        if (!this._cartToken && !this._storeApiNonce) return throwError(() => new Error('Auth token missing.'));
        const headers = this.getStoreApiHeaders();
        const requestUrl = `${this.storeApiUrl}/cart/add-item`;
        let body: any = { quantity };
        if (variationId) { body.id = variationId; }
        else if (variationAttributes?.length) { body.id = productId; body.variation = variationAttributes; }
        else { body.id = productId; }
        return this.http.post<WooCommerceStoreCart>(requestUrl, body, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, 'POST /cart/add-item')),
      map(res => res.body),
      catchError(this.handleError)
    );
  }

  public updateWcCartItemQuantity(itemKey: string, quantity: number): Observable<WooCommerceStoreCart | null> {
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart ops not supported on server.'));
    return from(this.ensureTokensPresent()).pipe(
      switchMap(() => {
        if (!this._cartToken && !this._storeApiNonce) return throwError(() => new Error('Auth token missing.'));
        const headers = this.getStoreApiHeaders();
        const body = { key: itemKey, quantity };
        return this.http.post<WooCommerceStoreCart>(`${this.storeApiUrl}/cart/update-item`, body, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, 'POST /cart/update-item')),
      map(res => res.body),
      catchError(this.handleError)
    );
  }

  public removeWcCartItem(itemKey: string): Observable<WooCommerceStoreCart | null> {
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart ops not supported on server.'));
    return from(this.ensureTokensPresent()).pipe(
      switchMap(() => {
        if (!this._cartToken && !this._storeApiNonce) return throwError(() => new Error('Auth token missing.'));
        const headers = this.getStoreApiHeaders();
        const body = { key: itemKey };
        return this.http.post<WooCommerceStoreCart>(`${this.storeApiUrl}/cart/remove-item`, body, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, 'POST /cart/remove-item')),
      map(res => res.body),
      catchError(this.handleError)
    );
  }

  public clearWcCart(): Observable<WooCommerceStoreCart | null> {
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart ops not supported on server.'));
    return from(this.ensureTokensPresent()).pipe(
      switchMap(() => {
        if (!this._cartToken && !this._storeApiNonce) return throwError(() => new Error('Auth token missing.'));
        const headers = this.getStoreApiHeaders();
        const requestUrl = `${this.storeApiUrl}/cart/items`;
        return this.http.delete<WooCommerceStoreCart>(requestUrl, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => {
        this.updateTokensFromResponse(res, 'DELETE /cart/items');
        if (!res.headers.get('Cart-Token') && !res.headers.get('cart-token')) {
            this._cartToken = null;
            if (isPlatformBrowser(this.platformId)) localStorage.removeItem(this.CART_TOKEN_STORAGE_KEY);
        }
      }),
      map(res => res.body),
      catchError(this.handleError)
    );
  }

  public updateCartCustomer(customerData: { billing_address: WooCommerceStoreAddress, shipping_address?: WooCommerceStoreAddress }): Observable<WooCommerceStoreCart | null> {
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart ops not supported on server.'));
    return from(this.ensureTokensPresent()).pipe(
      switchMap(() => {
        if (!this._cartToken && !this._storeApiNonce) return throwError(() => new Error('Auth token missing.'));
        const headers = this.getStoreApiHeaders();
        const requestUrl = `${this.storeApiUrl}/cart/update-customer`;
        return this.http.post<WooCommerceStoreCart>(requestUrl, customerData, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, 'POST /cart/update-customer')),
      map(res => res.body),
      catchError(this.handleError)
    );
  }

  public getCartShippingRates(): Observable<WooCommerceStoreShippingPackage[] | null> {
    if (!isPlatformBrowser(this.platformId)) return of(null);
    return from(this.ensureTokensPresent()).pipe(
      switchMap(() => {
        if (!this._cartToken && !this._storeApiNonce) return throwError(() => new Error('Auth token missing.'));
        const headers = this.getStoreApiHeaders();
        const requestUrl = `${this.storeApiUrl}/cart/shipping-rates`;
        return this.http.get<WooCommerceStoreShippingPackage[]>(requestUrl, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreShippingPackage[] | null>) => this.updateTokensFromResponse(res, 'GET /cart/shipping-rates')),
      map(res => res.body),
      catchError(this.handleError)
    );
  }

  public selectCartShippingRate(packageId: string, rateId: string): Observable<WooCommerceStoreCart | null> {
    if (!isPlatformBrowser(this.platformId)) return throwError(() => new Error('Cart ops not supported on server.'));
    return from(this.ensureTokensPresent()).pipe(
      switchMap(() => {
        if (!this._cartToken && !this._storeApiNonce) return throwError(() => new Error('Auth token missing.'));
        const headers = this.getStoreApiHeaders();
        const requestUrl = `${this.storeApiUrl}/cart/select-shipping-rate`;
        const body = { package_id: packageId, rate_id: rateId };
        return this.http.post<WooCommerceStoreCart>(requestUrl, body, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => this.updateTokensFromResponse(res, 'POST /cart/select-shipping-rate')),
      map(res => res.body),
      catchError(this.handleError)
    );
  }

  public getCheckoutUrl(): string { return `${this.storeUrl}/checkout`; }

  public clearLocalCartToken(): void {
    if (isPlatformBrowser(this.platformId)) {
        localStorage.removeItem(this.CART_TOKEN_STORAGE_KEY);
        this._cartToken = null;
        this._storeApiNonce = null;
    }
  }

  private handleError(error: any): Observable<never> {
    let errorMessage = `WooCommerce API Error! Status: ${error.status || 'N/A'}`;
    if (error.error && typeof error.error === 'object') {
        const errDetails = error.error;
        errorMessage += `. Code: ${errDetails.code || 'N/A'}. Message: ${errDetails.message || JSON.stringify(errDetails)}`;
        if(errDetails.data && errDetails.data.details) {
            errorMessage += ` Details: ${JSON.stringify(errDetails.data.details)}`;
        }
    } else if (error.message) {
        errorMessage += `. Message: ${error.message}`;
    } else if (typeof error.error === 'string') {
        errorMessage += `. Message: ${error.error}`;
    }
    console.error(`[WC_SERVICE_ERROR_HANDLER] ${errorMessage}`);
    return throwError(() => new Error(errorMessage));
  }

  public async loadCartFromToken(token: string): Promise<WooCommerceStoreCart | null> {
    if (!isPlatformBrowser(this.platformId)) throw new Error('Cannot load cart from token on the server.');
    this._cartToken = token;
    localStorage.setItem(this.CART_TOKEN_STORAGE_KEY, token);
    this._storeApiNonce = null;
    try {
        const cart = await firstValueFrom(this.getWcCart());
        if (!this._cartToken) throw new Error (`Failed to load cart with token ${token}. It might be invalid or expired.`);
        return cart;
    } catch (error) {
        this.clearLocalCartToken();
        throw error;
    }
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