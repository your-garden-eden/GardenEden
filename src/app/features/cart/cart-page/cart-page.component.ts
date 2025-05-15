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
import { CommonModule, CurrencyPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs';
import { startWith, switchMap, tap } from 'rxjs/operators';

import { CartService} from '../../../shared/services/cart.service'; // NEUE IMPORTE
import { WooCommerceStoreCart } from '../../../core/services/woocommerce.service';
import { WooCommerceStoreCartItem } from '../../../core/services/woocommerce.service';
import { WoocommerceService } from '../../../core/services/woocommerce.service'; // Für Checkout URL
import { FormatPricePipe } from '../../../shared/pipes/format-price.pipe'; // Beibehalten, wenn für WC Preise genutzt

@Component({
  selector: 'app-cart-page',
  standalone: true,
  imports: [ CommonModule, RouterLink, CurrencyPipe, TranslocoModule, FormatPricePipe ], // FormatPricePipe hinzugefügt
  templateUrl: './cart-page.component.html',
  styleUrls: ['./cart-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CartPageComponent implements OnInit, OnDestroy {
  private cartService = inject(CartService);
  private woocommerceService = inject(WoocommerceService); // Für Checkout URL
  private router = inject(Router);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);

  cart: Signal<WooCommerceStoreCart | null> = this.cartService.cart;
  isLoadingCart: Signal<boolean> = this.cartService.isLoading;

  // Lokales Signal für UI-Fehlermeldungen auf dieser Seite
  uiError: WritableSignal<string | null> = signal(null);
  private uiErrorKey: WritableSignal<string | null> = signal(null);

  itemCount: Signal<number> = this.cartService.cartItemCount;

  // Gesamtpreis aus den Cart Totals von WooCommerce
  totalPriceDisplay = computed(() => {
      const totals = this.cart()?.totals;
      if (totals) {
          return {
              amount: totals.total_price,
              currencyCode: totals.currency_code,
              currencySymbol: totals.currency_symbol
          };
      }
      return null;
  });

  isUpdatingLine = signal<string | null>(null); // Hält den Key des Items, das aktualisiert wird

  private subscriptions = new Subscription();

  constructor() {
    // Effekt, um auf Änderungen des globalen cartService.error Signals zu reagieren
    effect(() => {
      const serviceError = this.cartService.error();
      const currentUiErrorKey = untracked(this.uiErrorKey);

      if (serviceError) {
        // Wenn der Service einen Fehler hat, versuchen wir einen spezifischen Key zu setzen,
        // oder einen generischen, falls der Fehler nicht direkt übersetzbar ist.
        // Idealerweise würde der CartService selbst einen Key bereitstellen.
        if (!currentUiErrorKey || currentUiErrorKey === 'cartPage.errorGlobalDefault') {
            this.uiErrorKey.set('cartPage.errorFromService'); // Neuer Key
            this.uiError.set(this.translocoService.translate(this.uiErrorKey()!, { serviceErrorMsg: serviceError }));
        }
      } else if (currentUiErrorKey === 'cartPage.errorFromService' || !serviceError) {
        // Wenn der Service-Fehler weg ist ODER unser aktueller Fehler der generische Service-Fehler war,
        // dann löschen wir unseren lokalen UI-Fehler.
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
        // Lokale UI-Fehler neu übersetzen
        if (this.uiErrorKey()) {
          const serviceErrorVal = untracked(this.cartService.error); // Hole den aktuellen Wert des Service-Fehlers
          this.uiError.set(this.translocoService.translate(this.uiErrorKey()!, { serviceErrorMsg: serviceErrorVal }));
        }
      })
    ).subscribe(() => {
      this.cdr.detectChanges();
    });
    this.subscriptions.add(langChangeSub);

    // Lade den Warenkorb initial, falls er noch nicht geladen wurde (CartService macht das evtl. schon)
    // this.cartService.loadInitialCartFromServer(); // Ist im CartService Konstruktor
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  async updateQuantity(itemKey: string, newQuantity: number): Promise<void> {
    this.isUpdatingLine.set(itemKey);
    this.uiError.set(null);
    this.uiErrorKey.set(null);
    try {
      // CartService.updateItemQuantity sollte quantity <= 0 behandeln
      await this.cartService.updateItemQuantity(itemKey, newQuantity);
    } catch (error: any) {
      console.error('CartPageComponent: Error calling updateItemQuantity:', error);
      const errorKey = 'cartPage.errorUpdateQuantity';
      this.uiErrorKey.set(errorKey);
      this.uiError.set(this.translocoService.translate(errorKey));
    } finally {
      this.isUpdatingLine.set(null);
      this.cdr.markForCheck(); // Sicherstellen, dass die UI nach dem Update aktualisiert wird
    }
  }

  async incrementQuantity(item: WooCommerceStoreCartItem): Promise<void> {
    await this.updateQuantity(item.key, item.quantity + 1);
  }

  async decrementQuantity(item: WooCommerceStoreCartItem): Promise<void> {
    await this.updateQuantity(item.key, item.quantity - 1);
  }

  async removeItem(itemKey: string): Promise<void> {
    this.isUpdatingLine.set(itemKey); // Kann auch für Remove-Aktion genutzt werden
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
    const checkoutUrl = this.woocommerceService.getCheckoutUrl(); // Holt die Standard-WC-Checkout-URL
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    } else {
      console.error('CartPageComponent: Checkout URL not available!');
      const errorKey = 'cartPage.errorCheckoutNotPossible';
      this.uiErrorKey.set(errorKey);
      this.uiError.set(this.translocoService.translate(errorKey));
    }
  }

  // Getter für die Warenkorbartikel, angepasst an WooCommerceStoreCart
  get cartItems(): WooCommerceStoreCartItem[] {
    return this.cart()?.items ?? [];
  }

  // calculateLineTotal wird nicht mehr benötigt, da item.totals.line_total verwendet wird

  // Hilfsmethode für Produktlink (ähnlich wie im MiniCart)
  getProductLinkForItem(item: WooCommerceStoreCartItem): string {
    // Annahme: item.id ist die Produkt-ID. ProductPage muss das auflösen können.
    // WooCommerce Cart Items haben oft keinen direkten Slug.
    // Alternative: Wenn der Permalink im Item vorhanden ist, diesen nutzen.
    return item.permalink || `/product/${item.id}`;
  }

  // Hilfsmethode für Bild (ähnlich wie im MiniCart)
  getProductImageForItem(item: WooCommerceStoreCartItem): string | undefined {
    return item.images?.[0]?.thumbnail || item.images?.[0]?.src;
  }
}