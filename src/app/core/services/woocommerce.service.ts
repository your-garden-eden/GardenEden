// /src/app/core/services/woocommerce.service.ts
import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

// --- WooCommerce Data Interfaces (Basis) ---
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
  attributes: {
    id: number;
    name: string;
    slug?: string;
    option: string;
  }[];
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

export interface WooCommerceStoreCartItemImage { id: number; src: string; thumbnail: string; srcset: string; sizes: string; name: string; alt: string; }
export interface WooCommerceStoreCartItemTotals { line_subtotal: string; line_subtotal_tax: string; line_total: string; line_total_tax: string; currency_code: string; currency_symbol: string; currency_minor_unit: number; currency_decimal_separator: string; currency_thousand_separator: string; currency_prefix: string; currency_suffix: string; }
export interface WooCommerceStoreCartItem { key: string; id: number; quantity: number; name: string; short_description?: string; description?: string; sku?: string; low_stock_remaining?: number | null; backorders_allowed?: boolean; show_backorder_badge?: boolean; sold_individually?: boolean; permalink?: string; images: WooCommerceStoreCartItemImage[]; variation: { attribute: string; value: string }[]; item_data?: any[]; prices?: { price: string; regular_price: string; sale_price: string; price_range: null | { min_amount: string; max_amount: string }; currency_code: string; }; totals: WooCommerceStoreCartItemTotals; catalog_visibility?: string; }
export interface WooCommerceStoreCartTotals { total_items: string; total_items_tax: string; total_price: string; total_tax: string; total_shipping?: string; total_shipping_tax?: string; total_discount?: string; total_discount_tax?: string; currency_code: string; currency_symbol: string; }
export interface WooCommerceStoreCartCoupon { code: string; discount_type: string; totals: WooCommerceStoreCartTotals; }
export interface WooCommerceStoreCart { coupons: WooCommerceStoreCartCoupon[]; shipping_rates: any[]; shipping_address: any; billing_address: any; items: WooCommerceStoreCartItem[]; items_count: number; items_weight: number; needs_payment: boolean; needs_shipping: boolean; has_calculated_shipping: boolean; totals: WooCommerceStoreCartTotals; _links?: any; extensions?: object; }

@Injectable({
  providedIn: 'root',
})
export class WoocommerceService {
  private http = inject(HttpClient);
  private apiUrlV3 = environment.woocommerce.apiUrl;
  private storeApiUrl = `${environment.woocommerce.storeUrl}/wp-json/wc/store/v1`;
  private consumerKey = environment.woocommerce.consumerKey;
  private consumerSecret = environment.woocommerce.consumerSecret;
  private storeUrl = environment.woocommerce.storeUrl;
  private storeApiNonce: string | null = null;

