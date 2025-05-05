// /src/app/shared/components/mini-cart/mini-cart.component.ts
import { Component, inject, signal, computed, Signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common'; // CurrencyPipe für Template importieren
import { Router, RouterModule } from '@angular/router';
import { CartService } from '../../services/cart.service';
import { UiStateService } from '../../services/ui-state.service';
import { Cart, CartLineEdgeNode, ShopifyPrice } from '../../../core/services/shopify.service'; // ShopifyPrice importieren
import { FormatPricePipe } from '../../pipes/format-price.pipe'; // FormatPricePipe für Template importieren

@Component({
  selector: 'app-mini-cart',
  standalone: true,
  // FormatPricePipe und CurrencyPipe bleiben hier für die Template-Nutzung!
  imports: [CommonModule, RouterModule, FormatPricePipe, CurrencyPipe],
  templateUrl: './mini-cart.component.html',
  styleUrl: './mini-cart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MiniCartComponent {
  private cartService = inject(CartService);
  private uiStateService = inject(UiStateService);
  private router = inject(Router);
  // Pipe wird NICHT mehr injiziert:
  // private formatPricePipe = inject(FormatPricePipe);

  // --- Signale vom CartService ---
  readonly cart: Signal<Cart | null> = this.cartService.cart;
  readonly isLoading: Signal<boolean> = this.cartService.isLoading;
  readonly error: Signal<string | null> = this.cartService.error;

  // Computed Signal für die Artikel
  readonly items: Signal<CartLineEdgeNode[]> = computed(() => {
    return this.cart()?.lines?.edges?.map(edge => edge.node) ?? [];
  });

  // --- Computed Signal für die Zwischensumme (Rohdaten) ---
  // Gibt jetzt das ShopifyPrice-Objekt oder null zurück
  readonly subtotalData: Signal<ShopifyPrice | null> = computed(() => {
    return this.cart()?.cost?.subtotalAmount ?? null;
  });
  // --- ENDE Änderung ---

  // Computed Signal für die Gesamtanzahl
   readonly totalQuantity: Signal<number> = computed(() => this.cart()?.totalQuantity ?? 0);

  /** Erhöht die Menge eines Artikels um 1 */
  increaseQuantity(lineId: string, currentQuantity: number): void {
    console.log(`MiniCart: Increasing qty for line ${lineId}`);
    this.cartService.updateLineQuantity(lineId, currentQuantity + 1);
  }

  /** Verringert die Menge eines Artikels um 1 (Service entfernt bei 0) */
  decreaseQuantity(lineId: string, currentQuantity: number): void {
     console.log(`MiniCart: Decreasing qty for line ${lineId}`);
     this.cartService.updateLineQuantity(lineId, currentQuantity - 1);
  }

  /** Navigiert zum Checkout (Placeholder) */
  goToCheckout(): void {
    console.log('MiniCart: Navigating to checkout...');
    this.closeCart();
    // TODO: Später zum echten Checkout oder Guard navigieren
    this.router.navigate(['/checkout']); // Beispielroute
  }

  /** Bricht den Timeout zum Schließen ab (bei MouseEnter auf Mini-Cart) */
  cancelTimeout(): void {
    this.uiStateService.cancelCloseTimeout();
  }

  /** Startet den Timeout zum Schließen (bei MouseLeave vom Mini-Cart) */
  startTimeout(): void {
    this.uiStateService.startCloseTimeout();
  }

   /** Schließt den Mini-Cart explizit (z.B. über einen Button) */
   closeCart(): void {
      this.uiStateService.closeMiniCart();
   }
}