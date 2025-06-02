// src/app/features/checkout/order-confirmation/order-confirmation.component.ts
import { Component, OnInit, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription, of } from 'rxjs'; // 'of' importiert für den Fall, dass es benötigt wird
import { take, startWith, switchMap } from 'rxjs/operators'; // 'startWith' und 'switchMap' importiert
import { Title } from '@angular/platform-browser';
import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { CartService } from '../../../shared/services/cart.service'; // Pfad anpassen, falls nötig

@Component({
  selector: 'app-order-confirmation',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule, // Für routerLink
    TranslocoModule
  ],
  templateUrl: './order-confirmation.component.html',
  styleUrls: ['./order-confirmation.component.scss']
})
export class OrderConfirmationComponent implements OnInit { // OnDestroy ist nicht mehr nötig dank takeUntilDestroyed
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cartService = inject(CartService);
  private translocoService = inject(TranslocoService);
  private titleService = inject(Title);
  private destroyRef = inject(DestroyRef);

  orderId: string | null = null;
  paymentStatus: string | null = null;
  isLoading: boolean = true;
  confirmationMessageKey: string = 'orderConfirmationPage.defaultThankYou';
  isError: boolean = false;

  // private langChangeSubscription!: Subscription; // Nicht mehr benötigt

  ngOnInit(): void {
    this.setupTitleObserver();

    this.route.queryParams.pipe(take(1)).subscribe(params => {
      this.orderId = params['order_id'] || null;
      this.paymentStatus = params['payment_status'] || null;

      console.log('[OrderConfirmation] Query Params:', params);

      if (this.paymentStatus === 'success' && this.orderId) {
        console.log('[OrderConfirmation] Payment successful for order:', this.orderId, '. Clearing local cart.');
        this.cartService.clearLocalCartStateForCheckout();
        this.confirmationMessageKey = 'orderConfirmationPage.success';
        this.isError = false;
      } else if (this.paymentStatus === 'failed') {
        console.warn('[OrderConfirmation] Payment failed for order attempt.');
        this.confirmationMessageKey = 'orderConfirmationPage.paymentFailed';
        this.isError = true;
      } else if (this.paymentStatus === 'cancelled') {
        console.log('[OrderConfirmation] Payment was cancelled.');
        this.confirmationMessageKey = 'orderConfirmationPage.paymentCancelled';
        this.isError = true;
      } else {
        console.log('[OrderConfirmation] Page accessed with unclear status or no specific payment parameters.');
        this.confirmationMessageKey = 'orderConfirmationPage.statusUnclear';
        this.isError = false;
      }
      this.isLoading = false;
    });
  }

  private setupTitleObserver(): void {
    this.translocoService.langChanges$.pipe(
      takeUntilDestroyed(this.destroyRef),
      startWith(this.translocoService.getActiveLang() as string), // Typ-Assertion für getActiveLang()
      switchMap(lang => this.translocoService.selectTranslate('orderConfirmationPage.title', {}, lang))
    ).subscribe(translatedPageTitle => {
      this.titleService.setTitle(translatedPageTitle);
    });
  }

  // ngOnDestroy ist nicht mehr nötig, da takeUntilDestroyed verwendet wird
}