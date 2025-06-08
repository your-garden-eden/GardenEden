// /src/app/features/checkout/checkout-details-page/checkout-details-page.component.ts

import {
  Component, OnInit, inject, signal, computed, effect, untracked,
  ChangeDetectorRef, OnDestroy, AfterViewInit, ViewChild, ElementRef, NgZone,
  WritableSignal,
  PLATFORM_ID,
  DestroyRef,
  Signal
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidatorFn } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { firstValueFrom, of } from 'rxjs';
import { startWith, switchMap, tap, catchError, filter, take } from 'rxjs/operators';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';

import { GoogleMapsModule } from '@angular/google-maps';

import {
  WoocommerceService,
  WooCommerceStoreCart,
  WooCommerceStoreAddress,
  WooCommerceStoreCartItem,
  StageCartPayload,
  StageCartResponse,
  WooCommerceStoreCartTotals
} from '../../../core/services/woocommerce.service';
import { CartService } from '../../../shared/services/cart.service';
import { AuthService, WordPressUser } from '../../../shared/services/auth.service';
import { AccountService } from '../../account/services/account.service';
import { UserAddressesResponse } from '../../account/services/account.models';
import { FormatPricePipe } from '../../../shared/pipes/format-price.pipe';

declare var google: any;

@Component({
  selector: 'app-checkout-details-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    TranslocoModule,
    GoogleMapsModule,
    FormatPricePipe
  ],
  templateUrl: './checkout-details-page.component.html',
  styleUrls: ['./checkout-details-page.component.scss']
})
export class CheckoutDetailsPageComponent implements OnInit, AfterViewInit, OnDestroy {
  private fb = inject(FormBuilder);
  public cartService = inject(CartService);
  private woocommerceService = inject(WoocommerceService);
  private authService = inject(AuthService);
  private accountService = inject(AccountService);
  private router = inject(Router);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private platformId: object = inject(PLATFORM_ID);
  private destroyRef = inject(DestroyRef);

  billingForm!: FormGroup;
  shippingForm!: FormGroup;

  showShippingForm = signal(false);
  formSubmitted = signal(false);

  public isLoggedIn = computed(() => !!this.authService.getCurrentUserValue());

  isLoadingAddress = signal(false);
  addressError = signal<string | null>(null);
  addressErrorKey = signal<string | null>(null);
  addressSuccess = signal<string | null>(null);

  shippingInfo = signal<{ rateId: string; packageName: string; price: string; currencyCode: string; } | null | 'not_needed' | 'error'>(null);
  isLoadingShipping = signal(false); 
  shippingError = signal<string | null>(null);
  shippingErrorKey = signal<string | null>(null);

  isRedirecting = signal(false);

  @ViewChild('billingAddressStreetInput') billingAddressStreetInput!: ElementRef<HTMLInputElement>;
  @ViewChild('shippingAddressStreetInput') shippingAddressStreetInput!: ElementRef<HTMLInputElement>;

  private billingAutocomplete: google.maps.places.Autocomplete | undefined;
  private shippingAutocomplete: google.maps.places.Autocomplete | undefined;
  private billingAutocompleteListener: google.maps.MapsEventListener | undefined;
  private shippingAutocompleteListener: google.maps.MapsEventListener | undefined;

  public autocompleteOptions: google.maps.places.AutocompleteOptions = {
    componentRestrictions: { country: 'de' },
    types: ['address'],
    fields: ['address_components', 'formatted_address']
  };

  cart: Signal<WooCommerceStoreCart | null> = this.cartService.cart;
  cartTotals: Signal<WooCommerceStoreCartTotals | null> = computed(() => this.cart()?.totals ?? null);

  orderSummary = computed(() => {
    const currentCart = this.cart();
    if (!currentCart) return null;
    let determinedShippingRateDisplay: string | null = null;
    if (currentCart.needs_shipping === false) {
        determinedShippingRateDisplay = this.translocoService.translate('checkoutDetailsPage.shipping.notNeeded');
    } else {
        determinedShippingRateDisplay = this.translocoService.translate('general.free');
    }
    return {
      items: currentCart.items,
      totals: currentCart.totals,
      selectedShippingRateDisplay: determinedShippingRateDisplay
    };
  });

