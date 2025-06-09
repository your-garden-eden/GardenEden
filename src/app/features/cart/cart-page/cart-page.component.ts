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
  WritableSignal,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

import { CartService } from '../../../shared/services/cart.service';
import { AuthService } from '../../../shared/services/auth.service';
import { UiStateService } from '../../../shared/services/ui-state.service';
import {
  WooCommerceStoreCart,
  WooCommerceStoreCartItem,
  WooCommerceStoreCartTotals
} from '../../../core/services/woocommerce.service';
import { FormatPricePipe } from '../../../shared/pipes/format-price.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { SafeHtmlPipe } from '../../../shared/pipes/safe-html.pipe';

@Component({
  selector: 'app-cart-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslocoModule,
    FormatPricePipe,
    LoadingSpinnerComponent,
    SafeHtmlPipe
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
  private uiStateService = inject(UiStateService);
  private cdr = inject(ChangeDetectorRef);

  readonly cart: Signal<WooCommerceStoreCart | null> = this.cartService.cart;
  readonly itemCount: Signal<number> = this.cartService.cartItemCount;
  readonly serviceError: Signal<string | null> = this.cartService.error;
  
  readonly uiError: WritableSignal<string | null> = signal(null);
  
  readonly isBusy: Signal<boolean> = computed(() => 
    !!this.cartService.isUpdatingItemKey() || 
    this.cartService.isClearingCart() || 
    this.cartService.isProcessing()
  );

  readonly cartTotals: Signal<WooCommerceStoreCartTotals | null> = computed(() => this.cart()?.totals ?? null);
  readonly cartItems: Signal<WooCommerceStoreCartItem[]> = computed(() => this.cart()?.items ?? []);
  
  public isLoggedIn: Signal<boolean> = toSignal(this.authService.isLoggedIn$, { initialValue: false }); 

  private subscriptions = new Subscription();

  ngOnInit(): void {
    const langChangeSub = this.translocoService.langChanges$.subscribe(() => {
        this.titleService.setTitle(this.translocoService.translate('cartPage.title'));
    });
    this.subscriptions.add(langChangeSub);
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

  private getItemIdentifier(item: WooCommerceStoreCartItem): string | number {
    return this.isLoggedIn() ? (item.parent_product_id || item.id) : item.key;
  }
  
  public getItemLoadingKey(item: WooCommerceStoreCartItem): string {
    const productId = item.parent_product_id || item.id;
    const variationId = item.parent_product_id ? item.id : 0;
    const userKey = `${productId}_${variationId}`;
    return this.isLoggedIn() ? userKey : item.key;
  }

  async updateQuantity(item: WooCommerceStoreCartItem, newQuantity: number): Promise<void> {
    this.uiError.set(null);
    try {
      const identifier = this.getItemIdentifier(item);
      const variationId = this.isLoggedIn() ? (item.parent_product_id ? item.id : undefined) : undefined;
      await this.cartService.updateItemQuantity(identifier, newQuantity, variationId);
    } catch (error) {
      this.uiError.set(this.translocoService.translate('cartPage.errors.updateFailed'));
    }
  }

  incrementQuantity(item: WooCommerceStoreCartItem): void { this.updateQuantity(item, item.quantity + 1); }
  decrementQuantity(item: WooCommerceStoreCartItem): void { this.updateQuantity(item, item.quantity - 1); }

  async removeItem(item: WooCommerceStoreCartItem): Promise<void> {
    this.uiError.set(null);
    try {
      const identifier = this.getItemIdentifier(item);
      const variationId = this.isLoggedIn() ? (item.parent_product_id ? item.id : undefined) : undefined;
      await this.cartService.removeItem(identifier, variationId);
    } catch (error) {
      this.uiError.set(this.translocoService.translate('cartPage.errors.removeItem'));
    }
  }

  // +++ KORREKTUR: Methode mit optionalem Parameter erweitert +++
  public goToCheckout(forceAddressPage: boolean = false): void {
    if (this.itemCount() === 0) {
      this.uiError.set(this.translocoService.translate('cartPage.errors.emptyCartCheckout'));
      return;
    }

    // Wenn der Nutzer die Adresse ändern will ODER nicht eingeloggt ist -> gehe zur Adressseite
    if (forceAddressPage || !this.isLoggedIn()) {
      this.router.navigate(['/checkout-details']);
    } else {
      // Nur wenn eingeloggt und "Direkt zur Kasse" geklickt wird
      this.cartService.initiateCheckout();
    }
  }

  async clearCart(): Promise<void> {
    const confirmed = await this.uiStateService.openConfirmationModal({
      titleKey: 'cartPage.confirmClear.title',
      messageKey: 'cartPage.confirmClear.message',
      confirmButtonKey: 'cartPage.confirmClear.confirmButton',
      confirmButtonClass: 'danger'
    });
    
    if (confirmed) {
      this.uiError.set(null);
      try {
        await this.cartService.clearCart();
      } catch (error) {
         this.uiError.set(this.translocoService.translate('cartPage.errors.clearCart'));
      }
    }
  }

  getProductLink(item: WooCommerceStoreCartItem): string {
    if (item.permalink) {
      try {
        const url = new URL(item.permalink);
        const pathSegments = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
        return `/product/${pathSegments[pathSegments.length - 1]}`;
      } catch (e) {
        // Fallback
      }
    }
    return `/product/${item.parent_product_id || item.id}`;
  }

  getProductImage(item: WooCommerceStoreCartItem): string | undefined {
    return item.images?.[0]?.thumbnail || item.images?.[0]?.src;
  }
}