// /src/app/core/services/tracking.service.ts (Final, Korrigiert, SSR-sicher)
import { Injectable, inject, effect, PLATFORM_ID, OnDestroy, EffectRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Analytics, getAnalytics, setAnalyticsCollectionEnabled, logEvent, setUserId, isSupported } from '@angular/fire/analytics';
import { FirebaseApp } from '@angular/fire/app';
import { CookieConsentService } from './cookie-consent.service';
import { AuthService } from '../../shared/services/auth.service';
import { WordPressUser } from '../../shared/services/auth.service';
import { WooCommerceProduct, WooCommerceProductVariation } from './woocommerce.service';
import { ExtendedWooCommerceStoreCart, ExtendedCartItem } from '../../shared/services/cart.service';
import { Subscription } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TrackingService implements OnDestroy {
  private analytics: Analytics | null = null;
  private cookieConsentService = inject(CookieConsentService);
  private authService = inject(AuthService);
  private platformId = inject(PLATFORM_ID);
  
  private userTrackingSubscription: Subscription | null = null;
  private consentEffectRef: EffectRef | null = null;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      // Lazy-Initialisierung nur im Browser
      isSupported().then(supported => {
        if (supported) {
          const app = inject(FirebaseApp);
          this.analytics = getAnalytics(app);
          this.initialisiereZustimmungsbasiertesTracking();
          this.initialisiereBenutzerTracking();
        }
      });
    }
  }

  private initialisiereZustimmungsbasiertesTracking(): void {
    this.consentEffectRef = effect(() => {
      if (!this.analytics) return;
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
    this.userTrackingSubscription = this.authService.currentWordPressUser$.subscribe((user: WordPressUser | null) => {
      if (!this.analytics) return;
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

  ngOnDestroy(): void {
    this.userTrackingSubscription?.unsubscribe();
    this.consentEffectRef?.destroy(); // Korrekter Aufruf der destroy-Methode
  }
  
  public trackViewItem(product: WooCommerceProduct): void {
    if (!this.analytics || this.cookieConsentService.getCurrentConsentStatus() !== 'accepted_all' || !product) return;
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
    if (!this.analytics || this.cookieConsentService.getCurrentConsentStatus() !== 'accepted_all' || !product) return;
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
    if (!this.analytics || this.cookieConsentService.getCurrentConsentStatus() !== 'accepted_all' || !cart || !cart.items) return;
    const itemsForAnalytics = cart.items.map((cartItem: ExtendedCartItem) => ({
      item_id: cartItem.id.toString(), item_name: cartItem.name, price: parseFloat(cartItem.prices.price) / 100, quantity: cartItem.quantity,
    }));
    const cartTotal = parseFloat(cart.totals.total_price) / 100;
    console.log('[TrackingService] Sende "begin_checkout"-Event für Warenkorbwert:', cartTotal);
    logEvent(this.analytics, 'begin_checkout', {
      currency: cart.totals.currency_code || 'EUR', value: cartTotal, items: itemsForAnalytics, coupon: cart.coupons?.[0]?.code
    });
  }
  
  public trackCategoryView(categoryName: string): void {
    if (!this.analytics || this.cookieConsentService.getCurrentConsentStatus() !== 'accepted_all' || !categoryName) return;
    
    console.log('[TrackingService] Sende "select_content"-Event für Kategorie:', categoryName);
    logEvent(this.analytics, 'select_content', {
      content_type: 'product_category',
      item_id: categoryName
    });
  }

  // +++ NEUE METHODE +++
  /**
   * Trackt, wenn ein Benutzer erfolgreich einen Inhalt teilt.
   * @param contentName Der Name des geteilten Inhalts (z.B. Produktname).
   * @param sharedUrl Die URL, die geteilt wurde.
   */
  public trackShare(contentName: string, sharedUrl: string): void {
    if (!this.analytics || this.cookieConsentService.getCurrentConsentStatus() !== 'accepted_all') return;
    
    console.log(`[TrackingService] Sende "share"-Event für Inhalt: ${contentName}`);
    logEvent(this.analytics, 'share', {
      method: 'Web Share API',
      content_type: 'product',
      item_id: contentName,
      content_url: sharedUrl
    });
  }
}