  displayableShippingInfoObject = computed(() => {
    const sInfoSignalValue = this.shippingInfo();
    if (typeof sInfoSignalValue === 'object' && sInfoSignalValue !== null &&
        'packageName' in sInfoSignalValue && 'price' in sInfoSignalValue && 'currencyCode' in sInfoSignalValue) {
        const sInfoTyped = sInfoSignalValue as { packageName: string; price: string; currencyCode: string; rateId: string; };
        return {
            packageName: sInfoTyped.packageName,
            price: sInfoTyped.price, 
            currencyCode: sInfoTyped.currencyCode,
            isFree: parseFloat(sInfoTyped.price) === 0
        };
    }
    return null;
  });

   readonly showShippingCosts: Signal<boolean> = computed(() => false);

  constructor() {
    effect(() => {
      const serviceCartError = untracked(() => this.cartService.error());
      const currentAddressError = untracked(() => this.addressError());
      const currentAddressErrorKeyVal = untracked(() => this.addressErrorKey());

      if (serviceCartError && !currentAddressError) {
        this.setError('checkoutDetailsPage.errors.globalCart', { serviceErrorMsg: serviceCartError });
      }
      else if (!serviceCartError && currentAddressErrorKeyVal === 'checkoutDetailsPage.errors.globalCart') {
          this.addressError.set(null);
          this.addressErrorKey.set(null);
      }
      this.cdr.markForCheck();
    });

    effect(() => {
      const showShipping = this.showShippingForm();
      untracked(() => {
          if (isPlatformBrowser(this.platformId)) {
            if (this.shippingAddressStreetInput?.nativeElement) {
                 if (showShipping && !this.shippingAutocomplete) { this.initializeShippingAutocomplete(); }
            }
            if (!showShipping && this.shippingAutocompleteListener) { this.destroyShippingAutocompleteListener(); }
          }
      });
    });
  }

  ngOnInit(): void {
    this.setupForms();
    this.setupTitleObserver();
    if (isPlatformBrowser(this.platformId)) {
        this.loadInitialData().catch(err => {
            console.error("Checkout ngOnInit: Error during initial data load:", err);
            this.setError('checkoutDetailsPage.errors.loadDataFailed');
        });
    }
  }

