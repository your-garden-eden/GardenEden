// /src/app/features/wishlist/wishlist-page/wishlist-page.component.ts
import { Component, inject, Signal, ChangeDetectionStrategy, OnDestroy, OnInit, PLATFORM_ID, WritableSignal, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';

import { WishlistService } from '../../../shared/services/wishlist.service';
import { CartService } from '../../../shared/services/cart.service';
import { DisplayWishlistItem } from '../../../shared/services/wishlist.models';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { UiStateService } from '../../../shared/services/ui-state.service';
import { SafeHtmlPipe } from '../../../shared/pipes/safe-html.pipe';

@Component({
  selector: 'app-wishlist-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslocoModule,
    LoadingSpinnerComponent,
    SafeHtmlPipe,
  ],
  templateUrl: './wishlist-page.component.html',
  styleUrls: ['./wishlist-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishlistPageComponent implements OnInit, OnDestroy {
  private wishlistService = inject(WishlistService);
  private cartService = inject(CartService);
  private uiStateService = inject(UiStateService);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private platformId = inject(PLATFORM_ID);

  public displayWishlist: Signal<DisplayWishlistItem[]> = this.wishlistService.displayWishlist;
  public isLoading: Signal<boolean> = this.wishlistService.isLoading;
  public serviceError: Signal<string | null> = this.wishlistService.error;
  public itemCount: Signal<number> = this.wishlistService.wishlistItemCount;

  public isPerformingAction: WritableSignal<string | null> = signal(null);

  private langSub: Subscription | undefined;

  constructor() {
    this.titleService.setTitle(this.translocoService.translate('wishlistPage.title'));
  }

  ngOnInit(): void {
    this.langSub = this.translocoService.langChanges$.subscribe(() => {
      this.titleService.setTitle(this.translocoService.translate('wishlistPage.title'));
    });
  }

  ngOnDestroy(): void {
    this.langSub?.unsubscribe();
  }

  trackByItemId(index: number, item: DisplayWishlistItem): string {
    return `${item.product_id}_${item.variation_id || 0}`;
  }

  getProductLink(item: DisplayWishlistItem): string {
    return `/product/${item.productDetails?.slug}`;
  }

  getProductImage(item: DisplayWishlistItem): string | undefined {
    return item.variationDetails?.image?.src || item.productDetails?.images?.[0]?.src;
  }

  async removeFromWishlist(item: DisplayWishlistItem): Promise<void> {
    const itemId = this.trackByItemId(0, item);
    this.isPerformingAction.set(itemId);
    try {
      await this.wishlistService.removeFromWishlist(item.product_id, item.variation_id);
    } finally {
      // +++ KORREKTUR: Die Seite muss nach der Aktion wieder entsperrt werden. +++
      // Da das Element verschwindet, ist es okay, wenn das sofort passiert.
      this.isPerformingAction.set(null);
    }
  }

  async moveToCart(item: DisplayWishlistItem): Promise<void> {
    const itemId = this.trackByItemId(0, item);
    const productForCheck = item.variationDetails || item.productDetails;
    const productName = item.productDetails?.name || '';

    if (!productForCheck || productForCheck.stock_status !== 'instock' || !productForCheck.purchasable) {
      this.uiStateService.showGlobalError(
        this.translocoService.translate('wishlist.errors.notAvailable', { productName: productName })
      );
      return;
    }

    this.isPerformingAction.set(itemId);
    try {
      await this.cartService.addItem(item.product_id, 1, item.variation_id);
      await this.wishlistService.removeFromWishlist(item.product_id, item.variation_id);
      this.uiStateService.showGlobalSuccess(
        this.translocoService.translate('wishlist.success.movedToCart', { productName: productName })
      );
    } catch (e) {
      this.uiStateService.showGlobalError(
        this.translocoService.translate('wishlist.errors.moveToCartFailed', { productName: productName })
      );
    } finally {
      // +++ KORREKTUR: Die Seite muss auch hier wieder entsperrt werden. +++
      this.isPerformingAction.set(null);
    }
  }

  async addAllToCart(): Promise<void> {
    const availableItems = this.displayWishlist().filter(item => {
      const product = item.variationDetails || item.productDetails;
      return product && product.stock_status === 'instock' && product.purchasable;
    });

    if (availableItems.length === 0) {
      this.uiStateService.showGlobalWarning(this.translocoService.translate('wishlist.errors.noneAvailableToAdd'));
      return;
    }
    
    this.isPerformingAction.set('addAll');
    try {
      await Promise.all(
        availableItems.map(item => this.cartService.addItem(item.product_id, 1, item.variation_id))
      );
      await Promise.all(
        availableItems.map(item => this.wishlistService.removeFromWishlist(item.product_id, item.variation_id))
      );
      this.uiStateService.showGlobalSuccess(
        this.translocoService.translate('wishlist.success.allMovedToCart', { count: availableItems.length })
      );
    } catch (e) {
      this.uiStateService.showGlobalError(this.translocoService.translate('wishlist.errors.addAllToCart'));
    } finally {
      this.isPerformingAction.set(null);
    }
  }

  async clearWishlist(): Promise<void> {
    const confirmed = await this.uiStateService.openConfirmationModal({
      titleKey: 'wishlistPage.confirmClear.title',
      messageKey: 'wishlistPage.confirmClear.message',
      confirmButtonKey: 'wishlistPage.confirmClear.confirmButton',
      confirmButtonClass: 'danger'
    });

    if (confirmed) {
      this.isPerformingAction.set('clearAll');
      try {
        await this.wishlistService.clearWishlist();
      } finally {
        this.isPerformingAction.set(null);
      }
    }
  }
}