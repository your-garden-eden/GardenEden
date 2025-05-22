// /src/app/features/checkout/checkout-details-page/checkout-details-page.component.ts
import {
  Component, OnInit, inject, signal, computed, effect, untracked,
  ChangeDetectorRef, OnDestroy, AfterViewInit, ViewChild, ElementRef, NgZone,
  WritableSignal, PLATFORM_ID, DestroyRef
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
} from '../../../core/services/woocommerce.service';
import { CartService } from '../../../shared/services/cart.service';
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

  orderSummary = computed(() => {
    const cart = this.cartService.cart();
    if (!cart) return null;

    let determinedShippingRateDisplay: string | null = null;
    const currentDisplayableShipping = this.displayableShippingInfoObject();

    if (currentDisplayableShipping) {
        const currencySymbol = currentDisplayableShipping.currencyCode === 'EUR' ? '€' : currentDisplayableShipping.currencyCode;
        determinedShippingRateDisplay = `${currentDisplayableShipping.packageName} (${currentDisplayableShipping.isFree ? this.translocoService.translate('general.free') : (currentDisplayableShipping.price + ' ' + currencySymbol) })`;
    } else if (cart.shipping_rates && cart.shipping_rates.length > 0) {
        for (const pkg of cart.shipping_rates) {
            const foundRate = pkg.shipping_rates?.find(r => r.selected);
            if (foundRate) {
                const currencySymbol = foundRate.currency_symbol || (cart.totals.currency_symbol || '€');
                determinedShippingRateDisplay = `${foundRate.name}: ${parseFloat(foundRate.price) === 0 ? this.translocoService.translate('general.free') : (foundRate.price + ' ' + currencySymbol)}`;
                break;
            }
        }
    } else if (cart.needs_shipping === false) {
        determinedShippingRateDisplay = this.translocoService.translate('checkoutDetailsPage.shipping.notNeeded');
    }

    return {
      items: cart.items,
      itemCount: cart.items_count,
      totals: cart.totals,
      selectedShippingRateDisplay: determinedShippingRateDisplay
    };
  });

  constructor() {
    effect(() => {
      const serviceCartError = untracked(() => this.cartService.error());
      const currentAddressError = untracked(() => this.addressError());
      const currentShippingError = untracked(() => this.shippingError());
      const currentAddressErrorKeyVal = untracked(() => this.addressErrorKey());

      if (serviceCartError && !currentAddressError && !currentShippingError) {
        this.setError(this.addressErrorKey, 'checkoutDetailsPage.errorGlobalCart', { serviceErrorMsg: serviceCartError });
      }
      else if (!serviceCartError && currentAddressErrorKeyVal === 'checkoutDetailsPage.errorGlobalCart') {
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
                 if (showShipping && !this.shippingAutocomplete) {
                    this.initializeShippingAutocomplete();
                }
            }
            if (!showShipping && this.shippingAutocompleteListener) {
                this.destroyShippingAutocompleteListener();
            }
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
            this.setError(this.addressErrorKey, 'checkoutDetailsPage.errors.loadDataFailed');
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
        if (currentAddressErrKeyVal) {
          this.addressError.set(this.translocoService.translate(currentAddressErrKeyVal));
        }
        const currentShippingErrKeyVal = untracked(() => this.shippingErrorKey());
        if (currentShippingErrKeyVal) {
          this.shippingError.set(this.translocoService.translate(currentShippingErrKeyVal));
        }
      })
    ).subscribe(() => this.cdr.detectChanges());
  }

  private setupForms(): void {
    this.billingForm = this.fb.group({
      first_name: ['', Validators.required],
      last_name: ['', Validators.required],
      company: [''],
      address_1: ['', Validators.required],
      address_2: [''],
      city: ['', Validators.required],
      postcode: ['', [Validators.required, Validators.pattern(/^\d{5}$/)]],
      country: [{ value: 'DE', disabled: true }, Validators.required],
      state: [''],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.required]
    });

    this.shippingForm = this.fb.group({
      first_name: [''],
      last_name: [''],
      company: [''],
      address_1: [''],
      address_2: [''],
      city: [''],
      postcode: ['', Validators.pattern(/^\d{5}$/)],
      country: [{ value: 'DE', disabled: true }],
      state: ['']
    });
    this.updateShippingFormValidators(this.showShippingForm());
  }

  // KORRIGIERT: Diese Methode wird nun vom Template aufgerufen
  public handleShowShippingChange(event: Event): void {
    const inputElement = event.target as HTMLInputElement | null;
    if (inputElement) {
      const isChecked = inputElement.checked;
      this.showShippingForm.set(isChecked);
      this.updateShippingFormValidators(isChecked);
    }
  }
  // Die Methode onShowShippingFormChange(checked: boolean) ist jetzt nicht mehr direkt vom Template aufgerufen,
  // aber ihre Logik ist in handleShowShippingChange und updateShippingFormValidators.
  // Du könntest onShowShippingFormChange umbenennen/entfernen oder die Logik hierher verschieben,
  // falls du die Trennung von Event-Handling und State-Änderung beibehalten willst.
  // Fürs Erste habe ich handleShowShippingChange hinzugefügt.

  private updateShippingFormValidators(show: boolean): void {
    const requiredIfShown: ValidatorFn[] = show ? [Validators.required] : [];
    const postcodeValidators: ValidatorFn[] = show
        ? [Validators.required, Validators.pattern(/^\d{5}$/)]
        : [Validators.pattern(/^\d{5}$/)];
    if (!show) {
        this.shippingForm.reset({ country: 'DE' }, { emitEvent: false });
    }

    this.setFormControlValidators(this.shippingForm, 'first_name', requiredIfShown);
    this.setFormControlValidators(this.shippingForm, 'last_name', requiredIfShown);
    this.setFormControlValidators(this.shippingForm, 'address_1', requiredIfShown);
    this.setFormControlValidators(this.shippingForm, 'city', requiredIfShown);
    this.setFormControlValidators(this.shippingForm, 'postcode', postcodeValidators);
    this.setFormControlValidators(this.shippingForm, 'country', show ? [Validators.required] : []);
  }

  private setFormControlValidators(form: FormGroup, controlName: string, validators: ValidatorFn | ValidatorFn[] | null): void {
    const control = form.get(controlName);
    if (control) {
      control.setValidators(validators);
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  private async loadInitialDataFromCartAndFetchShipping(): Promise<void> {
    this.isLoadingAddress.set(true);
    let currentCart = this.cartService.cart();

    if (!currentCart && this.cartService.isLoading()) {
      await firstValueFrom(
        toObservable(this.cartService.isLoading).pipe(
          filter(isLoading => !isLoading), take(1), takeUntilDestroyed(this.destroyRef)
        )
      );
      currentCart = this.cartService.cart();
    }
    
    if (!currentCart) {
        if (isPlatformBrowser(this.platformId)) {
            await this.cartService.loadInitialCartFromServer();
            currentCart = this.cartService.cart();
            if (!currentCart || this.cartService.cartItemCount() === 0) {
                this.router.navigate(['/warenkorb']);
                this.isLoadingAddress.set(false);
                return;
            }
        } else { this.isLoadingAddress.set(false); return; }
    } else if (this.cartService.cartItemCount() === 0) {
        this.router.navigate(['/warenkorb']);
        this.isLoadingAddress.set(false);
        return;
    }

    if (currentCart.billing_address && Object.keys(currentCart.billing_address).length > 0) {
      this.billingForm.patchValue(this.mapAddressToForm(currentCart.billing_address), { emitEvent: false });
    }
    
    if (currentCart.shipping_address && Object.keys(currentCart.shipping_address).filter(k => !!currentCart!.shipping_address[k as keyof WooCommerceStoreAddress]).length > 0) {
      this.showShippingForm.set(this.isShippingDifferent(currentCart.billing_address, currentCart.shipping_address));
      if (this.showShippingForm()) {
        this.shippingForm.patchValue(this.mapAddressToForm(currentCart.shipping_address), { emitEvent: false });
      }
    } else {
      this.showShippingForm.set(false);
    }
    this.updateShippingFormValidators(this.showShippingForm());

    if (currentCart.needs_shipping) {
        const addressToUseForShipping = this.showShippingForm() ? this.shippingForm.getRawValue() : this.billingForm.getRawValue();
        const postcodeControl = this.showShippingForm() ? this.shippingForm.get('postcode') : this.billingForm.get('postcode');

        if (addressToUseForShipping.country && addressToUseForShipping.postcode && postcodeControl?.valid) {
            await this.processShippingForEnteredAddress(currentCart);
        } else {
          this.shippingInfo.set(null);
        }
    } else {
        this.shippingInfo.set('not_needed');
    }
    this.isLoadingAddress.set(false);
    this.cdr.markForCheck();
  }

  private mapAddressToForm(address: WooCommerceStoreAddress): Partial<WooCommerceStoreAddress> {
    const formValues: any = {};
    const formToUse = this.billingForm; 

    Object.keys(formToUse.controls).forEach(key => {
        if (address.hasOwnProperty(key)) {
            formValues[key] = (address as any)[key];
        }
    });
    formValues.country = address.country || 'DE';
    formValues.state = address.state || '';
    return formValues;
  }

  private isShippingDifferent(billing: WooCommerceStoreAddress | null, shipping: WooCommerceStoreAddress | null): boolean {
    if (!billing || !shipping) {
        return !!shipping;
    }
    const b = this.mapAddressToForm(billing);
    const s = this.mapAddressToForm(shipping);
    const relevantKeys: (keyof WooCommerceStoreAddress)[] = ['first_name', 'last_name', 'company', 'address_1', 'address_2', 'city', 'postcode', 'country', 'state'];
    for (const key of relevantKeys) {
        if ((b[key] || '') !== (s[key] || '')) {
            return true;
        }
    }
    return false;
  }

  get bf() { return this.billingForm.controls; }
  get sf() { return this.shippingForm.controls; }

  private async initializeBillingAutocomplete(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !this.billingAddressStreetInput?.nativeElement || typeof google === 'undefined' || !google?.maps?.places?.Autocomplete) {
      console.warn('Google Maps Autocomplete for billing not initialized (Platform/Element/API issue).');
      return;
    }
    this.ngZone.runOutsideAngular(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (this.billingAddressStreetInput.nativeElement) {
        this.billingAutocomplete = new google.maps.places.Autocomplete(this.billingAddressStreetInput.nativeElement, this.autocompleteOptions);
        if (this.billingAutocomplete) {
          this.billingAutocompleteListener = this.billingAutocomplete.addListener('place_changed', () => {
              this.ngZone.run(() => {
                  if (this.billingAutocomplete) {
                      this.onPlaceChanged(this.billingAutocomplete, this.billingForm);
                  }
              });
          });
        } else {
          console.error("Failed to initialize billing Autocomplete object.");
        }
      }
    });
  }

  private async initializeShippingAutocomplete(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !this.shippingAddressStreetInput?.nativeElement || typeof google === 'undefined' || !google?.maps?.places?.Autocomplete) {
      console.warn('Google Maps Autocomplete for shipping not initialized (Platform/Element/API issue).');
      return;
    }
    this.ngZone.runOutsideAngular(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (this.shippingAddressStreetInput.nativeElement) {
        this.shippingAutocomplete = new google.maps.places.Autocomplete(this.shippingAddressStreetInput.nativeElement, this.autocompleteOptions);
        if (this.shippingAutocomplete) {
          this.shippingAutocompleteListener = this.shippingAutocomplete.addListener('place_changed', () => {
              this.ngZone.run(() => {
                  if (this.shippingAutocomplete) {
                      this.onPlaceChanged(this.shippingAutocomplete, this.shippingForm);
                  }
              });
          });
        } else {
          console.error("Failed to initialize shipping Autocomplete object.");
        }
      }
    });
  }

  private onPlaceChanged(autocomplete: google.maps.places.Autocomplete, form: FormGroup): void {
    const place = autocomplete.getPlace();
    if (!place || !place.address_components) {
        console.warn('Autocomplete: Place or address components are undefined.');
        form.get('address_1')?.setErrors({'manualEntryRequired': true});
        return;
    }

    const addressDetails: Partial<WooCommerceStoreAddress> = { country: 'DE', address_1: '', city: '', postcode: '', state: '' };
    let streetNumber = '';
    let route = '';

    for (const component of place.address_components) {
        const type = component.types[0];
        switch (type) {
            case 'street_number': streetNumber = component.long_name; break;
            case 'route': route = component.long_name; break;
            case 'locality': addressDetails.city = component.long_name; break;
            case 'postal_code': addressDetails.postcode = component.long_name; break;
            case 'administrative_area_level_1': addressDetails.state = component.long_name; break;
            case 'country': addressDetails.country = component.short_name; break;
        }
    }
    addressDetails.address_1 = `${route} ${streetNumber}`.trim();

    Object.keys(addressDetails).forEach(key => {
        if (form.get(key as string)) {
            form.get(key as string)?.setValue((addressDetails as any)[key], { emitEvent: false });
        }
    });
    if (!addressDetails.address_1 && form.get('address_1')) {
        form.get('address_1')?.setValue(place.formatted_address || '', { emitEvent: false });
    }

    this.cdr.markForCheck();
    if (form.valid && form.get('country')?.value && form.get('postcode')?.value && form.get('postcode')?.valid) {
        this.processShippingForEnteredAddress(this.cartService.cart()).catch(err => console.error("Error processing shipping after autocomplete:", err));
    }
  }

  private destroyBillingAutocompleteListener(): void {
    if (this.billingAutocompleteListener) google.maps.event.removeListener(this.billingAutocompleteListener);
    if (this.billingAutocomplete && this.billingAddressStreetInput?.nativeElement) {
        google.maps.event.clearInstanceListeners(this.billingAddressStreetInput.nativeElement);
    }
    this.billingAutocompleteListener = undefined;
    this.billingAutocomplete = undefined;
  }
  private destroyShippingAutocompleteListener(): void {
     if (this.shippingAutocompleteListener) google.maps.event.removeListener(this.shippingAutocompleteListener);
     if (this.shippingAutocomplete && this.shippingAddressStreetInput?.nativeElement) {
        google.maps.event.clearInstanceListeners(this.shippingAddressStreetInput.nativeElement);
     }
     this.shippingAutocompleteListener = undefined;
     this.shippingAutocomplete = undefined;
  }

  async handleAddressFormSubmit(): Promise<void> {
    this.formSubmitted.set(true);
    this.clearErrors();

    if (!this.validateForms()) {
      this.focusFirstInvalidField(this.billingForm);
      if (this.showShippingForm()) this.focusFirstInvalidField(this.shippingForm);
      this.setError(this.addressErrorKey, 'checkoutDetailsPage.errors.fillRequiredFields');
      return;
    }

    this.isLoadingAddress.set(true);
    const customerData = this.prepareCustomerData();

    try {
      const updatedCart = await firstValueFrom(this.woocommerceService.updateCartCustomer(customerData));
      if (updatedCart) {
        this.cartService.cart.set(updatedCart);
        if(updatedCart.billing_address) this.billingForm.patchValue(this.mapAddressToForm(updatedCart.billing_address), { emitEvent: false });
        if(updatedCart.shipping_address && this.showShippingForm()) this.shippingForm.patchValue(this.mapAddressToForm(updatedCart.shipping_address), { emitEvent: false });

        if (updatedCart.needs_shipping) {
          await this.processShippingForEnteredAddress(updatedCart);
        } else {
          this.shippingInfo.set('not_needed');
        }
      } else {
        this.setError(this.addressErrorKey, 'checkoutDetailsPage.errors.addressSaveFailed', { details: 'No cart data returned after update.' });
      }
    } catch (error: any) {
      console.error('Checkout: Error saving addresses:', error);
      const errorDetail = error.error?.message || error.message || 'Unknown server error';
      this.setError(this.addressErrorKey, 'checkoutDetailsPage.errors.addressSaveFailed', { details: errorDetail });
    } finally {
      this.isLoadingAddress.set(false);
    }
  }

  private validateForms(): boolean {
    this.billingForm.markAllAsTouched();
    let isValid = this.billingForm.valid;
    if (this.showShippingForm()) {
      this.shippingForm.markAllAsTouched();
      isValid = isValid && this.shippingForm.valid;
    }
    return isValid;
  }

  private prepareCustomerData(): { billing_address: WooCommerceStoreAddress, shipping_address: WooCommerceStoreAddress } {
    const billing = this.billingForm.getRawValue() as WooCommerceStoreAddress;
    let shipping = billing;
    if (this.showShippingForm() && (this.shippingForm.dirty || this.shippingForm.touched || Object.values(this.shippingForm.value).some(v => !!v))) {
      shipping = this.shippingForm.getRawValue() as WooCommerceStoreAddress;
    }
    return { billing_address: billing, shipping_address: shipping };
  }

  private async processShippingForEnteredAddress(cartForShipping?: WooCommerceStoreCart | null): Promise<void> {
    const cart = cartForShipping || this.cartService.cart();
    if (!cart || !cart.needs_shipping) {
      this.shippingInfo.set(cart?.needs_shipping === false ? 'not_needed' : null);
      if (cart?.needs_shipping === false) this.clearShippingError();
      return;
    }
    this.isLoadingShipping.set(true);
    this.clearShippingError();
    try {
      const shippingPackages = await firstValueFrom(this.woocommerceService.getCartShippingRates());
      if (shippingPackages && shippingPackages.length > 0 && shippingPackages[0].shipping_rates && shippingPackages[0].shipping_rates.length > 0) {
        const firstPackage = shippingPackages[0];
        const rateToSelect = firstPackage.shipping_rates.find(rate => parseFloat(rate.price) === 0) || firstPackage.shipping_rates[0];

        if (rateToSelect) {
          await this.selectShippingRate(
            firstPackage.package_id,
            rateToSelect.rate_id,
            rateToSelect.name,
            rateToSelect.price,
            rateToSelect.currency_code || cart.totals.currency_code
          );
        } else {
          this.setShippingError(this.shippingErrorKey, 'checkoutDetailsPage.shipping.noRatesFound');
          this.shippingInfo.set('error');
        }
      } else {
        this.setShippingError(this.shippingErrorKey, 'checkoutDetailsPage.shipping.noRatesFound');
        this.shippingInfo.set('error');
      }
    } catch (error: any) {
      console.error('Checkout: Error fetching/processing shipping rates:', error);
      const errorDetail = error.error?.message || error.message || 'Unknown error';
      this.setShippingError(this.shippingErrorKey, 'checkoutDetailsPage.shipping.errorDefault', { details: errorDetail });
      this.shippingInfo.set('error');
    } finally {
      this.isLoadingShipping.set(false);
    }
  }

  private async selectShippingRate(packageId: string, rateId: string, rateName: string, ratePrice: string, currencyCode: string): Promise<void> {
    try {
      const updatedCart = await firstValueFrom(this.woocommerceService.selectCartShippingRate(packageId, rateId));
      if (updatedCart) {
        this.cartService.cart.set(updatedCart);
        this.shippingInfo.set({ rateId, packageName: rateName, price: ratePrice, currencyCode });
        this.clearShippingError();
      } else {
        throw new Error('Cart not updated after selecting shipping rate.');
      }
    } catch (error: any) {
      console.error('Checkout: Error selecting shipping rate:', error);
      const errorDetail = error.error?.message || error.message || 'Unknown error';
      this.setShippingError(this.shippingErrorKey, 'checkoutDetailsPage.shipping.selectError', { details: errorDetail });
      this.shippingInfo.set('error');
    }
  }

  proceedToPayment(): void {
    this.formSubmitted.set(true);
    if (!this.validateForms()) {
      this.focusFirstInvalidField(this.billingForm);
      if (this.showShippingForm()) this.focusFirstInvalidField(this.shippingForm);
      this.setError(this.addressErrorKey, 'checkoutDetailsPage.errors.fillRequiredFields');
      return;
    }

    const cart = this.cartService.cart();
    if (cart && cart.needs_shipping && (this.shippingInfo() === null || this.shippingInfo() === 'error')) {
        this.setShippingError(this.shippingErrorKey, 'checkoutDetailsPage.errors.selectShipping');
        const formToFocus = (this.showShippingForm() && this.shippingForm.invalid) ? this.shippingForm : this.billingForm;
        this.focusFirstInvalidField(formToFocus);
        return;
    }

    this.clearErrors();
    this.isRedirecting.set(true);

    const checkoutUrl = this.woocommerceService.getCheckoutUrl();
    if (isPlatformBrowser(this.platformId)) {
      window.location.href = checkoutUrl;
    } else {
      this.isRedirecting.set(false);
    }
  }

  private focusFirstInvalidField(form: FormGroup | AbstractControl | null): void {
    if (!form || !(form instanceof FormGroup)) return;

    for (const key of Object.keys(form.controls)) {
        const control = form.controls[key];
        if (control.invalid) {
            const el = document.getElementById(`${form === this.billingForm ? 'billing' : 'shipping'}_${key}`);
            if (el) {
                this.ngZone.runOutsideAngular(() => {
                    setTimeout(() => el.focus(), 0);
                });
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }
    }
  }

  private clearErrors(): void {
    this.addressError.set(null);
    this.addressErrorKey.set(null);
    this.clearShippingError();
  }
  private clearShippingError(): void {
    this.shippingError.set(null);
    this.shippingErrorKey.set(null);
  }

  private setError(keySignal: WritableSignal<string | null>, errorKey: string, params?: object): void {
    keySignal.set(errorKey);
    this.addressError.set(this.translocoService.translate(errorKey, params));
    this.cdr.markForCheck();
  }
  private setShippingError(keySignal: WritableSignal<string | null>, errorKey: string, params?: object): void {
    keySignal.set(errorKey);
    this.shippingError.set(this.translocoService.translate(errorKey, params));
    this.cdr.markForCheck();
  }
}