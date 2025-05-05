import { Component, inject, signal, ChangeDetectionStrategy, computed, Signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

// --- KORRIGIERTE PFADE & IMPORTE ---
import { CartService } from '../../../shared/services/cart.service'; // Pfad zum CartService
// Importiere Cart und CartLineEdgeNode direkt aus ShopifyService
import { Cart, CartLineEdgeNode} from '../../../core/services/shopify.service'; // Pfad zu shopify.service prüfen!
// --- ENDE KORRIGIERTE PFADE & IMPORTE ---



@Component({
  selector: 'app-cart-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    CurrencyPipe,
    // FormatPricePipe, // Importieren, FALLS du deine Pipe verwenden willst
    // SafeHtmlPipe, // Nicht benötigt hier
    // ImageTransformPipe // Nicht benötigt hier
  ],
  templateUrl: './cart-page.component.html',
  styleUrls: ['./cart-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CartPageComponent {
  private cartService = inject(CartService);
  private router = inject(Router);

  // --- Signale ---
  cart: Signal<Cart | null> = this.cartService.cart;
  isLoadingCart: Signal<boolean> = this.cartService.isLoading;
  cartError: Signal<string | null> = this.cartService.error;
  itemCount: Signal<number> = this.cartService.cartItemCount;

  // Gesamtpreis (als Zahl)
  totalPrice = computed(() => {
      const amountString = this.cart()?.cost?.totalAmount?.amount;
      return amountString ? parseFloat(amountString) : 0;
  });

  // Lokale Signale für UI-Feedback bei Zeilen-Updates
  isUpdatingLine = signal<string | null>(null);
  updateLineError = signal<string | null>(null);

  // --- Methoden ---

  async updateQuantity(lineId: string, newQuantity: number): Promise<void> {
    this.isUpdatingLine.set(lineId);
    this.updateLineError.set(null);
    try {
      // Service kümmert sich um Logik für Menge <= 0
      await this.cartService.updateLineQuantity(lineId, newQuantity);
    } catch (error: any) {
      console.error('Error in component calling updateLineQuantity:', error);
      this.updateLineError.set(error?.message || 'Menge konnte nicht aktualisiert werden.');
    } finally {
      this.isUpdatingLine.set(null);
    }
  }

  // Verwende den korrekten Typ CartLineEdgeNode
  async incrementQuantity(line: CartLineEdgeNode): Promise<void> {
    await this.updateQuantity(line.id, line.quantity + 1);
  }

  // Verwende den korrekten Typ CartLineEdgeNode
  async decrementQuantity(line: CartLineEdgeNode): Promise<void> {
    await this.updateQuantity(line.id, line.quantity - 1);
  }

  async removeItem(lineId: string): Promise<void> {
    this.isUpdatingLine.set(lineId);
    this.updateLineError.set(null);
    try {
      await this.cartService.removeLine(lineId);
    } catch (error: any) {
      console.error('Error in component calling removeLine:', error);
      this.updateLineError.set(error?.message || 'Artikel konnte nicht entfernt werden.');
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
      // Setze den Fehler auf cartError oder updateLineError? Hier eher globaler.
      this.cartService.error.set('Checkout nicht möglich. Bitte versuchen Sie es später erneut.');
    }
  }

  // Getter gibt jetzt Array vom Typ 'CartLineEdgeNode' zurück
  get cartLines(): CartLineEdgeNode[] {
    return this.cart()?.lines?.edges?.map(edge => edge.node) ?? [];
  }

  // Helper-Funktion zur Berechnung des Gesamtpreises einer Zeile
  calculateLineTotal(line: CartLineEdgeNode): number {
     const pricePerItem = parseFloat(line.merchandise.price.amount);
     return pricePerItem * line.quantity;
  }

  // Nicht mehr unbedingt nötig, da totalPrice() eine Zahl ist
  get cartTotalAmountString(): string {
    return this.cart()?.cost.totalAmount.amount ?? '0';
  }
}