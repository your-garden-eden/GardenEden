// /src/app/shared/components/mini-cart/mini-cart.component.ts
import { Component, inject, Signal, ChangeDetectionStrategy, computed, OnInit, OnDestroy, ChangeDetectorRef, WritableSignal, signal, effect, untracked } from '@angular/core'; // effect, untracked hinzugefügt
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { UiStateService } from '../../services/ui-state.service';
import { CartService } from '../../services/cart.service';
import { CartLineEdgeNode, Cart } from '../../../core/services/shopify.service';
import { FormatPricePipe } from '../../pipes/format-price.pipe';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs';
import { startWith } from 'rxjs/operators'; // switchMap hier nicht unbedingt nötig

type SubtotalData = Cart['cost']['subtotalAmount'] | null;

@Component({
  selector: 'app-mini-cart',
  standalone: true,
  imports: [ CommonModule, RouterModule, FormatPricePipe, TranslocoModule ],
  templateUrl: './mini-cart.component.html',
  styleUrls: ['./mini-cart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MiniCartComponent implements OnInit, OnDestroy {
  private uiStateService = inject(UiStateService);
  private cartService = inject(CartService);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);

  cart$: Signal<Cart | null> = this.cartService.cart;
  isLoading: Signal<boolean> = this.cartService.isLoading;
  
  // Lokales Signal für die UI-Fehlermeldung im MiniCart
  error: WritableSignal<string | null> = signal(null); 
  private errorKey: WritableSignal<string | null> = signal(null); 

  items: Signal<CartLineEdgeNode[]> = computed(() => this.cart$()?.lines?.edges?.map(edge => edge.node) ?? []);
  subtotalData: Signal<SubtotalData> = computed(() => this.cart$()?.cost?.subtotalAmount ?? null);
  
  private subscriptions = new Subscription();

  constructor() {
    // Effekt, um auf Änderungen des globalen cartService.error Signals zu reagieren
    effect(() => {
      const serviceError = this.cartService.error(); // Wert des Signals lesen
      // Wir müssen untracked verwenden, um den Key zu lesen, ohne eine zirkuläre Abhängigkeit im Effekt zu erzeugen
      const currentErrorKey = untracked(this.errorKey); 
      
      if (serviceError) {
        // Wenn der Service einen Fehler hat, den wir hier noch nicht mit Key kennen,
        // setzen wir einen generischen Key oder versuchen, den Service-Fehler direkt zu verwenden,
        // wenn er schon übersetzt ist (was aber nicht ideal ist für Sprachwechsel).
        // Hier wäre es besser, wenn der CartService selbst einen Key setzen würde.
        // Fürs Erste, wenn ein Service-Fehler da ist und wir keinen spezifischen Key haben,
        // setzen wir einen generischen.
        if (!currentErrorKey) { // Nur wenn wir nicht schon einen spezifischeren Fehler anzeigen
            this.errorKey.set('miniCart.errorGlobal');
            this.error.set(this.translocoService.translate(this.errorKey()!));
        }
      } else if (currentErrorKey === 'miniCart.errorGlobal' || !serviceError) {
        // Wenn der Service-Fehler weg ist ODER unser aktueller Fehler der generische globale war,
        // dann löschen wir unseren lokalen Fehler.
        this.error.set(null);
        this.errorKey.set(null);
      }
      this.cdr.markForCheck();
    });
  }

  ngOnInit(): void {
    // Bei Sprachwechsel die aktuelle lokale Fehlermeldung neu übersetzen
    const langChangeSub = this.translocoService.langChanges$.pipe(
        startWith(this.translocoService.getActiveLang())
    ).subscribe(() => {
        if (this.errorKey()) {
            this.error.set(this.translocoService.translate(this.errorKey()!));
            this.cdr.markForCheck();
        }
    });
    this.subscriptions.add(langChangeSub);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  closeCart(): void {
    this.uiStateService.closeMiniCart();
  }

  cancelTimeout(): void {
    this.uiStateService.cancelCloseTimeout();
  }

  startTimeout(): void {
    this.uiStateService.startCloseTimeout();
  }

  increaseQuantity(lineId: string, currentQuantity: number): void {
    this.errorKey.set(null); this.error.set(null);
    this.cartService.updateLineQuantity(lineId, currentQuantity + 1)
      .catch(() => {
        this.errorKey.set('miniCart.errorUpdateQuantity');
        this.error.set(this.translocoService.translate(this.errorKey()!));
      });
  }

  decreaseQuantity(lineId: string, currentQuantity: number): void {
    this.errorKey.set(null); this.error.set(null);
    this.cartService.updateLineQuantity(lineId, currentQuantity - 1)
      .catch(() => {
        this.errorKey.set('miniCart.errorUpdateQuantity');
        this.error.set(this.translocoService.translate(this.errorKey()!));
      });
  }

  goToCheckout(): void {
    this.errorKey.set(null); this.error.set(null);
    const checkoutUrl = this.cart$()?.checkoutUrl;
    if (checkoutUrl) {
      this.closeCart();
      setTimeout(() => { window.location.href = checkoutUrl; }, 50);
    } else {
      console.error("MiniCart: Checkout URL not available!");
      this.errorKey.set('miniCart.errorCheckoutNotPossible');
      this.error.set(this.translocoService.translate(this.errorKey()!));
      // Optional: Den Fehler auch im globalen CartService setzen, falls andere Komponenten darauf reagieren sollen
      // this.cartService.error.set(this.translocoService.translate(this.errorKey()!));
    }
  }
}