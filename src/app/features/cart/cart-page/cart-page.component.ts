// /src/app/features/cart/cart-page/cart-page.component.ts
import {
  Component,
  inject,
  signal,
  ChangeDetectionStrategy,
  computed,
  Signal,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  WritableSignal,
  effect,
  untracked,
} from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common'; // CurrencyPipe wird im Template nicht verwendet, könnte entfernt werden.
import { Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs';
import { startWith, switchMap, tap } from 'rxjs/operators';

import { CartService} from '../../../shared/services/cart.service';
import { WooCommerceStoreCart, WooCommerceStoreCartItem } from '../../../core/services/woocommerce.service'; // WooCommerceStoreCartItem importiert
// WoocommerceService wird hier nicht direkt injiziert, da Interaktion über CartService läuft
import { FormatPricePipe } from '../../../shared/pipes/format-price.pipe';

@Component({
  selector: 'app-cart-page',
  standalone: true,
  // CurrencyPipe wird im aktuellen cart-page.component.html nicht verwendet.
  // Wenn du sie nicht brauchst, kannst du sie hier entfernen.
  imports: [ CommonModule, RouterLink, /*CurrencyPipe,*/ TranslocoModule, FormatPricePipe ],
  templateUrl: './cart-page.component.html',
  styleUrls: ['./cart-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CartPageComponent implements OnInit, OnDestroy {
  private cartService = inject(CartService);
  // private woocommerceService = inject(WoocommerceService); // Nicht direkt hier verwendet
  private router = inject(Router);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);

  cart: Signal<WooCommerceStoreCart | null> = this.cartService.cart;
  isLoadingCart: Signal<boolean> = this.cartService.isLoading;

  uiError: WritableSignal<string | null> = signal(null);
  private uiErrorKey: WritableSignal<string | null> = signal(null);

  itemCount: Signal<number> = this.cartService.cartItemCount;

  totalPriceDisplay = computed(() => {
      const currentCart = this.cart(); // Signal aufrufen
      if (currentCart?.totals) {
          return {
              amount: currentCart.totals.total_price,
              currencyCode: currentCart.totals.currency_code,
              currencySymbol: currentCart.totals.currency_symbol
          };
      }
      return null;
  });

  isUpdatingLine = signal<string | null>(null);

  private subscriptions = new Subscription();

  constructor() {
    effect(() => {
      const serviceError = this.cartService.error();
      const currentUiErrorKeyVal = untracked(() => this.uiErrorKey()); // Korrigierter untracked Aufruf

      if (serviceError) {
        if (!currentUiErrorKeyVal || currentUiErrorKeyVal === 'cartPage.errorGlobalDefault') {
            this.uiErrorKey.set('cartPage.errorFromService');
            this.uiError.set(this.translocoService.translate(this.uiErrorKey()!, { serviceErrorMsg: serviceError }));
        }
      } else if (currentUiErrorKeyVal === 'cartPage.errorFromService' || !serviceError) {
        this.uiError.set(null);
        this.uiErrorKey.set(null);
      }
      this.cdr.markForCheck();
    });
  }

  ngOnInit(): void {
    const langChangeSub = this.translocoService.langChanges$.pipe(
      startWith(this.translocoService.getActiveLang()),
      switchMap(lang =>
        this.translocoService.selectTranslate('cartPage.title', {}, lang)
      ),
      tap(translatedPageTitle => {
        this.titleService.setTitle(translatedPageTitle);
        const currentUiErrorKeyVal = untracked(() => this.uiErrorKey()); // Korrigierter untracked Aufruf
        if (currentUiErrorKeyVal) {
          const serviceErrorVal = untracked(() => this.cartService.error()); // Korrigierter untracked Aufruf
          this.uiError.set(this.translocoService.translate(currentUiErrorKeyVal, { serviceErrorMsg: serviceErrorVal }));
        }
      })
    ).subscribe(() => {
      this.cdr.detectChanges();
    });
    this.subscriptions.add(langChangeSub);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  async updateQuantity(itemKey: string, newQuantity: number): Promise<void> {
    this.isUpdatingLine.set(itemKey);
    this.uiError.set(null);
    this.uiErrorKey.set(null);
    try {
      await this.cartService.updateItemQuantity(itemKey, newQuantity);
    } catch (error: any) {
      console.error('CartPageComponent: Error calling updateItemQuantity:', error);
      const errorKey = 'cartPage.errorUpdateQuantity';
      this.uiErrorKey.set(errorKey);
      this.uiError.set(this.translocoService.translate(errorKey));
    } finally {
      this.isUpdatingLine.set(null);
      this.cdr.markForCheck();
    }
  }

  async incrementQuantity(item: WooCommerceStoreCartItem): Promise<void> {
    await this.updateQuantity(item.key, item.quantity + 1);
  }

  async decrementQuantity(item: WooCommerceStoreCartItem): Promise<void> {
    await this.updateQuantity(item.key, item.quantity - 1);
  }

  async removeItem(itemKey: string): Promise<void> {
    this.isUpdatingLine.set(itemKey);
    this.uiError.set(null);
    this.uiErrorKey.set(null);
    try {
      await this.cartService.removeItem(itemKey);
    } catch (error: any) {
      console.error('CartPageComponent: Error calling removeItem:', error);
      const errorKey = 'cartPage.errorRemoveItem';
      this.uiErrorKey.set(errorKey);
      this.uiError.set(this.translocoService.translate(errorKey));
    } finally {
      this.isUpdatingLine.set(null);
      this.cdr.markForCheck();
    }
  }

  goToCheckout(): void {
    if (this.itemCount() > 0) {
      this.router.navigate(['/checkout-details']);
    } else {
      console.warn('CartPageComponent: Checkout attempt with empty cart.');
      const errorKey = 'cartPage.errorEmptyCartCheckout';
      this.uiErrorKey.set(errorKey);
      this.uiError.set(this.translocoService.translate(errorKey));
    }
  }

  get cartItems(): WooCommerceStoreCartItem[] {
    return this.cart()?.items ?? [];
  }

  // +++ ANGEPASSTE getProductLinkForItem METHODE +++
  getProductLinkForItem(item: WooCommerceStoreCartItem): string {
    // Versuch 1: Gibt es ein direktes Slug-Feld im Item? (Annahme)
    // Wenn deine WooCommerceStoreCartItem Definition 'slug' enthält und die API es liefert:
    // if (item.slug) {
    //   return `/product/${item.slug}`;
    // }

    // Versuch 2: Slug aus Permalink extrahieren
    if (item.permalink) {
      try {
        const url = new URL(item.permalink);
        const pathname = url.pathname; // z.B. "/produkt/mein-super-produkt/" oder "/shop/kategorie/mein-produkt/"
        
        const pathSegments = pathname.replace(/^\/+|\/+$/g, '').split('/'); // Entferne führende/nachfolgende Slashes und teile
        
        let slug: string | undefined = undefined;
        
        // Deine Produkt-URL ist http://localhost:4200/product/SLUG
        // Also suchen wir nach "produkt" im Pfad des Permalinks, der Slug ist danach.
        // Oder wenn "produkt" nicht da ist (z.B. Root-Produkt-Permalinks), ist es der letzte Teil.
        const productUrlBase = 'produkt'; // Dies ist die Basis in deinen WordPress Permalinks für Produkte

        const productBaseIndex = pathSegments.indexOf(productUrlBase);

        if (productBaseIndex !== -1 && pathSegments.length > productBaseIndex + 1) {
          // Fall: /.../produkt/mein-slug/...
          slug = pathSegments[productBaseIndex + 1];
        } else if (pathSegments.length > 0) {
          // Fallback: Nimm den letzten Teil, wenn /produkt/ nicht gefunden wurde oder der Slug direkt danach kommt.
          // Dies ist nützlich, wenn die Permalink-Struktur z.B. nur /%postname%/ ist.
          slug = pathSegments[pathSegments.length - 1];
        }
        
        if (slug && slug.length > 0) {
          return `/product/${slug}`; // Angular-Route
        }
      } catch (e) {
        console.warn(`CartPage: Could not parse permalink "${item.permalink}" to extract slug for item "${item.name}". Error:`, e);
      }
    }

    // Fallback, wenn kein Permalink vorhanden ist oder der Slug nicht extrahiert werden konnte.
    // Dieser Fallback ist nicht ideal, wenn deine /product/ Route einen Slug erwartet.
    console.error(`CartPage: CRITICAL - Could not determine a slug for item "${item.name}" (ID: ${item.id}). Falling back to ID. This might lead to a non-functional link if your /product/ route requires a slug.`);
    return `/product/${item.id}`; // Dies wird zu /product/NUMMERISCHE_ID führen.
  }
  // +++++++++++++++++++++++++++++++++++++++++++++++

  getProductImageForItem(item: WooCommerceStoreCartItem): string | undefined {
    return item.images?.[0]?.thumbnail || item.images?.[0]?.src;
  }
}