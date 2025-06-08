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

import { CartService } from '../../../shared/services/cart.service';
import { AuthService } from '../../../shared/services/auth.service';
import { UiStateService } from '../../../shared/services/ui-state.service';
import {
  WooCommerceStoreCart,
  WooCommerceStoreCartItem,
  WooCommerceStoreCartTotals
} from '../../../core/services/woocommerce.service';
import { FormatPricePipe } from '../../../shared/pipes/format-price.pipe';
import { CartDiscountInfoModalComponent } from '../../../shared/components/cart-discount-info-modal/cart-discount-info-modal.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component'; // HINZUGEFÜGT

@Component({
  selector: 'app-cart-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslocoModule,
    FormatPricePipe,
    CartDiscountInfoModalComponent,
    LoadingSpinnerComponent // HINZUGEFÜGT
  ],
  templateUrl: './cart-page.component.html',
  styleUrls: ['./cart-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CartPageComponent implements OnInit, OnDestroy {
  public cartService = inject(CartService);
  private authService = inject(AuthService);
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
  readonly isProcessingCheckout: WritableSignal<boolean> = signal(false);

  readonly isUpdatingLine: WritableSignal<string | null> = signal(null);
  readonly isRemovingItem: WritableSignal<string | null> = signal(null);
  readonly lineUpdateError: WritableSignal<string | null> = signal(null);

  readonly cartTotals: Signal<WooCommerceStoreCartTotals | null> = computed(() => this.cart()?.totals ?? null);
  readonly cartItems: Signal<WooCommerceStoreCartItem[]> = computed(() => this.cart()?.items ?? []);

  readonly showCartDiscountPopup$: Signal<boolean> = this.uiStateService.showCartDiscountPopup$;
  
  public isLoggedIn: boolean = false; 

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
      switchMap(lang => this.translocoService.selectTranslate('cartPage.title', {}, lang)),
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
    ).subscribe(() => this.cdr.detectChanges());
    this.subscriptions.add(langChangeSub);

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
      console.error(`CartPageComponent: Error calling cartService.updateItemQuantity for item ${loadingKey}:`, error);
      this.lineUpdateError.set(this.translocoService.translate('cartPage.errors.updateFailed'));
    } finally {
      this.isUpdatingLine.set(null);
      this.cdr.markForCheck();
    }
  }

  incrementQuantity(item: WooCommerceStoreCartItem): void { this.updateQuantity(item, item.quantity + 1); }
  decrementQuantity(item: WooCommerceStoreCartItem): void { this.updateQuantity(item, item.quantity - 1); }

  async removeItem(itemIdentifier: string | number, variationIdParam?: number): Promise<void> {
    const loadingKey = typeof itemIdentifier === 'string' ? itemIdentifier : `${itemIdentifier}_${variationIdParam || 0}`;
    this.isRemovingItem.set(loadingKey);
    this.lineUpdateError.set(null);
    this.uiError.set(null); this.uiErrorKey.set(null);

    try {
      await this.cartService.removeItem(itemIdentifier, variationIdParam);
    } catch (error: any) {
      this.uiErrorKey.set('cartPage.errors.removeItem');
      this.uiError.set(this.translocoService.translate(this.uiErrorKey()!));
    } finally {
      this.isRemovingItem.set(null);
      this.cdr.markForCheck();
    }
  }

  // Für anonyme Nutzer, leitet zur Adressseite weiter
  public goToCheckoutDetails(): void {
    if (this.itemCount() === 0) {
      this.uiErrorKey.set('cartPage.errors.emptyCartCheckout');
      this.uiError.set(this.translocoService.translate(this.uiErrorKey()!));
      return;
    }
    this.router.navigate(['/checkout-details']);
  }

  // +++ NEUE METHODE FÜR DEN DIREKTEN CHECKOUT +++
  public async directCheckout(): Promise<void> {
    if (this.itemCount() === 0) {
      this.uiErrorKey.set('cartPage.errors.emptyCartCheckout');
      this.uiError.set(this.translocoService.translate(this.uiErrorKey()!));
      return;
    }
    this.isProcessingCheckout.set(true);
    this.uiError.set(null); this.uiErrorKey.set(null);

    try {
      // Ruft die neue, zentrale Logik im CartService auf
      await this.cartService.initiateCheckout();
    } catch (error: any) {
      // Fehler werden bereits im Service behandelt und im `serviceError`-Signal gesetzt,
      // aber wir können hier eine zusätzliche UI-Reaktion hinzufügen.
      console.error("Error from directCheckout button:", error);
      this.isProcessingCheckout.set(false);
      this.cdr.markForCheck();
    }
    // `isProcessingCheckout` wird im Service auf `false` gesetzt, wenn ein Fehler auftritt.
    // Bei Erfolg wird die Seite sowieso neu geladen, also ist das Zurücksetzen nicht kritisch.
  }

  getProductLinkForItem(item: WooCommerceStoreCartItem): string {
    if (item.permalink) {
      try {
        const url = new URL(item.permalink);
        const pathSegments = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
        return `/product/${pathSegments[pathSegments.length - 1]}`;
      } catch (e) {
        console.warn(`CartPage: Could not parse permalink "${item.permalink}"`, e);
      }
    }
    return `/product/${item.parent_product_id || item.id}`;
  }

  getProductImageForItem(item: WooCommerceStoreCartItem): string | undefined {
    return item.images?.[0]?.thumbnail || item.images?.[0]?.src;
  }
}