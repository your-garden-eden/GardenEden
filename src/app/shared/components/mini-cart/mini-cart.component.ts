// /src/app/shared/components/mini-cart/mini-cart.component.ts
import { Component, inject, Signal, ChangeDetectionStrategy, computed, OnInit, OnDestroy, ChangeDetectorRef, WritableSignal, signal, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { UiStateService } from '../../services/ui-state.service';
import { CartService} from '../../services/cart.service'; // WooCommerce-Typen importieren
import { WooCommerceStoreCart } from '../../../core/services/woocommerce.service';
import { WooCommerceStoreCartItem } from '../../../core/services/woocommerce.service';
import { FormatPricePipe } from '../../pipes/format-price.pipe'; // Beibehalten, wenn noch benötigt
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs';
import { startWith } from 'rxjs/operators';
import { WoocommerceService } from '../../../core/services/woocommerce.service'; // Für Checkout URL

// Typ für Subtotal-Daten, angepasst an WooCommerceStoreCartTotals
type SubtotalData = { amount: string; currencyCode: string; currencySymbol: string } | null;

@Component({
  selector: 'app-mini-cart',
  standalone: true,
  imports: [ CommonModule, RouterModule, FormatPricePipe, TranslocoModule ],
  templateUrl: './mini-cart.component.html',
  styleUrls: ['./mini-cart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MiniCartComponent implements OnInit, OnDestroy {
  private uiStateService = inject(UiStateService);
  private cartService = inject(CartService);
  private woocommerceService = inject(WoocommerceService); // Für Checkout URL
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);

  cart$: Signal<WooCommerceStoreCart | null> = this.cartService.cart;
  isLoading: Signal<boolean> = this.cartService.isLoading;

  error: WritableSignal<string | null> = signal(null);
  private errorKey: WritableSignal<string | null> = signal(null);

  items: Signal<WooCommerceStoreCartItem[]> = computed(() => this.cart$()?.items ?? []);

  subtotalData: Signal<SubtotalData> = computed(() => {
    const totals = this.cart$()?.totals;
    if (totals) {
      return {
        amount: totals.total_price, // WooCommerceStoreCartTotals.total_price
        currencyCode: totals.currency_code,
        currencySymbol: totals.currency_symbol
      };
    }
    return null;
  });

  private subscriptions = new Subscription();

  constructor() {
    effect(() => {
      const serviceError = this.cartService.error();
      const currentErrorKey = untracked(this.errorKey);

      if (serviceError) {
        if (!currentErrorKey) {
            this.errorKey.set('miniCart.errorGlobal'); // Generischer Key
            this.error.set(this.translocoService.translate(this.errorKey()!));
        }
      } else if (currentErrorKey === 'miniCart.errorGlobal' || !serviceError) {
        this.error.set(null);
        this.errorKey.set(null);
      }
      this.cdr.markForCheck();
    });
  }

  ngOnInit(): void {
    const langChangeSub = this.translocoService.langChanges$.pipe(
        startWith(this.translocoService.getActiveLang())
    ).subscribe(() => {
        if (this.errorKey()) {
            this.error.set(this.translocoService.translate(this.errorKey()!));
            this.cdr.markForCheck();
        }
    });
    this.subscriptions.add(langChangeSub);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  closeCart(): void {
    this.uiStateService.closeMiniCart();
  }

  cancelTimeout(): void {
    this.uiStateService.cancelCloseTimeout();
  }

  startTimeout(): void {
    this.uiStateService.startCloseTimeout();
  }

  increaseQuantity(itemKey: string, currentQuantity: number): void {
    this.errorKey.set(null); this.error.set(null);
    this.cartService.updateItemQuantity(itemKey, currentQuantity + 1)
      .catch(() => { // Fehlerbehandlung, falls Promise rejected wird
        this.errorKey.set('miniCart.errorUpdateQuantity');
        this.error.set(this.translocoService.translate(this.errorKey()!));
      });
  }

  decreaseQuantity(itemKey: string, currentQuantity: number): void {
    this.errorKey.set(null); this.error.set(null);
    // updateItemQuantity im CartService sollte quantity <= 0 behandeln (-> removeItem)
    this.cartService.updateItemQuantity(itemKey, currentQuantity - 1)
      .catch(() => {
        this.errorKey.set('miniCart.errorUpdateQuantity');
        this.error.set(this.translocoService.translate(this.errorKey()!));
      });
  }

  // Hilfsmethode für Produktlink
  getProductLinkForItem(item: WooCommerceStoreCartItem): string {
    // WooCommerceStoreCartItem hat keinen direkten 'product.handle' oder 'slug'.
    // Wir bräuchten entweder den Slug im Item oder müssen ihn anderweitig beschaffen,
    // oder wir verlinken nur mit der Produkt-ID und die ProductPageComponent muss das auflösen.
    // Fürs Erste: Wenn ein permalink da ist, nutzen wir den, sonst eine Fallback-Route.
    // Die permalink-Property ist in der Standard-Cart-Item-Antwort oft nicht enthalten.
    // Wir müssten das Produkt ggf. separat laden oder der Cart-Service erweitert die Items.
    // Annahme für jetzt: Wir haben den Slug im item_data oder müssen ihn basierend auf item.id holen.
    // DAHER VEREINFACHUNG:
    return `/product/${item.id}`; // Verlinkt mit Produkt-ID, ProductPage muss das umwandeln können
                                  // ODER wir brauchen den Slug im WooCommerceStoreCartItem
  }

  // Hilfsmethode für Bild
  getProductImageForItem(item: WooCommerceStoreCartItem): string | undefined {
    return item.images?.[0]?.thumbnail || item.images?.[0]?.src;
  }

  goToCheckout(): void {
    this.errorKey.set(null); this.error.set(null);
    const checkoutUrl = this.woocommerceService.getCheckoutUrl(); // Holt die Standard-WC-Checkout-URL
    if (checkoutUrl) {
      this.closeCart();
      // WooCommerce Store API leitet oft serverseitig weiter, wenn man bestimmte Aktionen ausführt.
      // Hier ist es aber ein direkter Link zur Checkout-Seite.
      setTimeout(() => { window.location.href = checkoutUrl; }, 50);
    } else {
      console.error("MiniCart: Checkout URL could not be determined!");
      this.errorKey.set('miniCart.errorCheckoutNotPossible');
      this.error.set(this.translocoService.translate(this.errorKey()!));
    }
  }
}