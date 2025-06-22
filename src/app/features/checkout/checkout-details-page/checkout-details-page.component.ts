// /src/app/features/checkout/pages/checkout-details-page/checkout-details-page.component.ts
import {
  Component, OnInit, inject, signal, computed,
  ChangeDetectorRef, OnDestroy, AfterViewInit, ViewChild, ElementRef, NgZone,
  WritableSignal,
  PLATFORM_ID,
  DestroyRef,
  Injector
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidatorFn } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { firstValueFrom, of, Subscription, Observable } from 'rxjs';
import { startWith, switchMap, tap, filter, take } from 'rxjs/operators';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';

import { GoogleMapsModule } from '@angular/google-maps';

import {
  WoocommerceService,
  WooCommerceStoreCart,
  WooCommerceStoreAddress,
  WooCommerceStoreCartItem,
  StageCartPayload,
  WooCommerceCountry
} from '../../../core/services/woocommerce.service';
import { CartService } from '../../../shared/services/cart.service';
import { AuthService, WordPressUser } from '../../../shared/services/auth.service';
import { AccountService } from '../../account/services/account.service';
import { UserAddressesResponse } from '../../account/services/account.models';
import { FormatPricePipe } from '../../../shared/pipes/format-price.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { SafeHtmlPipe } from '../../../shared/pipes/safe-html.pipe';

