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
  PLATFORM_ID // +++ NEU +++
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common'; // +++ NEU: isPlatformBrowser +++
import { Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs';
import { startWith, switchMap, tap } from 'rxjs/operators';

import { CartService} from '../../../shared/services/cart.service';
import { UiStateService } from '../../../shared/services/ui-state.service'; // +++ NEU +++
import {
  WooCommerceStoreCart,
  WooCommerceStoreCartItem,
  WooCommerceStoreCartTotals
} from '../../../core/services/woocommerce.service';
import { FormatPricePipe } from '../../../shared/pipes/format-price.pipe';

// +++ NEU: Import für das CartDiscountInfoModalComponent +++
import { CartDiscountInfoModalComponent } from '../../../shared/components/cart-discount-info-modal/cart-discount-info-modal.component';

@Component({
  selector: 'app-cart-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslocoModule,
    FormatPricePipe,
    CartDiscountInfoModalComponent // +++ NEU: Hier hinzufügen +++
  ],
  templateUrl: './cart-page.component.html',
  styleUrls: ['./cart-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CartPageComponent implements OnInit, OnDestroy {
  public cartService = inject(CartService);
  private router = inject(Router);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);
  private uiStateService = inject(UiStateService); // +++ NEU +++
  private platformId = inject(PLATFORM_ID); // +++ NEU +++

  cart: Signal<WooCommerceStoreCart | null> = this.cartService.cart;
  isLoadingCart: Signal<boolean> = this.cartService.isLoading;
  itemCount: Signal<number> = this.cartService.cartItemCount;

  uiError: WritableSignal<string | null> = signal(null);
  private uiErrorKey: WritableSignal<string | null> = signal(null);

  isUpdatingLine: WritableSignal<string | null> = signal(null);
  isRemovingItem: WritableSignal<string | null> = signal(null);
  lineUpdateError: WritableSignal<string | null> = signal(null);

  cartTotals: Signal<WooCommerceStoreCartTotals | null> = computed(() => this.cart()?.totals ?? null);
  cartItems: Signal<WooCommerceStoreCartItem[]> = computed(() => this.cart()?.items ?? []);

  readonly showShippingCosts: Signal<boolean> = computed(() => {
    const totals = this.cartTotals();
    if (totals?.total_shipping) {
      const shippingCost = typeof totals.total_shipping === 'string' ? parseFloat(totals.total_shipping) : totals.total_shipping;
      return !isNaN(shippingCost) && shippingCost > 0;
    }
    return false;
  });

  // +++ NEU: Signal für das Rabatt-Popup +++
  showCartDiscountPopup$: Signal<boolean> = this.uiStateService.showCartDiscountPopup$;

  private subscriptions = new Subscription();

  constructor() {
    effect(() => {
      const serviceError = untracked(() => this.cartService.error());
      const currentUiErrorKeyVal = untracked(() => this.uiErrorKey());

      if (serviceError) {
        if (!this.lineUpdateError() && (!currentUiErrorKeyVal || currentUiErrorKeyVal === 'cartPage.errorGlobalDefault')) {
            this.uiErrorKey.set('cartPage.errorFromService');
            this.uiError.set(this.translocoService.translate(this.uiErrorKey()!, { serviceErrorMsg: serviceError }));
        }
      } else if (currentUiErrorKeyVal === 'cartPage.errorFromService' && !this.lineUpdateError()) {
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
        const currentUiErrorKeyVal = untracked(() => this.uiErrorKey());
        if (currentUiErrorKeyVal) {
          const serviceErrorVal = untracked(() => this.cartService.error());
          this.uiError.set(this.translocoService.translate(currentUiErrorKeyVal, { serviceErrorMsg: serviceErrorVal }));
        }
      })
    ).subscribe(() => {
      this.cdr.detectChanges();
    });
    this.subscriptions.add(langChangeSub);

    if (this.cartService.error() && !this.uiError()) {
        this.uiErrorKey.set('cartPage.errorFromService');
        this.uiError.set(this.translocoService.translate(this.uiErrorKey()!, { serviceErrorMsg: this.cartService.error() }));
        this.cdr.markForCheck();
    }

    // +++ NEU: Rabatt-Popup triggern +++
    if (isPlatformBrowser(this.platformId)) {
      this.uiStateService.triggerCartDiscountPopup();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  async updateQuantity(item: WooCommerceStoreCartItem, newQuantity: number): Promise<void> {
    if (newQuantity < 1) {
      await this.removeItem(item.key);
      return;
    }
    this.isUpdatingLine.set(item.key);
    this.lineUpdateError.set(null);
    this.uiError.set(null); this.uiErrorKey.set(null);

    try {
      await this.cartService.updateItemQuantity(item.key, newQuantity);
    } catch (error: any) {
      console.error(`CartPageComponent: Error occurred while calling cartService.updateItemQuantity for item ${item.key}:`, error);
      this.lineUpdateError.set(this.translocoService.translate('cartPage.errors.updateFailed'));
    } finally {
      this.isUpdatingLine.set(null);
      this.cdr.markForCheck();
    }
  }

  incrementQuantity(item: WooCommerceStoreCartItem): void {
    this.updateQuantity(item, item.quantity + 1);
  }

  decrementQuantity(item: WooCommerceStoreCartItem): void {
    if (item.quantity > 1) {
      this.updateQuantity(item, item.quantity - 1);
    }
  }

  async removeItem(itemKey: string): Promise<void> {
    this.isRemovingItem.set(itemKey);
    this.lineUpdateError.set(null);
    this.uiError.set(null); this.uiErrorKey.set(null);

    try {
      await this.cartService.removeItem(itemKey);
    } catch (error: any) {
      console.error(`CartPageComponent: Error calling cartService.removeItem for item ${itemKey}:`, error);
      this.uiErrorKey.set('cartPage.errorRemoveItem');
      this.uiError.set(this.translocoService.translate(this.uiErrorKey()!));
    } finally {
      this.isRemovingItem.set(null);
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

  getProductLinkForItem(item: WooCommerceStoreCartItem): string {
    if (item.permalink) {
      try {
        const url = new URL(item.permalink);
        const pathname = url.pathname;
        const pathSegments = pathname.replace(/^\/+|\/+$/g, '').split('/');
        let slug: string | undefined = undefined;
        const productUrlBase = 'produkt';
        const productBaseIndex = pathSegments.indexOf(productUrlBase);

        if (productBaseIndex !== -1 && pathSegments.length > productBaseIndex + 1) {
          slug = pathSegments[productBaseIndex + 1];
        } else if (pathSegments.length > 0) {
          slug = pathSegments[pathSegments.length - 1];
        }
        if (slug && slug.length > 0) { return `/product/${slug}`; }
      } catch (e) {
        console.warn(`CartPage: Could not parse permalink "${item.permalink}" to extract slug for item "${item.name}". Error:`, e);
      }
    }
    console.warn(`CartPage: Could not determine a slug for item "${item.name}" (ID: ${item.id}). Falling back to ID for link.`);
    return `/product/${item.id}`;
  }

  getProductImageForItem(item: WooCommerceStoreCartItem): string | undefined {
    return item.images?.[0]?.thumbnail || item.images?.[0]?.src;
  }
}