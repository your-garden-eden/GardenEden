import { Injectable } from '@angular/core';
import { GraphQLClient } from 'graphql-request';
import { environment } from '../../../environments/environment';

export interface ShopifyImage { url: string; altText?: string | null; }
export interface ShopifyPrice { amount: string; currencyCode: string; }
export interface ShopifyProductVariant { id: string; title: string; sku?: string | null; availableForSale: boolean; quantityAvailable?: number | null; price: ShopifyPrice; image?: ShopifyImage | null; selectedOptions?: { name: string; value: string; }[] | null; }
export interface ShopifyProductOption { id: string; name: string; values: string[]; }

export interface Product {
  id: string;
  title: string;
  handle: string;
  descriptionHtml?: string | null;
  vendor?: string | null;
  availableForSale?: boolean | null;
  priceRange: {
    minVariantPrice: ShopifyPrice;
    maxVariantPrice?: ShopifyPrice | null;
  };
  images: { edges: { node: ShopifyImage }[] };
  variants: { edges: { node: ShopifyProductVariant }[] };
  options?: ShopifyProductOption[] | null;
  cursor?: string;
}

export interface PageInfo { hasNextPage: boolean; endCursor?: string | null; }

export interface CollectionQueryResult {
  title: string;
  products: {
      edges: {
          cursor: string;
          node: Product;
      }[];
      pageInfo: PageInfo;
  }
}

export interface CartLineInput { merchandiseId: string; quantity: number; }
export interface CartLineUpdateInput { id: string; merchandiseId?: string; quantity?: number; }
export interface CartLineEdgeNode { id: string; quantity: number; merchandise: { id: string; title: string; price: ShopifyPrice; image?: ShopifyImage | null; product: { handle: string; title: string; }; }; }
export interface Cart { id: string; checkoutUrl: string; cost: { subtotalAmount: ShopifyPrice; totalAmount: ShopifyPrice; totalTaxAmount?: ShopifyPrice | null; }; lines: { edges: { node: CartLineEdgeNode; }[]; }; totalQuantity: number; note?: string | null; }
interface UserError { field: string[] | null; message: string; }
interface CartResponse { cart: Cart | null; userErrors: UserError[]; }
interface CartCreatePayload { cartCreate: CartResponse | null; }
interface CartLinesAddPayload { cartLinesAdd: CartResponse | null; }
interface CartLinesUpdatePayload { cartLinesUpdate: CartResponse | null; }
interface CartLinesRemovePayload { cartLinesRemove: CartResponse | null; }
interface CartFetchPayload { cart: Cart | null; }

const CartFragment = `fragment CartFragment on Cart { id checkoutUrl cost { subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } totalTaxAmount { amount currencyCode } } lines(first: 100) { edges { node { id quantity merchandise { ... on ProductVariant { id title price { amount currencyCode } image { url altText } product { handle title } } }}}} totalQuantity note }`;
const CartCreateMutation = `mutation cartCreate($input: CartInput!) { cartCreate(input: $input) { cart { ...CartFragment } userErrors { field message } } } ${CartFragment}`;
const CartLinesAddMutation = `mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ...CartFragment } userErrors { field message } } } ${CartFragment}`;
const CartLinesUpdateMutation = `mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ...CartFragment } userErrors { field message } } } ${CartFragment}`;
const CartLinesRemoveMutation = `mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) { cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ...CartFragment } userErrors { field message } } } ${CartFragment}`;
const CartFetchQuery = `query cartFetch($id: ID!) { cart(id: $id) { ...CartFragment } } ${CartFragment}`;

@Injectable({
  providedIn: 'root'
})
export class ShopifyService {
  private storefrontEndpoint = environment.shopify.storefrontEndpoint;
  private storefrontAccessToken = environment.shopify.storefrontAccessToken;
  private storefrontClient: GraphQLClient;

  constructor() {
    if (!this.storefrontEndpoint || !this.storefrontAccessToken || !this.isValidUrl(this.storefrontEndpoint)) {
      console.error('Shopify Storefront Endpoint is missing, invalid, or Access Token missing in environment variables!', { endpoint: this.storefrontEndpoint });
      this.storefrontClient = new GraphQLClient('http://invalid-endpoint');
      return;
    }
     this.storefrontClient = new GraphQLClient(
       this.storefrontEndpoint,
       { headers: { 'X-Shopify-Storefront-Access-Token': this.storefrontAccessToken } }
     );
   }

   private isValidUrl(url: string): boolean {
       try {
           new URL(url);
           return true;
       } catch (_) {
           return false;
       }
   }

  async getProductByHandle(handle: string): Promise<Product | null> {
     const query = `
       query getProductByHandle($handle: String!) {
         product(handle: $handle) {
           id title handle descriptionHtml vendor availableForSale
           priceRange { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
           images(first: 10) { edges { node { url altText } } }
           variants(first: 10) { edges { node { id title sku availableForSale quantityAvailable price { amount currencyCode } image { url altText } selectedOptions { name value } } } }
           options { id name values }
         }
       }
     `;
     try {
        const data: { product: Product | null } = await this.storefrontClient.request(query, { handle });
        return data.product;
     } catch (error) {
        console.error(`ShopifyService: Fehler beim Abrufen von Produkt ${handle}:`, error);
        return null;
     }
  }

