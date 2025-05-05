// /src/app/shared/components/mini-cart/mini-cart.component.ts
import { Component, inject, Signal, ChangeDetectionStrategy, computed } from '@angular/core'; // computed hinzugefügt
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { UiStateService } from '../../services/ui-state.service';
import { CartService } from '../../services/cart.service';
import { CartLineEdgeNode, Cart } from '../../../core/services/shopify.service';
import { FormatPricePipe } from '../../pipes/format-price.pipe';
// CurrencyPipe wird nicht direkt importiert

// Typ für Subtotal Daten
type SubtotalData = Cart['cost']['subtotalAmount'] | null;

@Component({
  selector: 'app-mini-cart',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormatPricePipe // Nur die eigene Pipe importieren
  ],
  templateUrl: './mini-cart.component.html',
  styleUrls: ['./mini-cart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MiniCartComponent {
  private uiStateService = inject(UiStateService);
  private cartService = inject(CartService);

  // Signale vom CartService
  cart$: Signal<Cart | null> = this.cartService.cart;
  isLoading: Signal<boolean> = this.cartService.isLoading;
  error: Signal<string | null> = this.cartService.error;

  // Abgeleitetes Signal für die Items
  items: Signal<CartLineEdgeNode[]> = computed(() => this.cart$()?.lines?.edges?.map(edge => edge.node) ?? []);

  // Abgeleitetes Signal für Subtotal
  subtotalData: Signal<SubtotalData> = computed(() => this.cart$()?.cost?.subtotalAmount ?? null);

  // --- Methoden für UI-Interaktion ---
  closeCart(): void {
    this.uiStateService.closeMiniCart();
  }

  cancelTimeout(): void {
    this.uiStateService.cancelCloseTimeout();
  }

  startTimeout(): void {
    this.uiStateService.startCloseTimeout();
  }

  // --- Methoden für Cart-Aktionen ---
  increaseQuantity(lineId: string, currentQuantity: number): void {
    this.cartService.updateLineQuantity(lineId, currentQuantity + 1);
  }

  decreaseQuantity(lineId: string, currentQuantity: number): void {
    this.cartService.updateLineQuantity(lineId, currentQuantity - 1);
  }

  /**
   * Leitet den Benutzer zur externen Shopify Checkout URL weiter.
   * Schließt den Mini-Warenkorb vor der Weiterleitung.
   */
  goToCheckout(): void {
    const checkoutUrl = this.cart$()?.checkoutUrl; // Hole URL aus dem Signal
    if (checkoutUrl) {
      this.closeCart(); // Schließe den Mini-Warenkorb ZUERST
      // Kurze Verzögerung vor Weiterleitung (optional, kann UI-Sprung verhindern)
      setTimeout(() => {
        window.location.href = checkoutUrl; // Externe Weiterleitung
      }, 50); // 50ms Verzögerung
    } else {
      console.error("MiniCart: Checkout URL not available!");
      // Setze einen Fehler im CartService, damit er ggf. global angezeigt wird
      this.cartService.error.set("Checkout nicht möglich. Bitte Warenkorb prüfen.");
      // Optional: Schließe den Mini-Cart trotzdem oder lasse ihn offen, um den Fehler anzuzeigen?
      // this.closeCart();
    }
  }
}