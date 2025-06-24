// src/app/core/services/tracking.service.ts
import { Injectable, inject, effect } from '@angular/core';
import { Analytics, setAnalyticsCollectionEnabled, logEvent, setUserId } from '@angular/fire/analytics';
import { CookieConsentService } from './cookie-consent.service';
import { AuthService } from '../../shared/services/auth.service';
import { WordPressUser } from '../../shared/services/auth.service';
import { WooCommerceProduct, WooCommerceProductVariation } from './woocommerce.service';
import { ExtendedWooCommerceStoreCart, ExtendedCartItem } from '../../shared/services/cart.service';

@Injectable({
  providedIn: 'root'
})
export class TrackingService {
  private analytics: Analytics = inject(Analytics);
  private cookieConsentService = inject(CookieConsentService);
  private authService = inject(AuthService);

  constructor() {
    this.initialisiereZustimmungsbasiertesTracking();
    this.initialisiereBenutzerTracking(); 
  }

  private initialisiereZustimmungsbasiertesTracking(): void {
    effect(() => {
      const consentStatus = this.cookieConsentService.consentStatus$();
      if (consentStatus === 'accepted_all') {
        console.log('[TrackingService] Analytics-Datensammlung AKTIVIERT.');
        setAnalyticsCollectionEnabled(this.analytics, true);
      } else {
        console.log('[TrackingService] Analytics-Datensammlung DEAKTIVIERT.');
        setAnalyticsCollectionEnabled(this.analytics, false);
      }
    });
  }

  private initialisiereBenutzerTracking(): void {
    this.authService.currentWordPressUser$.subscribe((user: WordPressUser | null) => {
      if (user && user.id) {
        const userId = user.id.toString();
        console.log(`[TrackingService] Benutzer angemeldet. Setze Analytics User-ID auf: ${userId}`);
        setUserId(this.analytics, userId);
      } else {
        console.log('[TrackingService] Benutzer abgemeldet/gast. Entferne Analytics User-ID.');
        setUserId(this.analytics, null);
      }
    });
  }

  // === ÖFFENTLICHE METHODEN FÜR E-COMMERCE EVENT-TRACKING ===
  
  public trackViewItem(product: WooCommerceProduct): void {
    if (this.cookieConsentService.getCurrentConsentStatus() !== 'accepted_all' || !product) return;
    const itemData = {
      item_id: product.id.toString(), item_name: product.name, price: parseFloat(product.price),
      item_category: product.categories?.[0]?.name || 'Uncategorized', currency: 'EUR',
    };
    logEvent(this.analytics, 'view_item', { currency: 'EUR', value: parseFloat(product.price), items: [itemData] });
  }

  public trackAddToCart(
    product: WooCommerceProduct, 
    quantity: number, 
    variation?: WooCommerceProductVariation
  ): void {
    if (this.cookieConsentService.getCurrentConsentStatus() !== 'accepted_all' || !product) return;
    const priceSource = variation || product;
    const price = parseFloat(priceSource.price);
    const itemData = {
      item_id: product.id.toString(), item_name: product.name, price: price, quantity: quantity,
      item_category: product.categories?.[0]?.name || 'Uncategorized',
      item_variant: variation ? variation.attributes.map(attr => attr.option).join(', ') : undefined, currency: 'EUR',
    };
    logEvent(this.analytics, 'add_to_cart', { currency: 'EUR', value: price * quantity, items: [itemData] });
  }
  
  public trackBeginCheckout(cart: ExtendedWooCommerceStoreCart): void {
    if (this.cookieConsentService.getCurrentConsentStatus() !== 'accepted_all' || !cart || !cart.items) return;
    const itemsForAnalytics = cart.items.map((cartItem: ExtendedCartItem) => ({
      item_id: cartItem.id.toString(), item_name: cartItem.name, price: parseFloat(cartItem.prices.price) / 100, quantity: cartItem.quantity,
    }));
    const cartTotal = parseFloat(cart.totals.total_price) / 100;
    console.log('[TrackingService] Sende "begin_checkout"-Event für Warenkorbwert:', cartTotal);
    logEvent(this.analytics, 'begin_checkout', {
      currency: cart.totals.currency_code || 'EUR', value: cartTotal, items: itemsForAnalytics, coupon: cart.coupons?.[0]?.code
    });
  }
  
  /**
   * Sendet ein 'select_content'-Event für das Ansehen einer Kategorie.
   */
  public trackCategoryView(categoryName: string): void {
    if (this.cookieConsentService.getCurrentConsentStatus() !== 'accepted_all' || !categoryName) {
      return;
    }
    
    console.log('[TrackingService] Sende "select_content"-Event für Kategorie:', categoryName);
    logEvent(this.analytics, 'select_content', {
      content_type: 'product_category',
      item_id: categoryName
    });
  }
}