   async getProductsByCollectionHandle(
      handle: string,
      limit: number = 12,
      cursor: string | null = null
    ): Promise<CollectionQueryResult | null> {
       const query = `
          query getProductsByCollection($handle: String!, $limit: Int!, $cursor: String) {
              collection(handle: $handle) {
                  title
                  products(first: $limit, after: $cursor) {
                      edges {
                          cursor
                          node {
                              id title handle vendor availableForSale
                              priceRange { minVariantPrice { amount currencyCode } }
                              images(first: 1) { edges { node { url(transform: {maxWidth: 400, maxHeight: 400, preferredContentType: WEBP}) altText } } }
                              variants(first: 1) { edges { node { id availableForSale price { amount currencyCode } } } }
                          }
                      }
                      pageInfo { hasNextPage endCursor }
                  }
              }
          }
      `;
       try {
           const variables = { handle, limit, cursor };
           type ShopifyResponse = { collection: CollectionQueryResult | null };
           const data = await this.storefrontClient.request<ShopifyResponse>(query, variables);
           if (!data || !data.collection) {
              console.warn(`Collection ${handle} nicht gefunden.`);
              return null;
           }
           return data.collection;
       } catch (error) {
           console.error(`ShopifyService: Fehler beim Abrufen von Collection ${handle}:`, error);
           return null;
       }
    }

   async createCart(lines?: CartLineInput[], note?: string): Promise<Cart | null> {
    const variables = { input: { lines: lines || [], note: note } };
    try {
      const data = await this.storefrontClient.request<CartCreatePayload>(CartCreateMutation, variables);
      if (data.cartCreate?.userErrors?.length) { console.error('ShopifyService: Fehler beim Erstellen des Carts:', data.cartCreate.userErrors); }
      return data.cartCreate?.cart ?? null;
    } catch (error) { console.error('ShopifyService: GraphQL Fehler bei cartCreate:', error); return null; }
  }

  async addCartLines(cartId: string, lines: CartLineInput[]): Promise<Cart | null> {
    if (!cartId || !lines || lines.length === 0) return null;
    const variables = { cartId, lines };
    try {
      const data = await this.storefrontClient.request<CartLinesAddPayload>(CartLinesAddMutation, variables);
      if (data.cartLinesAdd?.userErrors?.length) { console.error('ShopifyService: Fehler beim Hinzufügen von Artikeln:', data.cartLinesAdd.userErrors); }
      return data.cartLinesAdd?.cart ?? null;
    } catch (error) { console.error('ShopifyService: GraphQL Fehler bei cartLinesAdd:', error); return null; }
  }

  async updateCartLines(cartId: string, lines: CartLineUpdateInput[]): Promise<Cart | null> {
     if (!cartId || !lines || lines.length === 0) return null;
     const variables = { cartId, lines };
     try {
       const data = await this.storefrontClient.request<CartLinesUpdatePayload>(CartLinesUpdateMutation, variables);
       if (data.cartLinesUpdate?.userErrors?.length) { console.error('ShopifyService: Fehler beim Aktualisieren von Artikeln:', data.cartLinesUpdate.userErrors); }
       return data.cartLinesUpdate?.cart ?? null;
     } catch (error) { console.error('ShopifyService: GraphQL Fehler bei cartLinesUpdate:', error); return null; }
   }

   async removeCartLines(cartId: string, lineIds: string[]): Promise<Cart | null> {
      if (!cartId || !lineIds || lineIds.length === 0) return null;
      const variables = { cartId, lineIds };
      try {
        const data = await this.storefrontClient.request<CartLinesRemovePayload>(CartLinesRemoveMutation, variables);
        if (data.cartLinesRemove?.userErrors?.length) { console.error('ShopifyService: Fehler beim Entfernen von Artikeln:', data.cartLinesRemove.userErrors); }
        return data.cartLinesRemove?.cart ?? null;
      } catch (error) { console.error('ShopifyService: GraphQL Fehler bei cartLinesRemove:', error); return null; }
    }

 async fetchCart(id: string): Promise<Cart | null> {
    if (!id) return null;
    const variables = { id };
    try {
      const data = await this.storefrontClient.request<CartFetchPayload>(CartFetchQuery, variables);
      return data.cart ?? null;
    } catch (error) { console.error('ShopifyService: GraphQL Fehler bei fetchCart:', error); return null; }
  }

  async getProductsSortedByBestSelling(limit: number = 15): Promise<Product[] | null> {
    const query = `
      query getBestSellingProducts($limit: Int!) {
        products(first: $limit, sortKey: BEST_SELLING) {
          edges {
            node {
              id title handle vendor availableForSale
              priceRange { minVariantPrice { amount currencyCode } }
              images(first: 1) { edges { node { url(transform: {maxWidth: 400, maxHeight: 400, preferredContentType: WEBP}) altText } } }
              variants(first: 5) { edges { node { id availableForSale } } }
            }
          }
        }
      }
    `;
    try {
      const variables = { limit };
      type ShopifyResponse = { products: { edges: { node: Product }[] } | null; };
      const data = await this.storefrontClient.request<ShopifyResponse>(query, variables);
      return data?.products?.edges?.map(edge => edge.node) ?? null;
    } catch (error) {
      console.error(`ShopifyService: Fehler beim Abrufen der Bestseller-Produkte:`, error);
      return null;
    }
  }

}