@Component({
  selector: 'app-checkout-details-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    TranslocoModule,
    GoogleMapsModule,
    FormatPricePipe,
    LoadingSpinnerComponent,
    SafeHtmlPipe
  ],
  templateUrl: './checkout-details-page.component.html',
  styleUrls: ['./checkout-details-page.component.scss']
})
export class CheckoutDetailsPageComponent implements OnInit, AfterViewInit, OnDestroy {
  private fb = inject(FormBuilder);
  public cartService = inject(CartService);
  private authService = inject(AuthService);
  private accountService = inject(AccountService);
  private router = inject(Router);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);
  private platformId: object = inject(PLATFORM_ID);
  private destroyRef = inject(DestroyRef);
  private zone = inject(NgZone);
  private woocommerceService = inject(WoocommerceService);
  private injector = inject(Injector);

  billingForm!: FormGroup;
  shippingForm!: FormGroup;

  public availableCountries: WritableSignal<WooCommerceCountry[]> = signal([]);
  public isLoadingCountries = signal(true);
  
  @ViewChild('billingAddressStreetInput') billingAddressStreetInput!: ElementRef<HTMLInputElement>;
  @ViewChild('shippingAddressStreetInput') shippingAddressStreetInput!: ElementRef<HTMLInputElement>;
  private billingAutocomplete: google.maps.places.Autocomplete | undefined;
  private shippingAutocomplete: google.maps.places.Autocomplete | undefined;
  
  private subscriptions = new Subscription();

  showShippingForm = signal(false);
  private showShippingForm$!: Observable<boolean>;

  formSubmitted = signal(false);

  public isLoggedIn = computed(() => !!this.authService.getCurrentUserValue());

  isLoadingAddress = signal(false);
  isSavingAddress = signal(false);
  addressError = signal<string | null>(null);
  addressErrorKey = signal<string | null>(null);
  addressSuccess = signal<string | null>(null);
  
  isRedirecting = signal(false);
  
  constructor() {
    this.showShippingForm$ = toObservable(this.showShippingForm, { injector: this.injector });
  }

  ngOnInit(): void {
    this.setupForms();
    this.setupTitleObserver();
    if (isPlatformBrowser(this.platformId)) {
      this.loadCountries();
      this.loadInitialData().catch(err => { 
        console.error("Checkout ngOnInit: Error during initial data load:", err); 
        this.setError('checkoutDetailsPage.errors.loadDataFailed'); 
      });
    }
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.initAutocompletes();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.billingAutocomplete) google.maps.event.clearInstanceListeners(this.billingAutocomplete);
    if (this.shippingAutocomplete) google.maps.event.clearInstanceListeners(this.shippingAutocomplete);
  }
  
  private loadCountries(): void {
    this.isLoadingCountries.set(true);
    const sub = this.woocommerceService.getCountries().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (countries) => {
        this.availableCountries.set(countries);
        this.isLoadingCountries.set(false);
      },
      error: (err) => {
        console.error('Failed to load countries', err);
        this.isLoadingCountries.set(false);
      }
    });
    this.subscriptions.add(sub);
  }
  
  private initAutocompletes(): void {
    if (this.isLoadingCountries()) {
      const sub = toObservable(this.isLoadingCountries, { injector: this.injector }).pipe(
        filter(loading => !loading),
        take(1)
      ).subscribe(() => this.setupInitialAutocompletes());
      this.subscriptions.add(sub);
    } else {
      this.setupInitialAutocompletes();
    }
  }

  private setupInitialAutocompletes(): void {
    if (this.billingAddressStreetInput?.nativeElement) {
      this.setupAutocompleteForForm(this.billingForm, this.billingAddressStreetInput, 'billing');
    }
    
    const sub = this.showShippingForm$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(show => {
      setTimeout(() => {
        if (show && this.shippingAddressStreetInput?.nativeElement) {
          this.setupAutocompleteForForm(this.shippingForm, this.shippingAddressStreetInput, 'shipping');
        } else if (!show && this.shippingAutocomplete) {
          google.maps.event.clearInstanceListeners(this.shippingAutocomplete);
          this.shippingAutocomplete = undefined;
        }
      }, 0);
    });
    this.subscriptions.add(sub);
  }

  private setupAutocompleteForForm(form: FormGroup, inputElement: ElementRef<HTMLInputElement>, formType: 'billing' | 'shipping'): void {
    const countryControl = form.get('country');
    if (!countryControl) return;

    const setup = (countryCode: string) => {
      const autocompleteInstance = new google.maps.places.Autocomplete(inputElement.nativeElement, {
        types: ['address'],
        componentRestrictions: { country: countryCode },
        fields: ['address_components']
      });

      autocompleteInstance.addListener('place_changed', () => {
        this.zone.run(() => {
          const place = autocompleteInstance.getPlace();
          if (place?.address_components) {
            this.fillInAddress(form, place.address_components);
          }
        });
      });
      
      if (formType === 'billing') this.billingAutocomplete = autocompleteInstance;
      else this.shippingAutocomplete = autocompleteInstance;
    };
    
    setup(countryControl.value);
    const sub = countryControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(newCountryCode => {
      if (formType === 'billing' && this.billingAutocomplete) google.maps.event.clearInstanceListeners(this.billingAutocomplete);
      if (formType === 'shipping' && this.shippingAutocomplete) google.maps.event.clearInstanceListeners(this.shippingAutocomplete);
      setup(newCountryCode);
    });
    this.subscriptions.add(sub);
  }

  private fillInAddress(form: FormGroup, components: google.maps.GeocoderAddressComponent[]): void {
    const componentMap: { [key: string]: string } = {};
    for (const component of components) {
      const type = component.types[0];
      if (type) componentMap[type] = component.long_name;
    }
    
    const route = componentMap['route'] || '';
    const streetNumber = componentMap['street_number'] || '';
    let fullStreet = route;
    if (route && streetNumber) fullStreet = `${route} ${streetNumber}`;

    form.patchValue({
      address_1: fullStreet,
      city: componentMap['locality'] || componentMap['administrative_area_level_3'] || '',
      postcode: componentMap['postal_code'] || ''
    });

    form.get('city')?.updateValueAndValidity();
    form.get('postcode')?.updateValueAndValidity();
    form.get('address_1')?.updateValueAndValidity();
  }

  private setupTitleObserver(): void { 
    this.translocoService.langChanges$.pipe(
      takeUntilDestroyed(this.destroyRef),
      startWith(this.translocoService.getActiveLang()),
      switchMap(lang => this.translocoService.selectTranslate('checkoutDetailsPage.title', {}, lang)),
      tap(translatedPageTitle => { this.titleService.setTitle(translatedPageTitle); })
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
      country: ['DE', Validators.required], 
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
      country: ['DE'], 
      state: [''] 
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
    if (control) { 
      control.setValidators(validators); 
      control.updateValueAndValidity({ emitEvent: false }); 
    } 
  }
  
  private async loadInitialData(): Promise<void> {
    this.isLoadingAddress.set(true);
    if (this.cartService.isProcessing()) {
      await firstValueFrom(toObservable(this.cartService.isProcessing, { injector: this.injector }).pipe(filter(p => p === false), take(1)));
    }

    if (this.cartService.cartItemCount() === 0) {
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
        this.populateFormsWithUserData(null, loggedInUser);
      }
    }
    this.isLoadingAddress.set(false);
    this.cdr.markForCheck();
  }
  
  private populateFormsWithUserData(userAddresses: UserAddressesResponse | null, loggedInUser: WordPressUser): void { 
    const billingPayload: any = userAddresses ? userAddresses.billing : {}; 
    const shippingPayload: any = userAddresses ? userAddresses.shipping : {}; 
    billingPayload.email = billingPayload.email || loggedInUser.email; 
    billingPayload.first_name = billingPayload.first_name || loggedInUser.firstName; 
    billingPayload.last_name = billingPayload.last_name || loggedInUser.lastName; 
    this.billingForm.patchValue(this.mapAddressToForm(billingPayload), { emitEvent: false }); 
    const isDifferent = this.isShippingDifferent(billingPayload, shippingPayload); 
    this.showShippingForm.set(isDifferent); 
    this.updateShippingFormValidators(isDifferent); 
    if (isDifferent) { this.shippingForm.patchValue(this.mapAddressToForm(shippingPayload), { emitEvent: false }); } 
  }
  
  private mapAddressToForm(address: any): Partial<any> { 
    const formValues: any = {}; 
    Object.keys(this.billingForm.controls).forEach(key => { if (address.hasOwnProperty(key)) { formValues[key] = address[key]; } }); 
    if (!formValues.country) { formValues.country = 'DE'; } 
    return formValues; 
  }
  
  private isShippingDifferent(billing: any, shipping: any): boolean { 
    if (!shipping || Object.keys(shipping).length === 0 || Object.values(shipping).every(v => v === '')) return false;
    const relevantKeys = ['first_name', 'last_name', 'company', 'address_1', 'address_2', 'city', 'postcode', 'country', 'state']; 
    for (const key of relevantKeys) { if ((billing[key] || '') !== (shipping[key] || '')) return true; } 
    return false; 
  }
  
  get bf() { return this.billingForm.controls; }
  get sf() { return this.shippingForm.controls; }
  
  public getProductImage(item: WooCommerceStoreCartItem): string | undefined {
    return item.images?.[0]?.thumbnail;
  }
  
  async handleAddressFormSubmit(): Promise<void> {
    this.clearMessages();
    this.formSubmitted.set(true);
    
    if (!this.validateForms()) {
      this.setError('checkoutDetailsPage.errors.fillRequiredFields');
      throw new Error("Form validation failed");
    }

    if (!this.isLoggedIn()) {
      return;
    }

    this.isSavingAddress.set(true);

    try {
      const billing = this.billingForm.getRawValue();
      let shipping = this.showShippingForm() ? this.shippingForm.getRawValue() : {};
      if (!this.showShippingForm()) {
          Object.keys(this.shippingForm.controls).forEach(key => { shipping[key] = '' });
          shipping.country = 'DE';
      }
      await firstValueFrom(this.accountService.updateUserAddresses({ billing, shipping }));
      this.addressSuccess.set(this.translocoService.translate('checkoutDetailsPage.addressSaveSuccess'));
    } catch (error: any) {
      this.setError('checkoutDetailsPage.errors.addressSaveFailed', { details: error.message || '' });
      throw error;
    } finally {
      this.isSavingAddress.set(false);
    }
  }

  async proceedToPayment(): Promise<void> {
    this.clearMessages();
    this.formSubmitted.set(true);

    if (!this.validateForms()) {
      this.setError('checkoutDetailsPage.errors.fillRequiredFields');
      return;
    }

    if (this.isLoggedIn()) {
      try {
        await this.handleAddressFormSubmit();
      } catch (error) {
        return;
      }
    }

    this.isRedirecting.set(true);

    try {
      const currentCart = this.cartService.cart();
      if (!currentCart || this.cartService.cartItemCount() === 0) {
        throw new Error("Cannot proceed with an empty cart.");
      }
      
      const billing_address = this.billingForm.getRawValue();
      const shipping_address = this.showShippingForm() ? this.shippingForm.getRawValue() : billing_address;
      const couponCodes = currentCart.coupons.map(c => c.code).join(',');

      const payload: StageCartPayload = {
        items: currentCart.items.map(item => ({
          product_id: item.parent_product_id || item.id,
          quantity: item.quantity,
          variation_id: item.id !== (item.parent_product_id || item.id) ? item.id : undefined
        })),
        billing_address: billing_address,
        shipping_address: shipping_address,
        coupon_code: couponCodes || undefined
      };
      
      const stageResponse = await firstValueFrom(this.woocommerceService.stageCartForPopulation(payload));
      
      if (stageResponse?.success && stageResponse.token) {
        const currentUser = this.authService.getCurrentUserValue();
        const jwt = currentUser ? currentUser.jwt : null;
        
        // HIER IST DIE FINALE ÄNDERUNG: Der JWT wird jetzt übergeben.
        window.location.href = this.woocommerceService.getCheckoutUrl(stageResponse.token, jwt);
        
      } else {
        throw new Error(stageResponse.message || 'Vorbereitung des Warenkorbs fehlgeschlagen.');
      }

    } catch (error: any) {
      console.error('[Checkout] Proceed to payment failed:', error);
      this.setError('checkoutDetailsPage.errors.checkoutInitFailed', { message: error.message });
      this.isRedirecting.set(false);
    }
  }
  
  private validateForms(): boolean { 
    this.billingForm.markAllAsTouched(); 
    if (this.showShippingForm()) { this.shippingForm.markAllAsTouched(); }
    return this.billingForm.valid && (!this.showShippingForm() || this.shippingForm.valid); 
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
}