  async ngAfterViewInit(): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
      try {
        await this.initializeBillingAutocomplete();
        if (this.showShippingForm() && this.shippingAddressStreetInput?.nativeElement && !this.shippingAutocomplete) {
          await this.initializeShippingAutocomplete();
        }
      } catch (error) {
        console.error("Checkout ngAfterViewInit: Error initializing Google Maps Autocomplete:", error);
         this.setError('registerPage.errorAutocompleteInitGeneral');
      }
    }
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
        this.destroyBillingAutocompleteListener();
        this.destroyShippingAutocompleteListener();
    }
  }

  private setupTitleObserver(): void {
    this.translocoService.langChanges$.pipe(
      takeUntilDestroyed(this.destroyRef),
      startWith(this.translocoService.getActiveLang()),
      switchMap(lang => this.translocoService.selectTranslate('checkoutDetailsPage.title', {}, lang)),
      tap(translatedPageTitle => {
        this.titleService.setTitle(translatedPageTitle);
        const currentErrorKeyVal = untracked(() => this.addressErrorKey());
        if (currentErrorKeyVal) { this.addressError.set(this.translocoService.translate(currentErrorKeyVal)); }
      })
    ).subscribe(() => this.cdr.detectChanges());
  }

  private setupForms(): void {
    this.billingForm = this.fb.group({
      first_name: ['', Validators.required], last_name: ['', Validators.required], company: [''],
      address_1: ['', Validators.required], address_2: [''], city: ['', Validators.required],
      postcode: ['', [Validators.required, Validators.pattern(/^\d{5}$/)]],
      country: [{ value: 'DE', disabled: false }, Validators.required],
      state: [''],
      email: ['', [Validators.required, Validators.email]], phone: ['', Validators.required]
    });
    this.shippingForm = this.fb.group({
      first_name: [''], last_name: [''], company: [''], address_1: [''], address_2: [''],
      city: [''], postcode: ['', Validators.pattern(/^\d{5}$/)], country: [{ value: 'DE', disabled: false }], state: ['']
    });
    this.updateShippingFormValidators(this.showShippingForm());
  }

  public handleShowShippingChange(event: Event): void {
    const inputElement = event.target as HTMLInputElement | null;
    if (inputElement) {
      const isChecked = inputElement.checked;
      this.showShippingForm.set(isChecked);
      this.updateShippingFormValidators(isChecked);
    }
  }

  private updateShippingFormValidators(show: boolean): void {
    const requiredIfShown: ValidatorFn[] = show ? [Validators.required] : [];
    const postcodeValidators: ValidatorFn[] = show ? [Validators.required, Validators.pattern(/^\d{5}$/)] : [Validators.pattern(/^\d{5}$/)];
    if (!show) { this.shippingForm.reset({ country: 'DE' }, { emitEvent: false }); }
    this.setFormControlValidators(this.shippingForm, 'first_name', requiredIfShown);
    this.setFormControlValidators(this.shippingForm, 'last_name', requiredIfShown);
    this.setFormControlValidators(this.shippingForm, 'address_1', requiredIfShown);
    this.setFormControlValidators(this.shippingForm, 'city', requiredIfShown);
    this.setFormControlValidators(this.shippingForm, 'postcode', postcodeValidators);
    this.setFormControlValidators(this.shippingForm, 'country', show ? [Validators.required] : []);
  }

  private setFormControlValidators(form: FormGroup, controlName: string, validators: ValidatorFn | ValidatorFn[] | null): void {
    const control = form.get(controlName);
    if (control) { control.setValidators(validators); control.updateValueAndValidity({ emitEvent: false }); }
  }

  private async loadInitialData(): Promise<void> {
    this.isLoadingAddress.set(true);
    let currentCart = this.cartService.cart();
    if (!currentCart && isPlatformBrowser(this.platformId)) {
      await this.cartService.loadInitialStoreApiCart();
      currentCart = this.cartService.cart();
    }

    if (!currentCart || this.cartService.cartItemCount() === 0) {
      if (isPlatformBrowser(this.platformId)) this.router.navigate(['/warenkorb']);
      this.isLoadingAddress.set(false);
      return;
    }

    if (this.isLoggedIn()) {
      const loggedInUser = this.authService.getCurrentUserValue()!;
      try {
        const userAddresses = await firstValueFrom(this.accountService.getUserAddresses());
        this.populateFormsWithUserData(userAddresses, loggedInUser);
      } catch (error) {
        console.error('[CheckoutDetailsPage] Could not fetch user addresses, falling back to user data.', error);
        this.populateFormsWithUserData(null, loggedInUser);
      }
    } else {
      if (currentCart.billing_address) { this.billingForm.patchValue(this.mapAddressToForm(currentCart.billing_address, this.billingForm), { emitEvent: false }); }
      if (currentCart.shipping_address) {
        const isDifferent = this.isShippingDifferent(currentCart.billing_address, currentCart.shipping_address);
        this.showShippingForm.set(isDifferent);
        if (isDifferent) { this.shippingForm.patchValue(this.mapAddressToForm(currentCart.shipping_address, this.shippingForm), { emitEvent: false }); }
      }
    }
    
    this.isLoadingAddress.set(false);
    this.cdr.markForCheck();
  }
  
  private populateFormsWithUserData(userAddresses: UserAddressesResponse | null, loggedInUser: WordPressUser): void {
    const billingPayload: any = userAddresses ? userAddresses.billing : {};
    const shippingPayload: any = userAddresses ? userAddresses.shipping : {};

    billingPayload.email = loggedInUser.email;
    billingPayload.first_name = billingPayload.first_name || loggedInUser.firstName;
    billingPayload.last_name = billingPayload.last_name || loggedInUser.lastName;
    
    this.billingForm.patchValue(this.mapAddressToForm(billingPayload, this.billingForm), { emitEvent: false });
    
    const isDifferent = this.isShippingDifferent(billingPayload, shippingPayload);
    this.showShippingForm.set(isDifferent);
    this.updateShippingFormValidators(isDifferent);

    if (isDifferent) {
      this.shippingForm.patchValue(this.mapAddressToForm(shippingPayload, this.shippingForm), { emitEvent: false });
    }
  }

  private mapAddressToForm(address: any, form: FormGroup): Partial<any> {
    const formValues: any = {};
    Object.keys(form.controls).forEach(key => { 
        if (address.hasOwnProperty(key) && address[key] !== null && address[key] !== undefined) { 
            formValues[key] = address[key]; 
        }
    });
    if (form.get('country') && !formValues.country) { formValues.country = 'DE'; }
    if (form.get('state') && !formValues.state) { formValues.state = address.state || ''; }
    return formValues;
  }

  private isShippingDifferent(billing: any, shipping: any): boolean {
    if (!shipping || Object.values(shipping).every(v => v === '' || v === null)) return false;
    if (!billing) return true;
    const relevantKeys = ['first_name', 'last_name', 'company', 'address_1', 'address_2', 'city', 'postcode', 'country', 'state'];
    for (const key of relevantKeys) { if ((billing[key] || '') !== (shipping[key] || '')) return true; }
    return false;
  }

  get bf() { return this.billingForm.controls; }
  get sf() { return this.shippingForm.controls; }

  private async initializeBillingAutocomplete(): Promise<void> {}
  private async initializeShippingAutocomplete(): Promise<void> {}
  private onPlaceChanged(autocomplete: google.maps.places.Autocomplete, form: FormGroup): void {}
  private destroyBillingAutocompleteListener(): void {}
  private destroyShippingAutocompleteListener(): void {}

  async handleAddressFormSubmit(): Promise<void> {
    this.formSubmitted.set(true);
    this.clearMessages();

    if (!this.validateForms()) {
      this.setError('checkoutDetailsPage.errors.fillRequiredFields');
      return;
    }

    this.isLoadingAddress.set(true);
    
    const customerDataForProfile = this.prepareCustomerDataForProfile();
    const customerDataForStoreApi = this.prepareCustomerDataForStoreApi();

    try {
      if (this.isLoggedIn()) {
        await firstValueFrom(this.accountService.updateUserAddresses(customerDataForProfile));
      }
      const storeApiCartResponse = await firstValueFrom(this.woocommerceService.updateCartCustomer(customerDataForStoreApi));
      if (storeApiCartResponse) {
        this.cartService.cart.set((this.cartService as any)['_convertStoreApiPricesInCart'](storeApiCartResponse));
      }
      this.setSuccess('checkoutDetailsPage.addressSaveSuccess');
    } catch (error: any) {
      const errorDetail = error.error?.message || error.message || 'Unknown server error';
      this.setError('checkoutDetailsPage.errors.addressSaveFailed', { details: errorDetail });
    } finally {
      this.isLoadingAddress.set(false);
      this.formSubmitted.set(false);
      this.cdr.markForCheck();
    }
  }
  
  private validateForms(): boolean {
    this.billingForm.markAllAsTouched();
    let isValid = this.billingForm.valid;
    if (this.showShippingForm()) { this.shippingForm.markAllAsTouched(); isValid = isValid && this.shippingForm.valid; }
    return isValid;
  }

  private prepareCustomerDataForStoreApi(): { billing_address: WooCommerceStoreAddress, shipping_address: WooCommerceStoreAddress } {
    const billing = this.billingForm.getRawValue();
    const shipping = (this.showShippingForm() && this.shippingFormHasValues()) ? this.shippingForm.getRawValue() : billing;
    return { billing_address: billing, shipping_address: shipping };
  }

  private prepareCustomerDataForProfile(): UserAddressesResponse {
      const billing = this.billingForm.getRawValue();
      const shipping = (this.showShippingForm() && this.shippingFormHasValues()) ? this.shippingForm.getRawValue() : billing;
      return { billing, shipping };
  }
  
  async proceedToPayment(): Promise<void> {
    this.formSubmitted.set(true);
    if (!this.validateForms()) {
      this.setError('checkoutDetailsPage.errors.fillRequiredFields');
      return;
    }
    const currentCart = this.cart();
    if (!currentCart || this.cartService.cartItemCount() === 0) {
      this.setError('checkoutDetailsPage.emptyCartMessage');
      if (isPlatformBrowser(this.platformId)) this.router.navigate(['/warenkorb']);
      return;
    }
    
    this.isRedirecting.set(true);
    this.clearMessages();

    const customerDataForProfile = this.prepareCustomerDataForProfile();

    if (this.isLoggedIn()) {
      try {
        await firstValueFrom(this.accountService.updateUserAddresses(customerDataForProfile));
      } catch (e) {
        console.error('Failed to save user addresses before staging, proceeding anyway...', e);
      }
    }
    
    const cartItemsForStaging = currentCart.items.map(item => ({
      product_id: item.parent_product_id || item.id,
      quantity: item.quantity,
      variation_id: item.id !== (item.parent_product_id || item.id) ? item.id : undefined
    }));
    
    const payload: StageCartPayload = {
      items: cartItemsForStaging,
      billing_address: customerDataForProfile.billing,
      shipping_address: customerDataForProfile.shipping
    };

    try {
      const stageResponse = await firstValueFrom(this.woocommerceService.stageCartForPopulation(payload));
      if (stageResponse?.success && stageResponse.token) {
        this.woocommerceService.clearLocalCartToken();
        if (isPlatformBrowser(this.platformId)) {
          window.location.href = this.woocommerceService.getCheckoutUrl(stageResponse.token);
        }
      } else {
        throw new Error(stageResponse.message || 'Vorbereitung des Warenkorbs fehlgeschlagen.');
      }
    } catch (error: any) {
      this.setError('checkoutDetailsPage.errors.checkoutProcessFailed', { details: error.message || 'Unbekannter Fehler.' });
      this.isRedirecting.set(false);
    }
  }

  private shippingFormHasValues(): boolean {
    const rawShipping = this.shippingForm.getRawValue() as WooCommerceStoreAddress;
    return Object.values(rawShipping).some(v => v !== null && v !== '' && v !== undefined && v !== 'DE');
  }

  private focusFirstInvalidField(form: FormGroup): void {
    for (const key of Object.keys(form.controls)) {
      if (form.controls[key].invalid) {
        const el = document.querySelector(`[formcontrolname="${key}"]`);
        if (el) { (el as HTMLElement).focus(); }
        break;
      }
    }
  }

  private clearMessages(): void {
    this.addressError.set(null);
    this.addressErrorKey.set(null);
    this.addressSuccess.set(null);
  }

  private setError(key: string, params: object = {}): void {
    this.addressErrorKey.set(key);
    this.addressError.set(this.translocoService.translate(key, params));
    this.cdr.markForCheck();
  }
  
  private setSuccess(key: string, params: object = {}): void {
    this.addressSuccess.set(this.translocoService.translate(key, params));
    this.cdr.markForCheck();
  }

  getProductLinkForItem(item: WooCommerceStoreCartItem): string { return `/product/${item.permalink?.split('/').filter(Boolean).pop() || item.id}`; }
  getProductImageForItem(item: WooCommerceStoreCartItem): string | undefined { return item.images?.[0]?.thumbnail || item.images?.[0]?.src; }
}