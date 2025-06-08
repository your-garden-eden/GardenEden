// /src/app/features/checkout/order-confirmation/order-confirmation.component.ts
import { Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { startWith, switchMap } from 'rxjs/operators';
import { Title } from '@angular/platform-browser';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

import { CartService } from '../../../shared/services/cart.service';
import { WoocommerceService, OrderDetails } from '../../../core/services/woocommerce.service';
import { AuthService } from '../../../shared/services/auth.service';

import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { FormatPricePipe } from '../../../shared/pipes/format-price.pipe';
import { SafeHtmlPipe } from '../../../shared/pipes/safe-html.pipe'; // HINZUGEFÜGT

// State-Interface für unser Signal
interface OrderDetailsState {
  isLoading: boolean;
  data: OrderDetails | null;
  error: string | null;
}

@Component({
  selector: 'app-order-confirmation',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslocoModule,
    LoadingSpinnerComponent,
    FormatPricePipe,
    DatePipe,
    SafeHtmlPipe // HINZUGEFÜGT
  ],
  templateUrl: './order-confirmation.component.html',
  styleUrls: ['./order-confirmation.component.scss']
})
export class OrderConfirmationComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private cartService = inject(CartService);
  private translocoService = inject(TranslocoService);
  private titleService = inject(Title);
  private destroyRef = inject(DestroyRef);
  private woocommerceService = inject(WoocommerceService);
  private authService = inject(AuthService);

  // State-Signal zur Verwaltung von Laden, Daten und Fehlern
  orderDetailsState = signal<OrderDetailsState>({ isLoading: true, data: null, error: null });
  
  // Konvertiere das isLoggedIn$ Observable in ein Signal
  isLoggedIn = toSignal(this.authService.isLoggedIn$, { initialValue: false });
  
  // Computed Signal zur Prüfung, ob der Nutzer anonym ist
  isAnonymous = computed(() => !this.isLoggedIn());

  confirmationMessageKey: string = 'orderConfirmationPage.defaultThankYou';
  isErrorPage: boolean = false;

  ngOnInit(): void {
    this.setupTitleObserver();
    this.handleOrderFromUrlParams();
  }

  private handleOrderFromUrlParams(): void {
    this.route.queryParams.pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(params => {
      const orderId = params['order_id'];
      const orderKey = params['order_key'];
      const paymentStatus = params['payment_status'];

      console.log('[OrderConfirmation] Query-Parameter empfangen:', params);

      if (paymentStatus === 'success' && orderId && orderKey) {
        console.log('[OrderConfirmation] Zahlung erfolgreich für Bestellung:', orderId);
        
        // WICHTIG: Leert den Warenkorb im Frontend und auf dem Server
        this.cartService.handleSuccessfulOrder(); 
        
        // Ruft die Bestelldetails vom neuen Endpunkt ab
        this.fetchOrderDetails(orderId, orderKey);
        
      } else {
        // Fallback für andere Status (fehlgeschlagen, abgebrochen etc.)
        this.orderDetailsState.set({ isLoading: false, data: null, error: null });
        if (paymentStatus === 'failed') {
          console.warn('[OrderConfirmation] Zahlung fehlgeschlagen.');
          this.confirmationMessageKey = 'orderConfirmationPage.paymentFailed';
          this.isErrorPage = true;
        } else if (paymentStatus === 'cancelled') {
          console.log('[OrderConfirmation] Zahlung wurde abgebrochen.');
          this.confirmationMessageKey = 'orderConfirmationPage.paymentCancelled';
          this.isErrorPage = true;
        } else {
          console.log('[OrderConfirmation] Seite mit unklarem Status aufgerufen.');
          this.confirmationMessageKey = 'orderConfirmationPage.statusUnclear';
          this.isErrorPage = false; // Keine Fehlerseite für unklaren Status
        }
      }
    });
  }
  
  private fetchOrderDetails(orderId: string, orderKey: string): void {
    this.orderDetailsState.set({ isLoading: true, data: null, error: null });
    
    this.woocommerceService.getOrderDetails(orderId, orderKey).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        console.log('[OrderConfirmation] Bestelldetails erfolgreich abgerufen:', data);
        this.orderDetailsState.set({ isLoading: false, data: data, error: null });
        this.confirmationMessageKey = 'orderConfirmationPage.success';
        this.isErrorPage = false;
      },
      error: (err) => {
        console.error('[OrderConfirmation] Fehler beim Abrufen der Bestelldetails:', err);
        const errorMessage = this.translocoService.translate('orderConfirmationPage.fetchError');
        this.orderDetailsState.set({ isLoading: false, data: null, error: errorMessage });
        this.isErrorPage = true;
      }
    });
  }

  private setupTitleObserver(): void {
    this.translocoService.langChanges$.pipe(
      takeUntilDestroyed(this.destroyRef),
      startWith(this.translocoService.getActiveLang() as string),
      switchMap(lang => this.translocoService.selectTranslate('orderConfirmationPage.title', {}, lang))
    ).subscribe(translatedPageTitle => {
      this.titleService.setTitle(translatedPageTitle);
    });
  }
}