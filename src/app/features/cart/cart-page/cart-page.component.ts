// /src/app/features/cart/pages/cart-page/cart-page.component.ts
import {
  Component,
  inject,
  signal,
  ChangeDetectionStrategy,
  computed,
  Signal,
  OnInit,
  OnDestroy,
  WritableSignal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { CartService, ExtendedCartItem, ExtendedWooCommerceStoreCart } from '../../../shared/services/cart.service';
import { AuthService } from '../../../shared/services/auth.service';
import { UiStateService } from '../../../shared/services/ui-state.service';
import {
  WooCommerceStoreCartItem,
  WooCommerceStoreCartTotals
} from '../../../core/services/woocommerce.service';
import { FormatPricePipe } from '../../../shared/pipes/format-price.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { SafeHtmlPipe } from '../../../shared/pipes/safe-html.pipe';
// --- NEU: TrackingService importieren ---
import { TrackingService } from '../../../core/services/tracking.service';

@Component({
  selector: 'app-cart-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslocoModule,
    FormsModule,
    ReactiveFormsModule,
    FormatPricePipe,
    LoadingSpinnerComponent,
    SafeHtmlPipe,
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
  public uiStateService = inject(UiStateService);
  private fb = inject(FormBuilder);
  // --- NEU: TrackingService injizieren ---
  private trackingService = inject(TrackingService);

  couponForm!: FormGroup;

  readonly cart: Signal<ExtendedWooCommerceStoreCart | null> = this.cartService.cart;
  readonly itemCount: Signal<number> = this.cartService.cartItemCount;
  
  readonly uiError: Signal<string | null> = computed(() => {
    return this.cartService.error() || this._uiError();
  });
  _uiError: WritableSignal<string | null> = signal(null);

  readonly isBusy: Signal<boolean> = computed(() => 
    !!this.cartService.isUpdatingItemKey() || 
    this.cartService.isClearingCart() || 
    this.cartService.isProcessing() ||
    this.cartService.isApplyingCoupon()
  );

  readonly cartItems: Signal<ExtendedCartItem[]> = this.cartService.cartItems;
  readonly cartTotals: Signal<WooCommerceStoreCartTotals | null> = this.cartService.cartTotals;
  public isLoggedIn: Signal<boolean> = toSignal(this.authService.isLoggedIn$, { initialValue: false }); 
  private subscriptions = new Subscription();

  readonly undiscountedSubtotal = computed(() => {
    return this.cartItems().reduce((total, item) => {
      const price = parseFloat(item.prices?.regular_price || '0');
      return total + (price * item.quantity);
    }, 0);
  });

  constructor() {}

  ngOnInit(): void {
    this.couponForm = this.fb.group({
      code: ['', Validators.required]
    });

    const langChangeSub = this.translocoService.langChanges$.subscribe(() => {
        this.titleService.setTitle(this.translocoService.translate('cartPage.title'));
    });
    this.subscriptions.add(langChangeSub);
    this.titleService.setTitle(this.translocoService.translate('cartPage.title'));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  trackByItemKey(index: number, item: ExtendedCartItem): string {
    return item.key;
  }

  trackByVariationAttribute(index: number, variant: { attribute: string; value: string }): string {
    return variant.attribute;
  }

  async updateQuantity(item: ExtendedCartItem, newQuantity: number): Promise<void> {
    this._uiError.set(null);
    try {
      await this.cartService.updateItemQuantity(item.key, newQuantity);
    } catch (error) {
      this._uiError.set(this.translocoService.translate('cartPage.errors.updateFailed'));
    }
  }

  incrementQuantity(item: ExtendedCartItem): void { this.updateQuantity(item, item.quantity + 1); }
  decrementQuantity(item: ExtendedCartItem): void { this.updateQuantity(item, item.quantity - 1); }

  async removeItem(item: ExtendedCartItem): Promise<void> {
    this._uiError.set(null);
    try {
      await this.cartService.removeItem(item.key);
    } catch (error) {
      this._uiError.set(this.translocoService.translate('cartPage.errors.removeItem'));
    }
  }

  async applyCoupon(): Promise<void> {
    this._uiError.set(null);
    this.cartService.error.set(null);
    if (this.couponForm.invalid) {
      return;
    }
    const code = this.couponForm.value.code;
    try {
      await this.cartService.applyCoupon(code);
      this.couponForm.reset();
    } catch (error: any) {
      // Der Fehler wird bereits im Service gesetzt und im Template angezeigt.
    }
  }
  
  async removeCoupon(code: string): Promise<void> {
    this._uiError.set(null);
    this.cartService.error.set(null);
    try {
      await this.cartService.removeCoupon(code);
    } catch (error: any) {
      // Fehler wird im Service gesetzt.
    }
  }

  public goToCheckout(changeAddress: boolean = false): void {
    const currentCart = this.cart(); // Warenkorb einmal abrufen
    if (this.itemCount() === 0 || !currentCart) {
      this._uiError.set(this.translocoService.translate('cartPage.errors.emptyCartCheckout'));
      return;
    }
    
    // --- NEU: Tracking-Event hier auslösen ---
    this.trackingService.trackBeginCheckout(currentCart);

    if (changeAddress && this.isLoggedIn()) {
      this.router.navigate(['/checkout-details']);
      return;
    }
    this.cartService.initiateCheckout();
  }

  async clearCart(): Promise<void> {
    const confirmed = await this.uiStateService.openConfirmationModal({
      titleKey: 'cartPage.confirmClear.title',
      messageKey: 'cartPage.confirmClear.message',
      confirmButtonKey: 'cartPage.confirmClear.confirmButton',
      confirmButtonClass: 'danger'
    });
    
    if (confirmed) {
      this._uiError.set(null);
      try {
        await this.cartService.clearCart();
      } catch (error) {
         this._uiError.set(this.translocoService.translate('cartPage.errors.clearCart'));
      }
    }
  }

  getProductLink(item: ExtendedCartItem): string {
    if (!item.slug) {
      const productId = item.parent_product_id || item.id;
      return `/product/${productId}`;
    }
    return `/product/${item.slug}`;
  }

  getProductImage(item: ExtendedCartItem): string | undefined {
    return item.images?.[0]?.thumbnail || item.images?.[0]?.src;
  }
  
  calculateLinePrice(item: ExtendedCartItem): string {
    const price = parseFloat(item.prices?.regular_price || '0');
    return (price * item.quantity).toFixed(2);
  }
}