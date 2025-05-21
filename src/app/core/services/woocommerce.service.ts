// /src/app/core/services/woocommerce.service.ts
import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject, PLATFORM_ID } from '@angular/core'; // +++ PLATFORM_ID hinzugefügt +++
import { isPlatformBrowser } from '@angular/common'; // +++ isPlatformBrowser hinzugefügt +++
import { Observable, throwError, of, BehaviorSubject, firstValueFrom, from } from 'rxjs';
import { catchError, map, tap, switchMap, filter, take, finalize } from 'rxjs/operators';
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

export interface WooCommerceStoreCart {
  coupons: WooCommerceStoreCartCoupon[];
  shipping_rates: any[];
  shipping_address: any;
  billing_address: any;
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
  private platformId = inject(PLATFORM_ID); // +++ PLATFORM_ID injiziert +++
  private apiUrlV3 = environment.woocommerce.apiUrl;
  private storeApiUrl = `${environment.woocommerce.storeUrl}/wp-json/wc/store/v1`;
  private consumerKey = environment.woocommerce.consumerKey;
  private consumerSecret = environment.woocommerce.consumerSecret;
  private storeUrl = environment.woocommerce.storeUrl;

  private _storeApiNonce: string | null = null;
  private get storeApiNonce(): string | null { return this._storeApiNonce; }
  private set storeApiNonce(value: string | null) {
    console.log(`[WC_SERVICE_NONCE_DEBUG_SETTER] storeApiNonce changing from '${this._storeApiNonce}' to '${value}'`);
    if (value !== this._storeApiNonce) {
        console.log(`[WC_SERVICE_NONCE_DEBUG_SETTER] Actual change detected. Previous: '${this._storeApiNonce}', New: '${value}'`);
    }
    this._storeApiNonce = value;
  }

  private noncePromise: Promise<string | null> | null = null;

  constructor() {
    // Konstruktor-Logik bleibt unverändert
    if (!this.apiUrlV3 || !this.consumerKey || !this.consumerSecret || !this.storeUrl) {
      console.error('[WC_SERVICE_NONCE_DEBUG] Constructor: WooCommerce Core API URL, Consumer Key, Consumer Secret, or Store URL is not set in environment variables.');
    }
    if (!this.storeApiUrl.startsWith('http')) {
      console.error('[WC_SERVICE_NONCE_DEBUG] Constructor: WooCommerce Store API URL seems to be misconfigured:', this.storeApiUrl);
    } else if (this.storeApiUrl.includes('//wp-json')) {
        console.warn('[WC_SERVICE_NONCE_DEBUG] Constructor: WooCommerce Store API URL might have a double slash, please check environment.woocommerce.storeUrl (should not end with /):', this.storeApiUrl);
    }
    console.log('[WC_SERVICE_NONCE_DEBUG] Constructor: Initializing WoocommerceService. Attempting to initialize Nonce.');
    this.initializeNonce();
  }

