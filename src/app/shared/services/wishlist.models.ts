import { WooCommerceProduct, WooCommerceProductVariation } from "../../core/services/woocommerce.service";

/**
 * Definiert die Struktur der Daten, wie sie von unserem
 * benutzerdefinierten WordPress-Endpunkt geliefert wird.
 */
export interface WishlistData {
  items: WishlistItem[];
}

/**
 * Repräsentiert einen einzelnen Artikel in der Wunschliste,
 * wie er in der Datenbank (user_meta) gespeichert ist.
 */
export interface WishlistItem {
  product_id: number;
  variation_id?: number;
  added_at: string;
}

/**
 * Ein angereichertes Wunschlisten-Objekt für die Anzeige im Frontend.
 * Es kombiniert die reinen ID-Daten mit den vollständigen Produkt-
 * und Variationsdetails.
 */
export interface DisplayWishlistItem extends WishlistItem {
  productDetails?: WooCommerceProduct;
  variationDetails?: WooCommerceProductVariation;
}