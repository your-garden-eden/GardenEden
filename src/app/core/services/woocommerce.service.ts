import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

// --- WooCommerce Data Interfaces ---

export interface WooCommerceImage {
  id: number;
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
  src: string;
  name: string;
  alt: string;
  position?: number; // For product gallery images
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
  id: number; // ID of the global attribute taxonomy (0 if product-local attribute)
  name: string; // Attribute name (e.g., "Color")
  slug?: string; // Attribute slug
  position: number;
  visible: boolean; // If visible on the product page.
  variation: boolean; // If used for variations.
  options: string[]; // Array of available term names (e.g., ["Blue", "Green", "Red"])
}

export interface WooCommerceDefaultAttribute {
  id: number; // ID of the global attribute taxonomy
  name: string; // Attribute name
  option: string; // Selected default option slug for this attribute
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
  price: string; // Current dynamic price.
  regular_price: string; // Regular price.
  sale_price: string; // Sale price.
  date_on_sale_from: string | null;
  date_on_sale_from_gmt: string | null;
  date_on_sale_to: string | null;
  date_on_sale_to_gmt: string | null;
  on_sale: boolean;
  purchasable: boolean;
  total_sales: number;
  virtual: boolean;
  downloadable: boolean;
  downloads?: any[]; // Define if needed
  download_limit?: number;
  download_expiry?: number;
  external_url?: string;
  button_text?: string;
  tax_status: 'taxable' | 'shipping' | 'none';
  tax_class?: string;
  manage_stock: boolean; // Stock management at product level.
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
  parent_id: number; // 0 for simple products. For variations, it's the parent product ID.
  purchase_note?: string;
  categories: WooCommerceCategoryRef[];
  tags: WooCommerceTagRef[];
  images: WooCommerceImage[];
  attributes: WooCommerceAttribute[]; // Attributes defined for the product (options are all possible values)
  default_attributes: WooCommerceDefaultAttribute[]; // Default selected attributes for variable products
  variations: number[]; // Array of variation IDs (for type 'variable')
  grouped_products?: number[];
  menu_order: number;
  price_html?: string;
  meta_data: WooCommerceMetaData[];
  // _links?: any; // Links to related resources
}

export interface WooCommerceProductVariation {
  id: number; // Variation ID
  date_created: string;
  date_created_gmt: string;
  date_modified: string;
  date_modified_gmt: string;
  description: string;
  permalink: string;
  sku: string;
  price: string; // Current dynamic price of the variation.
  regular_price: string;
  sale_price: string;
  date_on_sale_from: string | null;
  date_on_sale_from_gmt: string | null;
  date_on_sale_to: string | null;
  date_on_sale_to_gmt: string | null;
  on_sale: boolean;
  status: 'publish' | 'private' | 'draft'; // Simplified statuses for variations
  purchasable: boolean;
  virtual: boolean;
  downloadable: boolean;
  downloads?: any[];
  download_limit?: number;
  download_expiry?: number;
  tax_status: 'taxable' | 'shipping' | 'none' | 'parent';
  tax_class?: string; // Can be 'parent'
  manage_stock: boolean; // Stock management at variation level.
  stock_quantity: number | null;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  backorders: 'no' | 'notify' | 'yes';
  backorders_allowed: boolean;
  backordered: boolean;
  low_stock_amount: number | null; // Inherited from parent if null
  weight: string | null; // Inherited from parent if null
  dimensions: WooCommerceProductDimension; // Inherited from parent if all dimensions are null
  shipping_class?: string; // Inherited from parent if null
  shipping_class_id: number; // Inherited from parent if 0
  image: WooCommerceImage | null; // Variation specific image
  // Attributes for this specific variation (selected options)
  attributes: {
    id: number; // ID of the global attribute taxonomy
    name: string; // Attribute name (e.g., "Color")
    slug?: string; // Attribute slug (e.g., "color")
    option: string; // Selected term slug for this variation (e.g., "blue")
  }[];
  menu_order: number;
  meta_data: WooCommerceMetaData[];
  // _links?: any;
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
  // _links?: any;
}