  private getAuthParamsV3(): HttpParams {
    return new HttpParams()
      .set('consumer_key', this.consumerKey)
      .set('consumer_secret', this.consumerSecret);
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

  private getStoreApiHeaders(): HttpHeaders {
    let headers = new HttpHeaders().set('Content-Type', 'application/json');
    console.log('[WC_SERVICE_NONCE_DEBUG] getStoreApiHeaders: Current this.storeApiNonce BEFORE setting X-WC-Store-API-Nonce header:', this.storeApiNonce);
    if (this.storeApiNonce && this.storeApiNonce.trim() !== '') {
      headers = headers.set('X-WC-Store-API-Nonce', this.storeApiNonce);
      console.log('[WC_SERVICE_NONCE_DEBUG] getStoreApiHeaders: X-WC-Store-API-Nonce (Standard Case) header SET with value:', this.storeApiNonce);
    } else {
      console.warn('[WC_SERVICE_NONCE_DEBUG] getStoreApiHeaders: this.storeApiNonce is null or empty. X-WC-Store-API-Nonce header NOT SET.');
    }
    return headers;
  }

  private updateNonceFromResponse(response: HttpResponse<any>): void {
    // Logik bleibt unverändert
    const nonceHeaderKeys = ['Nonce', 'X-WP-Nonce', 'X-WC-Store-API-Nonce', 'nonce', 'x-wp-nonce', 'x-wc-store-api-nonce'];
    let foundNonce: string | null = null;
    console.log('[WC_SERVICE_NONCE_DEBUG] updateNonceFromResponse: Attempting to extract Nonce. Source URL:', response.url);
    console.log('[WC_SERVICE_NONCE_DEBUG] updateNonceFromResponse: Available response headers (Angular sees):', response.headers.keys().join(', '));
    for (const key of nonceHeaderKeys) {
      const headerValue = response.headers.get(key);
      console.log(`[WC_SERVICE_NONCE_DEBUG] updateNonceFromResponse: Trying key '${key}', value received by Angular:`, headerValue);
      if (headerValue && headerValue.trim() !== '') {
        foundNonce = headerValue.trim();
        console.log(`[WC_SERVICE_NONCE_DEBUG] updateNonceFromResponse: Found Nonce in response header '${key}':`, foundNonce);
        break;
      }
    }
    if (foundNonce) {
      if (foundNonce !== this.storeApiNonce) { this.storeApiNonce = foundNonce; }
      else { console.log('[WC_SERVICE_NONCE_DEBUG] updateNonceFromResponse: Found Nonce in response ('+foundNonce+') is the same as current. No update.'); }
    } else { console.warn('[WC_SERVICE_NONCE_DEBUG] updateNonceFromResponse: No valid Nonce header found. this.storeApiNonce remains:', this.storeApiNonce); }
  }

  private async fetchAndSetNonceAsync(): Promise<string | null> {
    // Logik bleibt unverändert
    console.log('[WC_SERVICE_NONCE_DEBUG] fetchAndSetNonceAsync: Attempting to fetch/refresh Nonce via GET /cart.');
    const initialHeaders = new HttpHeaders().set('Content-Type', 'application/json');
    try {
      const response = await firstValueFrom(
        this.http.get<WooCommerceStoreCart>(`${this.storeApiUrl}/cart`, { headers: initialHeaders, observe: 'response', withCredentials: true })
      );
      console.log('[WC_SERVICE_NONCE_DEBUG] fetchAndSetNonceAsync: Response from GET /cart received. Status:', response.status);
      this.updateNonceFromResponse(response);
      if (!this.storeApiNonce || this.storeApiNonce.trim() === '') { console.warn('[WC_SERVICE_NONCE_DEBUG] fetchAndSetNonceAsync: No Nonce extracted AFTER GET /cart. Nonce:', this.storeApiNonce); }
      else { console.log('[WC_SERVICE_NONCE_DEBUG] fetchAndSetNonceAsync: Nonce after GET /cart and update attempt:', this.storeApiNonce); }
      return this.storeApiNonce;
    } catch (err: any) {
      console.error(`[WC_SERVICE_NONCE_DEBUG] fetchAndSetNonceAsync: Error during HTTP GET /cart. Status: ${err.status || 'N/A'}, Message: ${err.message || JSON.stringify(err)}, Body: ${err.error ? JSON.stringify(err.error) : 'N/A'}`, err);
      this.storeApiNonce = null; return null;
    } finally { console.log('[WC_SERVICE_NONCE_DEBUG] fetchAndSetNonceAsync: Finalized. Current Nonce:', this.storeApiNonce); }
  }

  private initializeNonce(): void {
    // Logik bleibt unverändert
    if (this.noncePromise) { console.log('[WC_SERVICE_NONCE_DEBUG] initializeNonce: Fetch already in progress.'); return; }
    console.log('[WC_SERVICE_NONCE_DEBUG] initializeNonce: Starting initial Nonce fetch.');
    this.noncePromise = this.fetchAndSetNonceAsync().finally(() => {
        console.log('[WC_SERVICE_NONCE_DEBUG] initializeNonce: Initial fetch promise finalized.'); this.noncePromise = null;
    });
    const currentInitPromise = this.noncePromise;
    if (currentInitPromise) {
        currentInitPromise.then(nonce => {
            if (nonce && nonce.trim() !== '') { console.log('[WC_SERVICE_NONCE_DEBUG] initializeNonce: Initial Nonce successfully set/retrieved. Value from promise:', nonce, 'Current service nonce:', this.storeApiNonce); }
            else { console.warn('[WC_SERVICE_NONCE_DEBUG] initializeNonce: Initial Nonce fetch did NOT yield a Nonce. Value from promise:', nonce, 'Current service nonce:', this.storeApiNonce); }
        }).catch(err => { console.error('[WC_SERVICE_NONCE_DEBUG] initializeNonce: Error during initial Nonce fetch promise:', err.message || err); });
    } else { console.warn('[WC_SERVICE_NONCE_DEBUG] initializeNonce: this.noncePromise was null immediately after assignment. This is unexpected.'); }
  }

  private async ensureNoncePresent(): Promise<string> {
    // Logik bleibt unverändert
    console.log(`[WC_SERVICE_NONCE_DEBUG] ensureNoncePresent: Called. Current Nonce: '${this.storeApiNonce}', Promise active: ${!!this.noncePromise}`);
    if (this.storeApiNonce && this.storeApiNonce.trim() !== '') { console.log('[WC_SERVICE_NONCE_DEBUG] ensureNoncePresent: Nonce already available:', this.storeApiNonce); return this.storeApiNonce; }
    if (this.noncePromise) {
      console.log('[WC_SERVICE_NONCE_DEBUG] ensureNoncePresent: Waiting for ongoing Nonce fetch.');
      try {
        const nonceFromOngoing = await this.noncePromise;
        if (nonceFromOngoing && nonceFromOngoing.trim() !== '') {
          console.log('[WC_SERVICE_NONCE_DEBUG] ensureNoncePresent: Nonce from ongoing fetch:', nonceFromOngoing);
          if (this.storeApiNonce && this.storeApiNonce.trim() !== '') { return this.storeApiNonce; }
          else { this.storeApiNonce = nonceFromOngoing; return nonceFromOngoing; }
        } else { console.warn('[WC_SERVICE_NONCE_DEBUG] ensureNoncePresent: Ongoing fetch resolved to null/empty.'); }
      } catch (error: any) { console.error('[WC_SERVICE_NONCE_DEBUG] ensureNoncePresent: Error waiting for ongoing fetch.', error.message || error); }
    }
    console.warn('[WC_SERVICE_NONCE_DEBUG] ensureNoncePresent: Nonce is null/empty. Attempting new fetch.');
    const newPromise = this.fetchAndSetNonceAsync(); this.noncePromise = newPromise;
    try {
      const refreshedNonce = await newPromise;
      if (this.storeApiNonce && this.storeApiNonce.trim() !== '') { console.log('[WC_SERVICE_NONCE_DEBUG] ensureNoncePresent: Nonce refreshed (this.storeApiNonce set):', this.storeApiNonce); return this.storeApiNonce; }
      else if (refreshedNonce && refreshedNonce.trim() !== '') { this.storeApiNonce = refreshedNonce; console.warn('[WC_SERVICE_NONCE_DEBUG] ensureNoncePresent: Nonce refreshed (promise value used):', refreshedNonce); return refreshedNonce; }
      else { console.error('[WC_SERVICE_NONCE_DEBUG] ensureNoncePresent: Failed to refresh Nonce.'); throw new Error('Nonce missing and could not be refreshed.'); }
    } catch (error: any) { if (this.noncePromise === newPromise) { this.noncePromise = null; } throw error;
    } finally { if (this.noncePromise === newPromise) { this.noncePromise = null; console.log('[WC_SERVICE_NONCE_DEBUG] ensureNoncePresent: Cleared new fetch promise.'); } }
  }

  // --- Standard V3 API Methods (Products, Categories) ---
  // Logik bleibt unverändert, ggf. console.logs auskommentieren für weniger Output
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

  // --- Store API Methods (Cart) ---
  getWcCart(): Observable<WooCommerceStoreCart | null> {
    console.log('[WC_SERVICE_NONCE_DEBUG] getWcCart: Attempting to GET /cart.');
    const headers = this.getStoreApiHeaders();
    return this.http.get<WooCommerceStoreCart>(`${this.storeApiUrl}/cart`, { headers, observe: 'response', withCredentials: true })
      .pipe(tap((res: HttpResponse<WooCommerceStoreCart | null>) => { console.log('[WC_SERVICE_NONCE_DEBUG] getWcCart: Response Status:', res.status); this.updateNonceFromResponse(res); }), map(res => res.body),
        catchError(err => { if (err.status === 404 && (err.error?.code === 'woocommerce_rest_cart_empty' || err.error?.code === 'cocart_cart_empty')) { return of(null); } return this.handleError(err); }));
  }

  addItemToWcCart(productId: number, quantity: number, variationId?: number): Observable<WooCommerceStoreCart | null> {
    console.log(`[WC_SERVICE_NONCE_DEBUG] addItemToWcCart: INIT. ProductId: ${productId}, Qty: ${quantity}, VarId: ${variationId}`);
    return from(this.ensureNoncePresent()).pipe(
      switchMap((nonceValueFromEnsure) => {
        console.log(`[WC_SERVICE_NONCE_DEBUG] addItemToWcCart: switchMap after ensureNoncePresent. Nonce: '${nonceValueFromEnsure}'. Current Nonce: '${this.storeApiNonce}'`);
        if (!this.storeApiNonce || this.storeApiNonce.trim() === '' || this.storeApiNonce !== nonceValueFromEnsure) {
            console.warn(`[WC_SERVICE_NONCE_DEBUG] addItemToWcCart: Mismatch or null/empty Nonce after ensure! From ensure: ${nonceValueFromEnsure}, Current: ${this.storeApiNonce}.`);
        }
        const headers = this.getStoreApiHeaders();
        const requestUrl = `${this.storeApiUrl}/cart/add-item`;
        let params = new HttpParams();
        let body: any = {};

        if (!variationId) {
            params = params.set('id', productId.toString());
            params = params.set('quantity', quantity.toString());
            body = {};
            console.log(`[WC_SERVICE_NONCE_DEBUG] addItemToWcCart: SIMPLE product. URL Params: id=${productId}, quantity=${quantity}. Header X-WC-Store-API-Nonce: ${headers.get('X-WC-Store-API-Nonce')}`);
            return this.http.post<WooCommerceStoreCart>(requestUrl, body, { headers, params, observe: 'response', withCredentials: true });
        } else {
            body = { id: productId, quantity: quantity, variation_id: variationId };
            console.log(`[WC_SERVICE_NONCE_DEBUG] addItemToWcCart: VARIABLE product. Body: ${JSON.stringify(body)}. Header X-WC-Store-API-Nonce: ${headers.get('X-WC-Store-API-Nonce')}`);
            return this.http.post<WooCommerceStoreCart>(requestUrl, body, { headers, observe: 'response', withCredentials: true });
        }
      }),
      tap((response: HttpResponse<WooCommerceStoreCart | null>) => { console.log('[WC_SERVICE_NONCE_DEBUG] addItemToWcCart: Received response POST. Status:', response.status); this.updateNonceFromResponse(response); }),
      map((response: HttpResponse<WooCommerceStoreCart | null>) => response.body),
      catchError(err => { console.error('[WC_SERVICE_NONCE_DEBUG] addItemToWcCart: Error in HTTP call.', err); return this.handleError(err); })
    );
  }

  updateWcCartItemQuantity(itemKey: string, quantity: number): Observable<WooCommerceStoreCart | null> {
    console.log(`[WC_SERVICE_NONCE_DEBUG] updateWcCartItemQuantity: INIT. ItemKey: ${itemKey}, Qty: ${quantity}`);
    return from(this.ensureNoncePresent()).pipe(
      switchMap((nonceValueFromEnsure) => {
        const headers = this.getStoreApiHeaders();
        const body = { key: itemKey, quantity };
        console.log('[WC_SERVICE_NONCE_DEBUG] updateWcCartItemQuantity: Sending POST. Body:', JSON.stringify(body), 'Nonce Header:', headers.get('X-WC-Store-API-Nonce'));
        return this.http.post<WooCommerceStoreCart>(`${this.storeApiUrl}/cart/update-item`, body, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => { this.updateNonceFromResponse(res); }), map(res => res.body), catchError(err => this.handleError(err)));
  }

  removeWcCartItem(itemKey: string): Observable<WooCommerceStoreCart | null> {
    console.log(`[WC_SERVICE_NONCE_DEBUG] removeWcCartItem: INIT. ItemKey: ${itemKey}`);
    return from(this.ensureNoncePresent()).pipe(
      switchMap((nonceValueFromEnsure) => {
        const headers = this.getStoreApiHeaders();
        const body = { key: itemKey };
        console.log('[WC_SERVICE_NONCE_DEBUG] removeWcCartItem: Sending POST. Body:', JSON.stringify(body), 'Nonce Header:', headers.get('X-WC-Store-API-Nonce'));
        return this.http.post<WooCommerceStoreCart>(`${this.storeApiUrl}/cart/remove-item`, body, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => { this.updateNonceFromResponse(res); }), map(res => res.body), catchError(err => this.handleError(err)));
  }

  clearWcCart(): Observable<WooCommerceStoreCart | null> {
    console.log(`[WC_SERVICE_NONCE_DEBUG] clearWcCart: INIT.`);
    return from(this.ensureNoncePresent()).pipe(
      switchMap((nonceValueFromEnsure) => {
        const headers = this.getStoreApiHeaders();
        console.log('[WC_SERVICE_NONCE_DEBUG] clearWcCart: Sending POST. Nonce Header:', headers.get('X-WC-Store-API-Nonce'));
        return this.http.post<WooCommerceStoreCart>(`${this.storeApiUrl}/cart/clear`, {}, { headers, observe: 'response', withCredentials: true });
      }),
      tap((res: HttpResponse<WooCommerceStoreCart | null>) => { this.updateNonceFromResponse(res); }), map(res => res.body), catchError(err => this.handleError(err)));
  }

  getCheckoutUrl(): string { return `${this.storeUrl}/checkout`; }

  private handleError(error: any): Observable<never> {
    console.error('[WC_SERVICE_NONCE_DEBUG] handleError: WooCommerce API Service Error encountered IN handleError.', error);
    let errorMessage = `[WC_SERVICE_NONCE_DEBUG] handleError: An unknown error occurred with WooCommerce API! Status: ${error.status || 'N/A'}`;

    // --- BEGINN SSR-sichere Fehlerbehandlung ---
    if (typeof ErrorEvent !== 'undefined' && error.error instanceof ErrorEvent) {
      // A client-side or network error occurred. Handle it accordingly.
      errorMessage = `[WC_SERVICE_NONCE_DEBUG] handleError: Client-side/network error (ErrorEvent): ${error.error.message}`;
    } else if (isPlatformBrowser(this.platformId) && typeof ProgressEvent !== 'undefined' && error.error instanceof ProgressEvent && error.error.type === 'error') {
      // Alternativer Check für Client-Netzwerkfehler, die manchmal als ProgressEvent kommen
      errorMessage = `[WC_SERVICE_NONCE_DEBUG] handleError: Client-side network error (ProgressEvent): ${error.message}`;
    }
    // --- ENDE SSR-sichere Fehlerbehandlung ---
    else if (error.status !== undefined) { // Backend-returned error
      let serverMsg = 'No specific server message found in error.error.';
      let serverCode = 'No specific server code found in error.error.';
      const httpStatus = error.status;
      const errorUrl = error.url || 'N/A';

      if (error.error) {
        if (typeof error.error === 'string') {
          serverMsg = error.error;
        } else if (typeof error.error === 'object') {
          serverMsg = error.error.message || JSON.stringify(error.error);
          serverCode = error.error.code || serverCode;
          if (error.error.data && typeof error.error.data === 'object') {
            serverMsg += ` | Data Status: ${error.error.data.status || 'N/A'}`;
            if (error.error.data.details) {
              let detailsString = '';
              if (typeof error.error.data.details === 'object') {
                detailsString = Object.entries(error.error.data.details)
                                     .map(([key, val_obj]: [string, any]) => `${key}: ${val_obj.message || JSON.stringify(val_obj)}`)
                                     .join(', ');
              } else {
                detailsString = JSON.stringify(error.error.data.details);
              }
              serverMsg += ` | Details: ${detailsString}`;
            }
          } else if (Array.isArray(error.error) && error.error.length > 0 && typeof error.error[0] === 'object') {
            serverMsg = error.error[0].message || JSON.stringify(error.error[0]);
            serverCode = error.error[0].code || serverCode;
          }
        }
      } else if (error.message) {
        serverMsg = error.message;
      }
      errorMessage = `[WC_SERVICE_NONCE_DEBUG] handleError: WooCommerce API Error! HTTP Status: ${httpStatus}. Server Code: ${serverCode}. Server Message: ${serverMsg}. URL: ${errorUrl}`;
    } else if (error.message) { // Fallback für andere JS-Fehler
      errorMessage = `[WC_SERVICE_NONCE_DEBUG] handleError: Generic error with message: ${error.message}`;
    } else if (typeof error === 'string') { // Fallback, wenn der Fehler nur ein String ist
        errorMessage = `[WC_SERVICE_NONCE_DEBUG] handleError: Generic error: ${error}`;
    }


    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}