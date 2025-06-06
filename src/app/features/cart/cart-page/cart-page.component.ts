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
  PLATFORM_ID
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription, firstValueFrom, of } from 'rxjs';
import { startWith, switchMap, tap, catchError } from 'rxjs/operators';

import { CartService, UserCartData, UserCartItem } from '../../../shared/services/cart.service';
import { AuthService, WordPressUser } from '../../../shared/services/auth.service';
import { UiStateService } from '../../../shared/services/ui-state.service';
import {
  WooCommerceStoreCart,
  WooCommerceStoreCartItem,
  WooCommerceStoreCartTotals,
  WooCommerceStoreAddress,
  StageCartPayload,
  StageCartResponse,
  WoocommerceService // Beibehalten, falls für andere Zwecke benötigt, aber nicht für goToCheckoutDetails direkt
} from '../../../core/services/woocommerce.service';
import { FormatPricePipe } from '../../../shared/pipes/format-price.pipe';
import { CartDiscountInfoModalComponent } from '../../../shared/components/cart-discount-info-modal/cart-discount-info-modal.component';

@Component({
  selector: 'app-cart-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslocoModule,
    FormatPricePipe,
    CartDiscountInfoModalComponent
  ],
  templateUrl: './cart-page.component.html',
  styleUrls: ['./cart-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CartPageComponent implements OnInit, OnDestroy {
  public cartService = inject(CartService);
  private authService = inject(AuthService);
  // private woocommerceService = inject(WoocommerceService); // Nicht mehr direkt hier benötigt für den Button
  private router = inject(Router);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);
  private uiStateService = inject(UiStateService);
  private platformId = inject(PLATFORM_ID);

  readonly cart: Signal<WooCommerceStoreCart | null> = this.cartService.cart;
  readonly isLoadingCartFromService: Signal<boolean> = this.cartService.isLoading;
  readonly itemCount: Signal<number> = this.cartService.cartItemCount;
  readonly serviceError: Signal<string | null> = this.cartService.error;

  readonly uiError: WritableSignal<string | null> = signal(null);
  private readonly uiErrorKey: WritableSignal<string | null> = signal(null);
  readonly isProcessingCheckout: WritableSignal<boolean> = signal(false); // Behalten, falls andere Aktionen es nutzen

  readonly isUpdatingLine: WritableSignal<string | null> = signal(null);
  readonly isRemovingItem: WritableSignal<string | null> = signal(null);
  readonly lineUpdateError: WritableSignal<string | null> = signal(null);

  readonly cartTotals: Signal<WooCommerceStoreCartTotals | null> = computed(() => this.cart()?.totals ?? null);
  readonly cartItems: Signal<WooCommerceStoreCartItem[]> = computed(() => this.cart()?.items ?? []);

  readonly showCartDiscountPopup$: Signal<boolean> = this.uiStateService.showCartDiscountPopup$;
  
  public isLoggedIn: boolean = false; 

  // showShippingCosts wird entfernt, da Versand immer kostenlos ist
  // readonly showShippingCosts: Signal<boolean> = computed(() => { ... });

  private subscriptions = new Subscription();

  constructor() {
    this.subscriptions.add(
      this.authService.isLoggedIn$.subscribe(loggedIn => {
        this.isLoggedIn = loggedIn;
        console.log('[CartPageComponent] Login status changed:', this.isLoggedIn);
        this.cdr.markForCheck();
      })
    );

    effect(() => {
      const errorFromService = this.serviceError();
      untracked(() => {
        if (errorFromService) {
          if (!this.lineUpdateError() && !this.isProcessingCheckout()) {
            this.uiErrorKey.set('cartPage.errorFromService');
            this.uiError.set(errorFromService);
          }
        } else if (this.uiErrorKey() === 'cartPage.errorFromService' && !this.lineUpdateError()) {
          this.uiError.set(null);
          this.uiErrorKey.set(null);
        }
      });
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
        const currentErrorKey = untracked(() => this.uiErrorKey());
        const currentServiceError = untracked(() => this.serviceError());
        if (currentErrorKey) {
          this.uiError.set(this.translocoService.translate(currentErrorKey, { serviceErrorMsg: currentServiceError }));
        } else if (currentServiceError) {
          this.uiError.set(currentServiceError);
        }
      })
    ).subscribe(() => {
      this.cdr.detectChanges();
    });
    this.subscriptions.add(langChangeSub);

    const initialServiceError = this.serviceError();
    if (initialServiceError && !this.uiError()) {
        this.uiErrorKey.set('cartPage.errorFromService');
        this.uiError.set(initialServiceError);
        this.cdr.markForCheck();
    }

    if (isPlatformBrowser(this.platformId)) {
      this.uiStateService.triggerCartDiscountPopup();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  trackByItemKey(index: number, item: WooCommerceStoreCartItem): string {
    return item.key;
  }

  trackByVariationAttribute(index: number, variant: { attribute: string; value: string }): string {
    return variant.attribute;
  }

  public getItemIdentifierForLoadingState(item: WooCommerceStoreCartItem): string {
    if (this.isLoggedIn) {
      const productId = item.parent_product_id || item.id;
      const variationId = item.parent_product_id ? item.id : 0;
      return `${productId}_${variationId}`;
    }
    return item.key;
  }

  async updateQuantity(item: WooCommerceStoreCartItem, newQuantity: number): Promise<void> {
    const loadingKey = this.getItemIdentifierForLoadingState(item);
    const productId = item.parent_product_id || item.id;
    const variationId = item.parent_product_id ? item.id : undefined;

    if (newQuantity < 1) {
      await this.removeItem(this.isLoggedIn ? productId : item.key, this.isLoggedIn ? variationId : undefined);
      return;
    }

    this.isUpdatingLine.set(loadingKey);
    this.lineUpdateError.set(null);
    this.uiError.set(null); this.uiErrorKey.set(null);

    try {
      if (this.isLoggedIn) {
        await this.cartService.updateItemQuantity(productId, newQuantity, variationId);
      } else {
        await this.cartService.updateItemQuantity(item.key, newQuantity);
      }
    } catch (error: any) {
      console.error(`CartPageComponent: Error calling cartService.updateItemQuantity (propagated from service) for item ${loadingKey}:`, error);
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
    } else if (item.quantity === 1) {
        this.updateQuantity(item, 0);
    }
  }

  async removeItem(itemIdentifier: string | number, variationIdParam?: number): Promise<void> {
    const loadingKey = typeof itemIdentifier === 'string' ? itemIdentifier : `${itemIdentifier}_${variationIdParam || 0}`;
    this.isRemovingItem.set(loadingKey);
    this.lineUpdateError.set(null);
    this.uiError.set(null); this.uiErrorKey.set(null);

    try {
      await this.cartService.removeItem(itemIdentifier, variationIdParam);
    } catch (error: any) {
      console.error(`CartPageComponent: Error calling cartService.removeItem (propagated from service) for item ${loadingKey}:`, error);
      this.uiErrorKey.set('cartPage.errorRemoveItem');
      this.uiError.set(this.translocoService.translate(this.uiErrorKey()!));
    } finally {
      this.isRemovingItem.set(null);
      this.cdr.markForCheck();
    }
  }

  // *** MODIFIZIERT: Umbenannt und vereinfacht ***
  public goToCheckoutDetails(): void {
    if (this.itemCount() === 0) {
      this.uiErrorKey.set('cartPage.errorEmptyCartCheckout');
      this.uiError.set(this.translocoService.translate(this.uiErrorKey()!));
      return;
    }
    // Die Logik für das Staging des Warenkorbs wurde in `checkout-details-page.component.ts` verschoben (in proceedToPayment)
    // Hier navigieren wir nur noch.
    this.router.navigate(['/checkout-details']);
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
    const productIdForLink = item.parent_product_id || item.id;
    console.warn(`CartPage: Could not determine a slug for item "${item.name}" (ID: ${item.id}, ProductID for Link: ${productIdForLink}). Falling back to ID for link.`);
    return `/product/${productIdForLink}`;
  }

  getProductImageForItem(item: WooCommerceStoreCartItem): string | undefined {
    return item.images?.[0]?.thumbnail || item.images?.[0]?.src;
  }
}