@Injectable({
  providedIn: 'root',
})
export class WoocommerceService {
  private http = inject(HttpClient);

  private apiUrl = environment.woocommerce.apiUrl;
  private consumerKey = environment.woocommerce.consumerKey;
  private consumerSecret = environment.woocommerce.consumerSecret;
  private storeUrl = environment.woocommerce.storeUrl;

  constructor() {
    if (!this.apiUrl || !this.consumerKey || !this.consumerSecret || !this.storeUrl) {
      console.error(
        'WooCommerce API URL, Consumer Key, Consumer Secret, or Store URL is not set in environment variables.'
      );
    }
  }

  private getAuthParams(): HttpParams {
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

  getProducts(
    categoryId?: number,
    perPage: number = 10,
    page: number = 1,
    otherParams?: HttpParams
  ): Observable<WooCommerceProduct[]> {
    let params = this.getAuthParams()
      .set('per_page', perPage.toString())
      .set('page', page.toString());

    if (categoryId) {
      params = params.set('category', categoryId.toString());
    }
    params = this.appendParams(params, otherParams);

    return this.http
      .get<WooCommerceProduct[]>(`${this.apiUrl}products`, { params })
      .pipe(catchError(this.handleError));
  }

  getProductById(productId: number): Observable<WooCommerceProduct> {
    const params = this.getAuthParams();
    return this.http
      .get<WooCommerceProduct>(`${this.apiUrl}products/${productId}`, { params })
      .pipe(catchError(this.handleError));
  }

  getProductBySlug(productSlug: string): Observable<WooCommerceProduct | undefined> {
    const params = this.getAuthParams().set('slug', productSlug);
    return this.http
      .get<WooCommerceProduct[]>(`${this.apiUrl}products`, { params })
      .pipe(
        map(products => {
          if (products && products.length > 0) {
            return products[0];
          }
          return undefined;
        }),
        catchError(this.handleError)
      );
  }

  getProductVariations(productId: number): Observable<WooCommerceProductVariation[]> {
    const params = this.getAuthParams().set('per_page', '100'); // Holen bis zu 100 Variationen
    return this.http
      .get<WooCommerceProductVariation[]>(`${this.apiUrl}products/${productId}/variations`, { params })
      .pipe(catchError(this.handleError));
  }

  getCategories(parentId?: number, otherParams?: HttpParams): Observable<WooCommerceCategory[]> {
    let params = this.getAuthParams();
    if (parentId !== undefined) {
      params = params.set('parent', parentId.toString());
    }
    if (!otherParams || !otherParams.has('hide_empty')) {
        params = params.set('hide_empty', 'true');
    }
    params = this.appendParams(params, otherParams);

    return this.http
      .get<WooCommerceCategory[]>(`${this.apiUrl}products/categories`, { params })
      .pipe(catchError(this.handleError));
  }

  getCategoryBySlug(categorySlug: string): Observable<WooCommerceCategory | undefined> {
    const params = this.getAuthParams().set('slug', categorySlug);
    return this.http
      .get<WooCommerceCategory[]>(`${this.apiUrl}products/categories`, { params })
      .pipe(
        map(categories => (categories && categories.length > 0 ? categories[0] : undefined)),
        catchError(this.handleError)
      );
  }

  getCheckoutUrl(): string {
    return `${this.storeUrl}/checkout`;
  }

  private handleError(error: any): Observable<never> {
    console.error('WooCommerce API Error:', error);
    let errorMessage = 'An unknown error occurred with WooCommerce API!';
    if (error.error instanceof ErrorEvent) {
      errorMessage = `Client-side error: ${error.error.message}`;
    } else if (error.status) {
      errorMessage = `WooCommerce API Error Code: ${error.status}\nMessage: ${error.message || (error.error && error.error.message)}`;
      if (error.error && typeof error.error.message === 'string') {
        // Bereits abgedeckt
      } else if (error.error && Array.isArray(error.error) && error.error.length > 0 && typeof error.error[0].message === 'string') {
        errorMessage += `\nServer Message: ${error.error[0].message}`;
      }
    }
    return throwError(() => new Error(errorMessage));
  }
}