  constructor() {
    if (!this.apiUrlV3 || !this.consumerKey || !this.consumerSecret || !this.storeUrl) {
      console.error('WooCommerce Core API URL, Consumer Key, Consumer Secret, or Store URL is not set in environment variables.');
    }
    if (!this.storeApiUrl.startsWith('http')) {
      console.error('WooCommerce Store API URL seems to be misconfigured.');
    }
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
        if (value !== null && value !== undefined) {
          newParams = newParams.set(key, value as string);
        }
      });
    }
    return newParams;
  }

  private getStoreApiHeaders(): HttpHeaders {
    let headers = new HttpHeaders().set('Content-Type', 'application/json');
    console.log('WoocommerceService: getStoreApiHeaders - Current this.storeApiNonce BEFORE setting header:', this.storeApiNonce); // *** DEBUG LOG HINZUGEFÜGT ***
    if (this.storeApiNonce) {
      headers = headers.set('X-WC-Store-API-Nonce', this.storeApiNonce);
    }
    return headers;
  }

  private updateNonceFromResponse(response: HttpResponse<any>): void {
    // Versuche verschiedene gängige Nonce-Header-Namen
    const nonce = response.headers.get('Nonce') || 
                  response.headers.get('X-WP-Nonce') || 
                  response.headers.get('X-WC-Store-API-Nonce');
                  
    if (nonce && nonce.trim() !== '') { // Stelle sicher, dass Nonce nicht leer ist
      if (nonce !== this.storeApiNonce) {
        this.storeApiNonce = nonce;
        console.log('WoocommerceService: Store API Nonce updated to:', this.storeApiNonce);
      } else {
        // console.log('WoocommerceService: Nonce received is same as current, no update needed.');
      }
    } else if (this.storeApiNonce) {
      // Wenn kein Nonce in der Antwort ist, aber wir einen alten hatten, behalten wir ihn erstmal?
      // Oder setzen wir ihn auf null, um einen frischen beim nächsten GET zu erzwingen?
      // Für den Moment: Nicht ändern, wenn kein neuer Nonce kommt.
      // console.warn('WoocommerceService: No new Nonce header found in response, keeping old one (if any).');
    }
  }

  getProducts( categoryId?: number, perPage: number = 10, page: number = 1, otherParams?: HttpParams ): Observable<WooCommerceProductsResponse> { let params = this.getAuthParamsV3() .set('per_page', perPage.toString()) .set('page', page.toString()); if (categoryId) { params = params.set('category', categoryId.toString()); } params = this.appendParams(params, otherParams); return this.http .get<WooCommerceProduct[]>(`${this.apiUrlV3}products`, { params, observe: 'response' }) .pipe( map((response: HttpResponse<WooCommerceProduct[]>) => { const products = response.body || []; const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '0', 10); const totalCount = parseInt(response.headers.get('X-WP-Total') || '0', 10); return { products, totalPages, totalCount }; }), catchError(this.handleError) ); }
  getProductById(productId: number): Observable<WooCommerceProduct> { const params = this.getAuthParamsV3(); return this.http .get<WooCommerceProduct>(`${this.apiUrlV3}products/${productId}`, { params }) .pipe(catchError(this.handleError)); }
  getProductBySlug(productSlug: string): Observable<WooCommerceProduct | undefined> { const params = this.getAuthParamsV3().set('slug', productSlug); return this.http .get<WooCommerceProduct[]>(`${this.apiUrlV3}products`, { params }) .pipe( map(products => (products && products.length > 0 ? products[0] : undefined)), catchError(this.handleError) ); }
  getProductVariations(productId: number): Observable<WooCommerceProductVariation[]> { const params = this.getAuthParamsV3().set('per_page', '100'); return this.http .get<WooCommerceProductVariation[]>(`${this.apiUrlV3}products/${productId}/variations`, { params }) .pipe(catchError(this.handleError)); }
  getCategories(parentId?: number, otherParams?: HttpParams): Observable<WooCommerceCategory[]> { let params = this.getAuthParamsV3(); if (parentId !== undefined) { params = params.set('parent', parentId.toString()); } if (!otherParams || !otherParams.has('hide_empty')) { params = params.set('hide_empty', 'true'); } params = this.appendParams(params, otherParams); return this.http .get<WooCommerceCategory[]>(`${this.apiUrlV3}products/categories`, { params }) .pipe(catchError(this.handleError)); }
  getCategoryBySlug(categorySlug: string): Observable<WooCommerceCategory | undefined> { const params = this.getAuthParamsV3().set('slug', categorySlug); return this.http .get<WooCommerceCategory[]>(`${this.apiUrlV3}products/categories`, { params }) .pipe( map(categories => (categories && categories.length > 0 ? categories[0] : undefined)), catchError(this.handleError) ); }

  getWcCart(): Observable<WooCommerceStoreCart | null> {
    const headers = this.getStoreApiHeaders();
    // console.log('WoocommerceService: GET /cart with headers:', headers.keys().map(k => `${k}: ${headers.get(k)}`));
    return this.http.get<WooCommerceStoreCart>(`${this.storeApiUrl}/cart`, { headers, observe: 'response', withCredentials: true })
      .pipe(
        tap((response: HttpResponse<WooCommerceStoreCart | null>) => this.updateNonceFromResponse(response)),
        map((response: HttpResponse<WooCommerceStoreCart | null>) => response.body),
        catchError(err => {
          console.error('WoocommerceService: Error fetching cart from API', err);
          if (err.status === 404 && (err.error?.code === 'woocommerce_rest_cart_empty' || err.error?.code === 'cocart_cart_empty')) {
             return of(null);
          }
          return throwError(() => new Error(err.error?.message || err.message || 'Failed to fetch cart'));
        })
      );
  }

  addItemToWcCart(productId: number, quantity: number, variationId?: number): Observable<WooCommerceStoreCart | null> {
    const headers = this.getStoreApiHeaders();
    const body: any = { id: productId, quantity: quantity };
    if (variationId) { body.variation_id = variationId; }
    // console.log('WoocommerceService: POST /cart/add-item with body:', body, 'and headers:', headers.keys().map(k => `${k}: ${headers.get(k)}`));
    return this.http.post<WooCommerceStoreCart>(`${this.storeApiUrl}/cart/add-item`, body, { headers, observe: 'response', withCredentials: true })
      .pipe(
        tap((response: HttpResponse<WooCommerceStoreCart | null>) => this.updateNonceFromResponse(response)),
        map((response: HttpResponse<WooCommerceStoreCart | null>) => response.body),
        catchError(this.handleError)
      );
  }

  updateWcCartItemQuantity(itemKey: string, quantity: number): Observable<WooCommerceStoreCart | null> {
    const headers = this.getStoreApiHeaders();
    const body = { quantity };
    // console.log(`WoocommerceService: POST /cart/items/${itemKey} with body:`, body, 'and headers:', headers.keys().map(k => `${k}: ${headers.get(k)}`));
    return this.http.post<WooCommerceStoreCart>(`${this.storeApiUrl}/cart/items/${itemKey}`, body, { headers, observe: 'response', withCredentials: true })
      .pipe(
        tap((response: HttpResponse<WooCommerceStoreCart | null>) => this.updateNonceFromResponse(response)),
        map((response: HttpResponse<WooCommerceStoreCart | null>) => response.body),
        catchError(this.handleError)
      );
  }

  removeWcCartItem(itemKey: string): Observable<WooCommerceStoreCart | null> {
    const headers = this.getStoreApiHeaders();
    // console.log(`WoocommerceService: DELETE /cart/items/${itemKey} with headers:`, headers.keys().map(k => `${k}: ${headers.get(k)}`));
    return this.http.delete<WooCommerceStoreCart>(`${this.storeApiUrl}/cart/items/${itemKey}`, { headers, observe: 'response', withCredentials: true })
      .pipe(
        tap((response: HttpResponse<WooCommerceStoreCart | null>) => this.updateNonceFromResponse(response)),
        map((response: HttpResponse<WooCommerceStoreCart | null>) => response.body),
        catchError(this.handleError)
      );
  }

  clearWcCart(): Observable<WooCommerceStoreCart | null> {
    const headers = this.getStoreApiHeaders();
    // console.log('WoocommerceService: POST /cart/clear with headers:', headers.keys().map(k => `${k}: ${headers.get(k)}`));
    return this.http.post<WooCommerceStoreCart>(`${this.storeApiUrl}/cart/clear`, {}, { headers, observe: 'response', withCredentials: true })
      .pipe(
        tap((response: HttpResponse<WooCommerceStoreCart | null>) => this.updateNonceFromResponse(response)),
        map((response: HttpResponse<WooCommerceStoreCart | null>) => response.body),
        catchError(this.handleError)
      );
  }

  getCheckoutUrl(): string {
    return `${this.storeUrl}/checkout`;
  }

  private handleError(error: any): Observable<never> {
    console.error('WooCommerce API Service Error:', error);
    let errorMessage = 'An unknown error occurred with WooCommerce API!';
    if (error.error instanceof ErrorEvent) {
      errorMessage = `Client-side error: ${error.error.message}`;
    } else {
      errorMessage = `WooCommerce API Error Code: ${error.status || 'N/A'}\nMessage: ${error.message || 'Server error'}`;
      if (error.error && typeof error.error === 'object') {
        const wcError = error.error;
        if (wcError.message) { errorMessage += `\nServer Message: ${wcError.message}`; }
        if (wcError.code) { errorMessage += `\nServer Code: ${wcError.code}`; }
        if (wcError.data && wcError.data.details) {
            Object.keys(wcError.data.details).forEach(key => {
                const detail = wcError.data.details[key];
                errorMessage += `\nDetail (${key}): ${detail.message || JSON.stringify(detail)}`;
            });
        } else if (Array.isArray(wcError) && wcError.length > 0 && wcError[0].message) {
             errorMessage += `\nServer Message: ${wcError[0].message}`;
        } else if (typeof wcError === 'string') {
            errorMessage += `\nServer Response: ${wcError}`;
        }
      } else if (typeof error.error === 'string') {
        errorMessage += `\nServer Response: ${error.error}`;
      }
    }
    return throwError(() => new Error(errorMessage));
  }
}