// /src/app/features/cart/cart-page/cart-page.component.ts
import { Component, inject, signal, ChangeDetectionStrategy, computed, Signal, OnInit, OnDestroy, ChangeDetectorRef, WritableSignal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs';
import { startWith, switchMap, tap } from 'rxjs/operators';

import { CartService } from '../../../shared/services/cart.service';
import { Cart, CartLineEdgeNode} from '../../../core/services/shopify.service';

@Component({
  selector: 'app-cart-page',
  standalone: true,
  imports: [ CommonModule, RouterLink, CurrencyPipe, TranslocoModule ],
  templateUrl: './cart-page.component.html',
  styleUrls: ['./cart-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CartPageComponent implements OnInit, OnDestroy {
  private cartService = inject(CartService);
  private router = inject(Router);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);

  cart: Signal<Cart | null> = this.cartService.cart;
  isLoadingCart: Signal<boolean> = this.cartService.isLoading;
  cartError: Signal<string | null> = this.cartService.error;
  private cartErrorKey: WritableSignal<string | null> = signal(null);
  itemCount: Signal<number> = this.cartService.cartItemCount;

  totalPrice = computed(() => {
      const amountString = this.cart()?.cost?.totalAmount?.amount;
      return amountString ? parseFloat(amountString) : 0;
  });

  isUpdatingLine = signal<string | null>(null);
  updateLineError = signal<string | null>(null);
  private updateLineErrorKey = signal<string | null>(null);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    const langChangeSub = this.translocoService.langChanges$.pipe(
      startWith(this.translocoService.getActiveLang()),
      switchMap(lang => 
        this.translocoService.selectTranslate('cartPage.title', {}, lang)
      ),
      tap(translatedPageTitle => {
        this.titleService.setTitle(translatedPageTitle);
        if (this.cartErrorKey()) { 
          this.cartService.error.set(this.translocoService.translate(this.cartErrorKey()!));
        }
        if (this.updateLineErrorKey()) {
          this.updateLineError.set(this.translocoService.translate(this.updateLineErrorKey()!));
        }
      })
    ).subscribe(() => {
      this.cdr.detectChanges();
    });
    this.subscriptions.add(langChangeSub);

    // Initiales Setzen der Fehler-Keys und Übersetzungen
    if (this.cartService.error()) {
        // Diese Logik müsste verfeinert werden, um den *Key* des Fehlers zu kennen.
        // Für den Moment gehen wir davon aus, der Service liefert den Key oder wir setzen einen generischen.
        // Beispiel:
        // const currentGlobalError = this.cartService.error();
        // if (currentGlobalError === 'some.error.key.from.service') {
        //    this.cartErrorKey.set(currentGlobalError);
        // } else {
        //    this.cartErrorKey.set('cartPage.errorGlobalDefault'); // Generischer Fallback-Key
        //    this.cartService.error.set(this.translocoService.translate(this.cartErrorKey()!));
        // }
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  async updateQuantity(lineId: string, newQuantity: number): Promise<void> {
    this.isUpdatingLine.set(lineId);
    this.updateLineError.set(null);
    this.updateLineErrorKey.set(null);
    try {
      await this.cartService.updateLineQuantity(lineId, newQuantity);
    } catch (error: any) {
      console.error('Error in component calling updateLineQuantity:', error);
      const errorKey = 'cartPage.errorUpdateQuantity';
      this.updateLineErrorKey.set(errorKey);
      this.updateLineError.set(this.translocoService.translate(errorKey));
    } finally {
      this.isUpdatingLine.set(null);
    }
  }

  async incrementQuantity(line: CartLineEdgeNode): Promise<void> {
    await this.updateQuantity(line.id, line.quantity + 1);
  }

  async decrementQuantity(line: CartLineEdgeNode): Promise<void> {
    await this.updateQuantity(line.id, line.quantity - 1);
  }

  async removeItem(lineId: string): Promise<void> {
    this.isUpdatingLine.set(lineId);
    this.updateLineError.set(null);
    this.updateLineErrorKey.set(null);
    try {
      await this.cartService.removeLine(lineId);
    } catch (error: any) {
      console.error('Error in component calling removeLine:', error);
      const errorKey = 'cartPage.errorRemoveItem';
      this.updateLineErrorKey.set(errorKey);
      this.updateLineError.set(this.translocoService.translate(errorKey));
    } finally {
      this.isUpdatingLine.set(null);
    }
  }

  goToCheckout(): void {
    const checkoutUrl = this.cart()?.checkoutUrl;
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    } else {
      console.error('Checkout URL not available!');
      const errorKey = 'cartPage.errorCheckoutNotPossible';
      this.cartErrorKey.set(errorKey);
      this.cartService.error.set(this.translocoService.translate(errorKey));
    }
  }

  get cartLines(): CartLineEdgeNode[] {
    return this.cart()?.lines?.edges?.map(edge => edge.node) ?? [];
  }

  calculateLineTotal(line: CartLineEdgeNode): number {
     const pricePerItem = parseFloat(line.merchandise.price.amount);
     return pricePerItem * line.quantity;
  }
}