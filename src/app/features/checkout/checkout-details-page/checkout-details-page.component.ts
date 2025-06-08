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
import { CartService, UserCartData, UserCartItem } from '../../../shared/services/cart.service';
import { AuthService, WordPressUser } from '../../../shared/services/auth.service';
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

  isLoadingAddress = signal(false);
  addressError = signal<string | null>(null);
  addressErrorKey = signal<string | null>(null);

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
    console.log('[CheckoutDetailsPage orderSummary] Computing. Current cart for summary:', currentCart ? `Items: ${currentCart.items_count}, Totals: ${JSON.stringify(currentCart.totals)}` : 'null');
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

   readonly showShippingCosts: Signal<boolean> = computed(() => {
    return false; 
  });

  constructor() {
    effect(() => {
      const serviceCartError = untracked(() => this.cartService.error());
      const currentAddressError = untracked(() => this.addressError());
      const currentAddressErrorKeyVal = untracked(() => this.addressErrorKey());

      if (serviceCartError && !currentAddressError) {
        this.setError(this.addressError, this.addressErrorKey, 'checkoutDetailsPage.errors.globalCart', { serviceErrorMsg: serviceCartError });
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
        this.loadInitialDataFromCartAndFetchShipping().catch(err => {
            console.error("Checkout ngOnInit: Error during initial data load:", err);
            this.setError(this.addressError, this.addressErrorKey, 'checkoutDetailsPage.errors.loadDataFailed');
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
         this.setError(this.addressError, this.addressErrorKey, 'registerPage.errorAutocompleteInitGeneral');
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
        const currentAddressErrKeyVal = untracked(() => this.addressErrorKey());
        if (currentAddressErrKeyVal) { this.addressError.set(this.translocoService.translate(currentAddressErrKeyVal)); }
        const currentShippingErrKeyVal = untracked(() => this.shippingErrorKey());
        if (currentShippingErrKeyVal) { this.shippingError.set(this.translocoService.translate(currentShippingErrKeyVal));}
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

  private async loadInitialDataFromCartAndFetchShipping(): Promise<void> {
    this.isLoadingAddress.set(true); 
    let currentCart = this.cartService.cart();
    console.log('[CheckoutDetailsPage loadInitialData] Initial cart from service:', currentCart ? JSON.parse(JSON.stringify(currentCart)) : 'null', 'Item Count:', this.cartService.cartItemCount());

    if (!currentCart && this.cartService.isLoading()) {
      console.log('[CheckoutDetailsPage loadInitialData] Cart is initially null and CartService is loading. Waiting...');
      await firstValueFrom(
        toObservable(this.cartService.isLoading).pipe(
          filter(isLoading => !isLoading), 
          take(1), 
          takeUntilDestroyed(this.destroyRef)
        )
      );
      currentCart = this.cartService.cart();
      console.log('[CheckoutDetailsPage loadInitialData] CartService finished loading. Cart is now:', currentCart ? JSON.parse(JSON.stringify(currentCart)) : 'null', 'Item Count:', this.cartService.cartItemCount());
    }

    if (!currentCart && isPlatformBrowser(this.platformId)) {
        console.log('[CheckoutDetailsPage loadInitialData] Cart is still null after waiting/initial check. Calling loadInitialStoreApiCart().');
        await this.cartService.loadInitialStoreApiCart(); 
        currentCart = this.cartService.cart();
        console.log('[CheckoutDetailsPage loadInitialData] Cart after loadInitialStoreApiCart:', currentCart ? JSON.parse(JSON.stringify(currentCart)) : 'null', 'Item Count:', this.cartService.cartItemCount());
    }
    
    console.log('[CheckoutDetailsPage loadInitialData] Final check before redirect/shipping: Cart:', currentCart ? JSON.parse(JSON.stringify(currentCart)) : 'null', 'Item Count:', this.cartService.cartItemCount());
    if (!currentCart || this.cartService.cartItemCount() === 0) {
        console.log('[CheckoutDetailsPage loadInitialData] No cart or cart is empty. Redirecting to /warenkorb.');
        if (isPlatformBrowser(this.platformId)) { 
            this.router.navigate(['/warenkorb']); 
        }
        this.isLoadingAddress.set(false); 
        return;
    }

    if (currentCart.billing_address && Object.keys(currentCart.billing_address).length > 0) {
      this.billingForm.patchValue(this.mapAddressToForm(currentCart.billing_address, this.billingForm), { emitEvent: false });
    } else {
        const loggedInUser = this.authService.getCurrentUserValue();
        if (loggedInUser) {
            console.warn("TODO: Lade Rechnungsadresse vom eingeloggten Benutzerprofil");
            this.billingForm.patchValue({ email: loggedInUser.email, first_name: loggedInUser.firstName, last_name: loggedInUser.lastName, country: 'DE' }, { emitEvent: false });
        }
    }

    if (currentCart.shipping_address && Object.keys(currentCart.shipping_address).filter(k => !!currentCart!.shipping_address[k as keyof WooCommerceStoreAddress]).length > 0) {
      this.showShippingForm.set(this.isShippingDifferent(currentCart.billing_address, currentCart.shipping_address));
      if (this.showShippingForm()) { this.shippingForm.patchValue(this.mapAddressToForm(currentCart.shipping_address, this.shippingForm), { emitEvent: false }); }
    } else { 
        const isShippingDifferentCheck = this.isShippingDifferent(currentCart.billing_address, null);
        this.showShippingForm.set(isShippingDifferentCheck);
        if(!isShippingDifferentCheck) {
            this.updateShippingFormValidators(false);
        }
    }
    if(!this.showShippingForm()){ 
        this.updateShippingFormValidators(false);
    }

    if (currentCart.needs_shipping === false) {
        this.shippingInfo.set('not_needed');
    } else {
        this.shippingInfo.set({
            rateId: 'free_shipping_default', 
            packageName: this.translocoService.translate('general.free'),
            price: '0.00',
            currencyCode: currentCart.totals.currency_code || 'EUR'
        });
    }
    this.isLoadingShipping.set(false);
    this.clearShippingError();

    this.isLoadingAddress.set(false); this.cdr.markForCheck();
  }

  private mapAddressToForm(address: WooCommerceStoreAddress, form: FormGroup): Partial<WooCommerceStoreAddress> {
    const formValues: any = {};
    Object.keys(form.controls).forEach(key => { 
        if (address.hasOwnProperty(key) && (address as any)[key] !== null && (address as any)[key] !== undefined) { 
            formValues[key] = (address as any)[key]; 
        }
    });
    if (form.get('country') && !formValues.country) {
        formValues.country = 'DE';
    }
    if (form.get('state') && !formValues.state) {
        formValues.state = address.state || '';
    }
    return formValues;
  }

  private isShippingDifferent(billing: WooCommerceStoreAddress | null, shipping: WooCommerceStoreAddress | null): boolean {
    if (!shipping || Object.keys(shipping).filter(k => !!shipping[k as keyof WooCommerceStoreAddress]).length === 0) return false;
    if (!billing || Object.keys(billing).filter(k => !!billing[k as keyof WooCommerceStoreAddress]).length === 0) return true;
    
    const bValues = this.mapAddressToForm(billing, this.billingForm); 
    const sValues = this.mapAddressToForm(shipping, this.shippingForm);
    const relevantKeys: (keyof WooCommerceStoreAddress)[] = ['first_name', 'last_name', 'company', 'address_1', 'address_2', 'city', 'postcode', 'country', 'state'];
    for (const key of relevantKeys) { if ((bValues[key] || '') !== (sValues[key] || '')) { return true; }}
    return false;
  }

  get bf() { return this.billingForm.controls; }
  get sf() { return this.shippingForm.controls; }

  private async initializeBillingAutocomplete(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !this.billingAddressStreetInput?.nativeElement || typeof google === 'undefined' || !google?.maps?.places?.Autocomplete) { return; }
    this.ngZone.runOutsideAngular(async () => { 
      await new Promise(resolve => setTimeout(resolve, 150));
      if (this.billingAddressStreetInput.nativeElement) {
        this.billingAutocomplete = new google.maps.places.Autocomplete(this.billingAddressStreetInput.nativeElement, this.autocompleteOptions);
        if (this.billingAutocomplete) { 
            this.billingAutocompleteListener = this.billingAutocomplete.addListener('place_changed', () => { 
                this.ngZone.run(() => { if (this.billingAutocomplete) { this.onPlaceChanged(this.billingAutocomplete, this.billingForm); }}); 
            });
        } else { console.warn("Billing Autocomplete konnte nicht initialisiert werden."); }
      }
    });
  }

  private async initializeShippingAutocomplete(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !this.shippingAddressStreetInput?.nativeElement || typeof google === 'undefined' || !google?.maps?.places?.Autocomplete) { return; }
    this.ngZone.runOutsideAngular(async () => { 
      await new Promise(resolve => setTimeout(resolve, 150));
      if (this.shippingAddressStreetInput.nativeElement) {
        this.shippingAutocomplete = new google.maps.places.Autocomplete(this.shippingAddressStreetInput.nativeElement, this.autocompleteOptions);
        if (this.shippingAutocomplete) { 
            this.shippingAutocompleteListener = this.shippingAutocomplete.addListener('place_changed', () => { 
                this.ngZone.run(() => { if (this.shippingAutocomplete) { this.onPlaceChanged(this.shippingAutocomplete, this.shippingForm); }}); 
            });
        } else { console.warn("Shipping Autocomplete konnte nicht initialisiert werden."); }
      }
    });
  }

  private onPlaceChanged(autocomplete: google.maps.places.Autocomplete, form: FormGroup): void {
    const place = autocomplete.getPlace();
    if (!place || !place.address_components) { 
        console.warn("Google Place Autocomplete: No address components found for place:", place);
        form.get('address_1')?.setErrors({'manualEntryRequired': true}); this.cdr.markForCheck(); return; 
    }
    const addressDetails: Partial<WooCommerceStoreAddress> = { country: 'DE', address_1: '', city: '', postcode: '', state: '' };
    let streetNumber = ''; let route = '';
    for (const component of place.address_components) {
        const type = component.types[0];
        switch (type) {
            case 'street_number': streetNumber = component.long_name; break; case 'route': route = component.long_name; break;
            case 'locality': addressDetails.city = component.long_name; break; case 'postal_code': addressDetails.postcode = component.long_name; break;
            case 'administrative_area_level_1': addressDetails.state = component.long_name; break; case 'country': addressDetails.country = component.short_name; break;
        }
    }
    addressDetails.address_1 = `${route} ${streetNumber}`.trim();
    Object.keys(addressDetails).forEach(key => { 
        if (form.get(key as string) && (addressDetails as any)[key] !== undefined) { 
            form.get(key as string)?.setValue((addressDetails as any)[key], { emitEvent: false }); 
        }
    });
    if (!addressDetails.address_1 && form.get('address_1') && place.formatted_address) { 
        form.get('address_1')?.setValue(place.formatted_address, { emitEvent: false }); 
    }
    form.markAllAsTouched(); this.cdr.markForCheck();
    const currentCart = this.cart();
    if (currentCart?.needs_shipping && form.valid && form.get('country')?.value && form.get('postcode')?.value && form.get('postcode')?.valid) {
        this.processShippingForEnteredAddress(currentCart).catch(err => console.error("Error processing shipping after autocomplete:", err));
    }
  }

  private destroyBillingAutocompleteListener(): void {
    if (this.billingAutocompleteListener && typeof google !== 'undefined' && google?.maps?.event) google.maps.event.removeListener(this.billingAutocompleteListener);
    if (this.billingAutocomplete && this.billingAddressStreetInput?.nativeElement && typeof google !== 'undefined' && google?.maps?.event) { try { google.maps.event.clearInstanceListeners(this.billingAddressStreetInput.nativeElement); } catch(e) { console.warn("Error clearing billing autocomplete listeners", e);}}
    this.billingAutocompleteListener = undefined; this.billingAutocomplete = undefined;
  }
  private destroyShippingAutocompleteListener(): void {
     if (this.shippingAutocompleteListener && typeof google !== 'undefined' && google?.maps?.event) google.maps.event.removeListener(this.shippingAutocompleteListener);
     if (this.shippingAutocomplete && this.shippingAddressStreetInput?.nativeElement && typeof google !== 'undefined' && google?.maps?.event) { try { google.maps.event.clearInstanceListeners(this.shippingAddressStreetInput.nativeElement); } catch(e) { console.warn("Error clearing shipping autocomplete listeners", e);}}
     this.shippingAutocompleteListener = undefined; this.shippingAutocomplete = undefined;
  }

  async handleAddressFormSubmit(): Promise<void> {
    this.formSubmitted.set(true); this.clearErrors();
    if (!this.validateForms()) {
      this.focusFirstInvalidField(this.billingForm);
      if (this.showShippingForm()) this.focusFirstInvalidField(this.shippingForm);
      this.setError(this.addressError, this.addressErrorKey, 'checkoutDetailsPage.errors.fillRequiredFields'); return;
    }
    this.isLoadingAddress.set(true); 
    const customerData = this.prepareCustomerData();
  
    try {
      const storeApiCartResponse = await firstValueFrom(this.woocommerceService.updateCartCustomer(customerData));
      console.log('[CheckoutDetailsPage] handleAddressFormSubmit - storeApiCartResponse from updateCustomer:', JSON.parse(JSON.stringify(storeApiCartResponse)));
  
      if (storeApiCartResponse) {
        const currentUser = this.authService.getCurrentUserValue();
        let cartToSetInService: WooCommerceStoreCart | null = null;
  
        const baseCartFromApiWithConvertedPrices = (this.cartService as any)['_convertStoreApiPricesInCart'](JSON.parse(JSON.stringify(storeApiCartResponse)));
        console.log('[CheckoutDetailsPage] handleAddressFormSubmit - baseCartFromApiWithConvertedPrices (after conversion):', JSON.parse(JSON.stringify(baseCartFromApiWithConvertedPrices)));

        if (currentUser && baseCartFromApiWithConvertedPrices) {
          const existingUiCart = untracked(() => this.cartService.cart());
          
          if (existingUiCart && existingUiCart.items && existingUiCart.items.length > 0) {
            console.log('[CheckoutDetailsPage] Logged-in user: Using existing UI cart items, updating rest from API response.');
            console.log('[CheckoutDetailsPage] handleAddressFormSubmit - existingUiCart ITEMS:', JSON.parse(JSON.stringify(existingUiCart.items)));

            const itemsToUse = existingUiCart.items; 
            let newTotalPriceNumber = 0;
            let newItemCount = 0;

            if (itemsToUse && itemsToUse.length > 0) {
              newItemCount = itemsToUse.reduce((sum, item) => sum + item.quantity, 0);
              newTotalPriceNumber = itemsToUse.reduce((sum, item) => {
                const lineTotalNum = parseFloat(item.totals.line_total); 
                return sum + (isNaN(lineTotalNum) ? 0 : lineTotalNum);
              }, 0);
            }
            
            cartToSetInService = {
              ...baseCartFromApiWithConvertedPrices, 
              items: itemsToUse, 
              items_count: newItemCount, 
              items_weight: existingUiCart.items_weight || 0,
              totals: {
                ...(baseCartFromApiWithConvertedPrices.totals || {currency_code: 'EUR', currency_symbol: '€', tax_lines:[]}), 
                total_price: newTotalPriceNumber.toFixed(2), 
                total_items: newItemCount.toString(),
                total_items_tax: baseCartFromApiWithConvertedPrices.totals?.total_items_tax || "0",
                total_tax: baseCartFromApiWithConvertedPrices.totals?.total_tax || "0",
              } as WooCommerceStoreCartTotals,
            };
          } else {
             console.warn('[CheckoutDetailsPage] Logged-in user, but existingUiCart was null or empty. Using full CONVERTED Store API response.');
            cartToSetInService = baseCartFromApiWithConvertedPrices;
          }
        } else if (baseCartFromApiWithConvertedPrices) { 
          console.log('[CheckoutDetailsPage] Anonymous user: Using full CONVERTED Store API response for UI cart.');
          cartToSetInService = baseCartFromApiWithConvertedPrices;
        }
        
        if (cartToSetInService) {
          console.log('[CheckoutDetailsPage] handleAddressFormSubmit - cartToSetInService before set:', JSON.parse(JSON.stringify(cartToSetInService)));
          this.cartService.cart.set(cartToSetInService); 
        } else {
          console.log('[CheckoutDetailsPage] Setting cart to null as no valid cart data was constructed for UI.');
          this.cartService.cart.set(null);
        }
  
        if(storeApiCartResponse.billing_address) {
            this.billingForm.patchValue(this.mapAddressToForm(storeApiCartResponse.billing_address, this.billingForm), { emitEvent: false });
        }
        if(storeApiCartResponse.shipping_address && Object.keys(storeApiCartResponse.shipping_address).length > 0 && this.showShippingForm()) {
          this.shippingForm.patchValue(this.mapAddressToForm(storeApiCartResponse.shipping_address, this.shippingForm), { emitEvent: false });
        } else if (!storeApiCartResponse.shipping_address || Object.keys(storeApiCartResponse.shipping_address).length === 0) {
            const isShippingDifferentCheck = this.isShippingDifferent(storeApiCartResponse.billing_address, null); 
            this.showShippingForm.set(isShippingDifferentCheck);
            this.updateShippingFormValidators(isShippingDifferentCheck);
        }
        
        await this.processShippingForEnteredAddress(cartToSetInService);
  
      } else { 
        this.setError(this.addressError, this.addressErrorKey, 'checkoutDetailsPage.errors.addressSaveFailed', { details: 'No cart data returned after update customer.' }); 
      }
    } catch (error: any) {
      const errorDetail = error.error?.message || error.message || 'Unknown server error';
      this.setError(this.addressError, this.addressErrorKey, 'checkoutDetailsPage.errors.addressSaveFailed', { details: errorDetail });
    } finally { 
      this.isLoadingAddress.set(false); 
      this.cdr.markForCheck(); 
    }
  }
  
  private validateForms(): boolean {
    this.billingForm.markAllAsTouched(); let isValid = this.billingForm.valid;
    if (this.showShippingForm()) { this.shippingForm.markAllAsTouched(); isValid = isValid && this.shippingForm.valid; }
    return isValid;
  }

  private prepareCustomerData(): { billing_address: WooCommerceStoreAddress, shipping_address: WooCommerceStoreAddress } {
    const billing = this.billingForm.getRawValue() as WooCommerceStoreAddress; 
    let shipping = billing;
    if (this.showShippingForm()) {
        const rawShipping = this.shippingForm.getRawValue() as WooCommerceStoreAddress;
        const cleanShipping: Partial<WooCommerceStoreAddress> = {};
        let shippingHasValues = false;
        for (const key in rawShipping) {
            if (rawShipping.hasOwnProperty(key) && rawShipping[key as keyof WooCommerceStoreAddress] !== null && rawShipping[key as keyof WooCommerceStoreAddress] !== '') {
                (cleanShipping as any)[key] = rawShipping[key as keyof WooCommerceStoreAddress];
                shippingHasValues = true;
            }
        }
        if (shippingHasValues) {
            shipping = cleanShipping as WooCommerceStoreAddress;
        } else if (this.showShippingForm()) {
             shipping = billing;
        }
    }
    return { billing_address: billing, shipping_address: shipping };
  }

  private async processShippingForEnteredAddress(cartForShippingParam?: WooCommerceStoreCart | null): Promise<void> {
    const currentCart = cartForShippingParam || this.cartService.cart(); 
    if (!currentCart || currentCart.needs_shipping === false) {
      this.shippingInfo.set('not_needed');
      this.isLoadingShipping.set(false); 
      this.clearShippingError(); 
      return;
    }
    
    console.log('[CheckoutDetailsPage] processShippingForEnteredAddress: Setting free shipping directly (NO API CALL).');
    this.shippingInfo.set({
        rateId: 'free_shipping_selected', 
        packageName: this.translocoService.translate('general.free'),
        price: '0.00',
        currencyCode: currentCart.totals?.currency_code || 'EUR'
    });
    this.isLoadingShipping.set(false); 
    this.clearShippingError();
    this.cdr.markForCheck();
  }

  async proceedToPayment(): Promise<void> {
    this.formSubmitted.set(true);
    if (!this.validateForms()) {
      this.focusFirstInvalidField(this.billingForm);
      if (this.showShippingForm() && !this.shippingForm.valid) this.focusFirstInvalidField(this.shippingForm);
      this.setError(this.addressError, this.addressErrorKey, 'checkoutDetailsPage.errors.fillRequiredFields');
      return;
    }

    const currentCart = this.cart();
    if (!currentCart || this.cartService.cartItemCount() === 0) {
      this.setError(this.addressError, this.addressErrorKey, 'checkoutDetailsPage.emptyCartMessage');
      if (isPlatformBrowser(this.platformId)) this.router.navigate(['/warenkorb']);
      return;
    }

    if (currentCart.needs_shipping === true && this.shippingInfo() === 'error') {
        this.setShippingError(this.shippingError, this.shippingErrorKey, 'checkoutDetailsPage.errors.selectShipping');
        return;
    }
    if (currentCart.needs_shipping === true && this.shippingInfo() === null ) {
      console.warn('[CheckoutDetailsPage] proceedToPayment: shippingInfo is null but shipping is needed. Forcing free shipping info.');
      this.shippingInfo.set({
            rateId: 'free_shipping_default',
            packageName: this.translocoService.translate('general.free'),
            price: '0.00',
            currencyCode: currentCart.totals.currency_code || 'EUR'
      });
    }

    this.isRedirecting.set(true);
    this.clearErrors();

    const cartItemsForStaging = currentCart.items.map((item: WooCommerceStoreCartItem) => {
      let productIdForItem: number;
      let variationIdForItem: number | undefined = undefined;

      if (item.parent_product_id && item.id !== item.parent_product_id) {
        variationIdForItem = item.id;
        productIdForItem = item.parent_product_id;
      } else {
        productIdForItem = item.id;
      }
      return {
        product_id: productIdForItem,
        quantity: item.quantity,
        variation_id: variationIdForItem 
      };
    }).filter(item => item.product_id > 0);

    if (cartItemsForStaging.length !== currentCart.items.length) {
        const missingIdsCount = currentCart.items.length - cartItemsForStaging.length;
        console.error(`Checkout: ${missingIdsCount} Artikel konnten nicht korrekt für Staging gemappt werden.`);
        this.setError(this.addressError, this.addressErrorKey, 'checkoutDetailsPage.errors.checkoutProcessFailed', {details: `Fehler beim Vorbereiten von ${missingIdsCount} Artikel(n).`});
        this.isRedirecting.set(false);
        return;
    }

    const customerData = this.prepareCustomerData();
    const payload: StageCartPayload = {
      items: cartItemsForStaging,
      billing_address: customerData.billing_address,
      shipping_address: (this.showShippingForm() && this.shippingFormHasValues()) ? customerData.shipping_address : undefined
    };
    if (!this.showShippingForm() || (this.showShippingForm() && !this.shippingFormHasValues())) {
      delete payload.shipping_address;
    }

    try {
      const stageResponse: StageCartResponse = await firstValueFrom(
        this.woocommerceService.stageCartForPopulation(payload).pipe(
          takeUntilDestroyed(this.destroyRef),
          catchError(err => {
            console.error('CheckoutDetailsPage: Error staging cart:', err);
            let errMsg = 'Fehler beim Vorbereiten des Warenkorbs.';
            if (err.error?.message) errMsg = err.error.message;
            else if (err.message) errMsg = err.message;
            throw new Error(errMsg);
          })
        )
      );

      if (!stageResponse || !stageResponse.success || !stageResponse.token) {
        console.error('CheckoutDetailsPage: Staging cart was not successful.', stageResponse);
        throw new Error(stageResponse.message || 'Vorbereitung des Warenkorbs fehlgeschlagen.');
      }
      const populationToken = stageResponse.token;

      if (isPlatformBrowser(this.platformId)) {
        this.woocommerceService.clearLocalCartToken();
        // *** DIESE ZEILE WURDE ENTFERNT ***
        window.location.href = this.woocommerceService.getCheckoutUrl(populationToken);
      }

    } catch (error: any) {
      console.error('Checkout: Error during proceedToPayment:', error);
      this.setError(this.addressError, this.addressErrorKey, 'checkoutDetailsPage.errors.checkoutProcessFailed', {details: error.message || 'Unbekannter Fehler im Checkout-Prozess.'});
      this.isRedirecting.set(false);
      this.cdr.markForCheck();
    }
  }

  private shippingFormHasValues(): boolean {
    const rawShipping = this.shippingForm.getRawValue() as WooCommerceStoreAddress;
    for (const key in rawShipping) {
        if (rawShipping.hasOwnProperty(key) && key !== 'country' && rawShipping[key as keyof WooCommerceStoreAddress] !== null && rawShipping[key as keyof WooCommerceStoreAddress] !== '') {
            return true;
        }
    }
    return false;
  }

  private focusFirstInvalidField(form: FormGroup | AbstractControl | null): void {
    if (!form || !(form instanceof FormGroup)) return;
    for (const key of Object.keys(form.controls)) {
        const control = form.controls[key];
        if (control.invalid) {
            const el = document.getElementById(`${form === this.billingForm ? 'billing' : 'shipping'}_${key}`);
            if (el) {
                this.ngZone.runOutsideAngular(() => { setTimeout(() => el.focus(), 0); });
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }
    }
  }

  private clearErrors(): void {
    this.addressError.set(null); this.addressErrorKey.set(null);
    this.clearShippingError();
  }
  private clearShippingError(): void {
    this.shippingError.set(null); this.shippingErrorKey.set(null);
  }

  private setError(errorSignal: WritableSignal<string | null>, keySignal: WritableSignal<string | null>, errorKey: string, params?: object): void {
    keySignal.set(errorKey); errorSignal.set(this.translocoService.translate(errorKey, params));
    this.cdr.markForCheck();
  }
  private setShippingError(errorSignal: WritableSignal<string | null>, keySignal: WritableSignal<string | null>, errorKey: string, params?: object): void {
    keySignal.set(errorKey); errorSignal.set(this.translocoService.translate(errorKey, params));
    this.cdr.markForCheck();
  }

  getProductLinkForItem(item: WooCommerceStoreCartItem): string {
    if (item.permalink) {
      try {
        const url = new URL(item.permalink);
        const pathname = url.pathname;
        const pathSegments = pathname.replace(/^\/+|\/+$/g, '').split('/');
        let slug: string | undefined = undefined;
        const productUrlBase = 'produkt';
        const productBaseIndex = pathSegments.indexOf(productUrlBase);

        if (productBaseIndex !== -1 && pathSegments.length > productBaseIndex + 1) {
          slug = pathSegments[productBaseIndex + 1];
        } else if (pathSegments.length > 0) {
          slug = pathSegments[pathSegments.length - 1];
        }
        if (slug && slug.length > 0) { return `/product/${slug}`; }
      } catch (e) {
        console.warn(`CheckoutDetailsPage: Could not parse permalink "${item.permalink}" for item "${item.name}". Error:`, e);
      }
    }
    const productIdForLink = item.parent_product_id || item.id;
    console.warn(`CheckoutDetailsPage: Could not determine slug for item "${item.name}" (ID: ${item.id}, ProductID for Link: ${productIdForLink}). Falling back to ID.`);
    return `/product/${productIdForLink}`;
  }

  getProductImageForItem(item: WooCommerceStoreCartItem): string | undefined {
    return item.images?.[0]?.thumbnail || item.images?.[0]?.src;
  }
}