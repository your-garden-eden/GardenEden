// /src/app/features/account/profile-page/profile-page.component.ts (Korrigiert)

import { Component, OnInit, inject, signal, OnDestroy, ChangeDetectorRef, effect, ViewChild, ElementRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth.service';
import {
  WooCommerceOrder,
  UserAddressesResponse,
  WpUserMeResponse
} from '../services/account.models';
import { AccountService } from '../services/account.service';
import { WoocommerceService } from '../../../core/services/woocommerce.service';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription, forkJoin } from 'rxjs';
import { startWith, switchMap, tap, finalize, take } from 'rxjs/operators';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { FormatPricePipe } from '../../../shared/pipes/format-price.pipe';

// Validator für Passwort-Übereinstimmung
export function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('newPassword');
  const confirmPassword = control.get('confirmNewPassword');
  if (password && confirmPassword && password.value !== confirmPassword.value) {
    confirmPassword.setErrors({ passwordsMismatch: true });
    return { passwordsMismatch: true };
  } else {
    if (confirmPassword?.hasError('passwordsMismatch')) {
        confirmPassword.setErrors(null);
    }
  }
  return null;
}

type ProfileSection = 'addresses' | 'orders' | 'changePassword' | 'orderDetails';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslocoModule, LoadingSpinnerComponent, FormatPricePipe],
  templateUrl: './profile-page.component.html',
  styleUrls: ['./profile-page.component.scss']
})
export class ProfilePageComponent implements OnInit, OnDestroy {
  // --- Services & Injections ---
  private fb = inject(FormBuilder);
  public authService = inject(AuthService);
  private accountService = inject(AccountService);
  private woocommerceService = inject(WoocommerceService);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private ngZone = inject(NgZone);

  // --- UI State ---
  isLoading = signal(true);
  isSaving = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  isEditing = signal(false);
  useBillingForShipping = signal(true);
  formSubmitted = signal(false);
  passwordFormSubmitted = signal(false);
  passwordVisibility = signal({ current: false, new: false, confirm: false });

  // --- Forms ---
  profileForm!: FormGroup;
  changePasswordForm!: FormGroup;

  // --- Data ---
  availableCountries = signal<{ code: string; name: string; }[]>([]);
  wpUser = signal<WpUserMeResponse | null>(null);
  orders = signal<WooCommerceOrder[]>([]);
  selectedOrder = signal<WooCommerceOrder | null>(null);
  orderIsLoading = signal(false);
  totalOrders = signal(0);
  totalPages = signal(0);
  currentPage = signal(1);
  ordersPerPage = signal(5);
  activeSection = signal<ProfileSection>('addresses');
  private subscriptions = new Subscription();
  public currentUserWordPressId: number | null = null;
  private billingAutocomplete: google.maps.places.Autocomplete | undefined;
  private shippingAutocomplete: google.maps.places.Autocomplete | undefined;

  @ViewChild('billingAddress1') set billingAddressElement(element: ElementRef<HTMLInputElement> | undefined) {
    if (element && this.isEditing()) { this.initializeBillingAutocomplete(element.nativeElement); }
  }
  @ViewChild('shippingAddress1') set shippingAddressElement(element: ElementRef<HTMLInputElement> | undefined) {
    if (element && this.isEditing() && !this.useBillingForShipping()) { this.initializeShippingAutocomplete(element.nativeElement); }
  }

  constructor() {
    effect(() => {
      if (!this.isEditing() && this.profileForm?.dirty) {
        this.formSubmitted.set(false);
        if (this.currentUserWordPressId) { this.loadInitialProfileData(this.currentUserWordPressId); }
      }
    });
    effect(() => {
      this.updateShippingFormValidators(!this.useBillingForShipping());
    });
  }

  ngOnInit(): void {
    this.setupTitleAndTranslations();
    this.initializeForms();
    this.loadCountries();
    const authSub = this.authService.currentWordPressUser$.pipe(take(1)).subscribe({
      next: (user) => {
        if (user?.id) {
          this.currentUserWordPressId = user.id;
          this.loadInitialProfileData(user.id);
        } else {
          this.handleNotLoggedIn();
        }
      },
      error: () => this.handleNotLoggedIn()
    });
    this.subscriptions.add(authSub);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.billingAutocomplete) { google.maps.event.clearInstanceListeners(this.billingAutocomplete); }
    if (this.shippingAutocomplete) { google.maps.event.clearInstanceListeners(this.shippingAutocomplete); }
  }

  private initializeForms(): void {
    this.profileForm = this.fb.group({
      first_name: ['', Validators.required], last_name: ['', Validators.required],
      email: [{ value: '', disabled: true }], billing_company: [''],
      billing_address_1: ['', Validators.required], billing_address_2: [''],
      billing_city: ['', Validators.required], billing_postcode: ['', Validators.required],
      billing_country: ['DE', Validators.required], billing_phone: ['', Validators.required],
      shipping_first_name: [''], shipping_last_name: [''], shipping_company: [''],
      shipping_address_1: [''], shipping_address_2: [''], shipping_city: [''],
      shipping_postcode: [''], shipping_country: ['DE'],
    });
    this.changePasswordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmNewPassword: ['', Validators.required]
    }, { validators: passwordsMatchValidator });
  }

  private loadCountries(): void {
    this.woocommerceService.getCountries().subscribe(countries => this.availableCountries.set(countries));
  }

  private loadInitialProfileData(userId: number): void {
    this.isLoading.set(true);
    this.clearMessages();
    forkJoin({
      wpUser: this.accountService.getWpUserDetails(),
      addresses: this.accountService.getUserAddresses()
    }).pipe(
      finalize(() => { this.isLoading.set(false); this.cdr.markForCheck(); })
    ).subscribe({
      next: ({ wpUser, addresses }) => {
        this.wpUser.set(wpUser);
        this.populateForm(wpUser, addresses);
        this.profileForm.markAsPristine();
      },
      error: err => { this.errorMessage.set(this.translocoService.translate('profilePage.errors.loadProfileError')); }
    });
  }

  private populateForm(wpUser: WpUserMeResponse, addresses: UserAddressesResponse | null): void {
    this.profileForm.patchValue({
      first_name: wpUser.first_name, last_name: wpUser.last_name, email: wpUser.email,
      billing_company: addresses?.billing.company ?? '', billing_address_1: addresses?.billing.address_1 ?? '',
      billing_address_2: addresses?.billing.address_2 ?? '', billing_city: addresses?.billing.city ?? '',
      billing_postcode: addresses?.billing.postcode ?? '', billing_country: addresses?.billing.country || 'DE',
      billing_phone: addresses?.billing.phone ?? '',
    });
    const hasDifferentShipping = addresses?.shipping && addresses.shipping.address_1 &&
      (addresses.billing.address_1 !== addresses.shipping.address_1 || addresses.billing.postcode !== addresses.shipping.postcode);
    this.useBillingForShipping.set(!hasDifferentShipping);
    if (hasDifferentShipping) {
        this.profileForm.patchValue({
            shipping_first_name: addresses.shipping.first_name ?? '', shipping_last_name: addresses.shipping.last_name ?? '',
            shipping_company: addresses.shipping.company ?? '', shipping_address_1: addresses.shipping.address_1 ?? '',
            shipping_address_2: addresses.shipping.address_2 ?? '', shipping_city: addresses.shipping.city ?? '',
            shipping_postcode: addresses.shipping.postcode ?? '', shipping_country: addresses.shipping.country || 'DE',
        });
    } else {
        this.resetShippingForm();
    }
  }
  
  private initializeBillingAutocomplete(element: HTMLInputElement) {
    if (typeof google === 'undefined' || this.billingAutocomplete) return;
    const options = { componentRestrictions: { country: this.availableCountries().map(c => c.code) }, fields: ["address_components"], types: ["address"] };
    this.billingAutocomplete = new google.maps.places.Autocomplete(element, options);
    this.billingAutocomplete.addListener("place_changed", () => {
      this.ngZone.run(() => { this.fillInAddress(this.billingAutocomplete?.getPlace(), 'billing'); });
    });
  }

  private initializeShippingAutocomplete(element: HTMLInputElement) {
    if (typeof google === 'undefined' || this.shippingAutocomplete) return;
    const options = { componentRestrictions: { country: this.availableCountries().map(c => c.code) }, fields: ["address_components"], types: ["address"] };
    this.shippingAutocomplete = new google.maps.places.Autocomplete(element, options);
    this.shippingAutocomplete.addListener("place_changed", () => {
      this.ngZone.run(() => { this.fillInAddress(this.shippingAutocomplete?.getPlace(), 'shipping'); });
    });
  }
  
  private fillInAddress(place: google.maps.places.PlaceResult | undefined, type: 'billing' | 'shipping') {
    if (!place?.address_components) return;
    let street = '', street_number = '', postcode = '', city = '';
    for (const component of place.address_components) {
      const componentType = component.types[0];
      switch (componentType) {
        case "street_number": street_number = component.long_name; break;
        case "route": street = component.long_name; break;
        case "postal_code": postcode = component.long_name; break;
        case "locality": city = component.long_name; break;
      }
    }
    const prefix = `${type}_`;
    this.profileForm.patchValue({
      [`${prefix}address_1`]: `${street} ${street_number}`.trim(),
      [`${prefix}postcode`]: postcode,
      [`${prefix}city`]: city,
    });
    this.cdr.detectChanges();
  }

  onSaveProfile(): void {
    this.formSubmitted.set(true); this.markAllAsTouched(this.profileForm);
    if (this.profileForm.invalid) { this.errorMessage.set(this.translocoService.translate('profilePage.errors.formInvalid')); return; }
    this.isSaving.set(true); this.clearMessages();
    const formValue = this.profileForm.getRawValue();
    const billing = {
        first_name: formValue.first_name, last_name: formValue.last_name, company: formValue.billing_company,
        address_1: formValue.billing_address_1, address_2: formValue.billing_address_2,
        city: formValue.billing_city, postcode: formValue.billing_postcode, country: formValue.billing_country,
        state: '', email: formValue.email, phone: formValue.billing_phone,
    };
    const shipping = this.useBillingForShipping() ? { ...billing, phone: '' } : {
        first_name: formValue.shipping_first_name, last_name: formValue.shipping_last_name, company: formValue.shipping_company,
        address_1: formValue.shipping_address_1, address_2: formValue.shipping_address_2,
        city: formValue.shipping_city, postcode: formValue.shipping_postcode, country: formValue.shipping_country,
        state: '',
    };
    const payload: UserAddressesResponse = { billing, shipping };
    this.accountService.updateUserAddresses(payload).pipe(
      finalize(() => { this.isSaving.set(false); this.isEditing.set(false); this.formSubmitted.set(false); this.cdr.markForCheck(); })
    ).subscribe({
      next: () => {
        this.successMessage.set(this.translocoService.translate('profilePage.successProfileUpdate'));
        this.populateForm(this.wpUser()!, payload);

        // --- GEÄNDERT START: Korrekter Aufruf der neuen Methode ---
        // Die Logik zum Aktualisieren der lokalen Benutzerdaten wird an den AuthService delegiert.
        this.authService.updateLocalUserData({
          firstName: payload.billing.first_name,
          lastName: payload.billing.last_name,
          // Der Anzeigename wird ebenfalls aktualisiert, um konsistent zu sein.
          displayName: `${payload.billing.first_name} ${payload.billing.last_name}`.trim()
        });
        // --- GEÄNDERT ENDE ---

      },
      error: err => { this.errorMessage.set(err.message || this.translocoService.translate('profilePage.errors.saveError')); }
    });
  }

  onPasswordChangeSubmit(): void {
    this.passwordFormSubmitted.set(true); this.clearMessages();
    if (this.changePasswordForm.invalid) return;
    this.isSaving.set(true);
    const payload = { current_password: this.changePasswordForm.value.currentPassword, new_password: this.changePasswordForm.value.newPassword };
    this.accountService.changePassword(payload).pipe(
      finalize(() => { this.isSaving.set(false); this.passwordFormSubmitted.set(false); })
    ).subscribe({
      next: () => { this.successMessage.set(this.translocoService.translate('profilePage.successPasswordChange')); this.changePasswordForm.reset(); },
      error: err => { this.errorMessage.set(err.message || this.translocoService.translate('errors.unknownError', { operation: 'Passwort ändern' })); }
    });
  }

  togglePasswordVisibility(field: 'current' | 'new' | 'confirm'): void {
    this.passwordVisibility.update(current => ({ ...current, [field]: !current[field] }));
  }

  setActiveSection(section: ProfileSection): void {
    this.activeSection.set(section);
    if(section !== 'addresses') this.cancelEdit();
    if(section === 'orders' && this.orders().length === 0 && this.currentUserWordPressId){
        this.loadOrders(1, this.currentUserWordPressId);
    }
    this.selectedOrder.set(null); this.clearMessages();
  }

  toggleEdit(): void { this.isEditing.update(v => !v); }

  cancelEdit(): void {
    if (this.profileForm.dirty) { this.loadInitialProfileData(this.currentUserWordPressId!); }
    this.isEditing.set(false); this.clearMessages();
    if (this.billingAutocomplete) { google.maps.event.clearInstanceListeners(this.billingAutocomplete); this.billingAutocomplete = undefined; }
    if (this.shippingAutocomplete) { google.maps.event.clearInstanceListeners(this.shippingAutocomplete); this.shippingAutocomplete = undefined; }
  }
  
  public toggleUseBillingForShipping(event: Event): void {
    this.useBillingForShipping.set(!(event.target as HTMLInputElement).checked);
  }

  private updateShippingFormValidators(isEnabled: boolean): void {
      const requiredFields = ['shipping_first_name', 'shipping_last_name', 'shipping_address_1', 'shipping_city', 'shipping_postcode', 'shipping_country'];
      requiredFields.forEach(field => {
          const control = this.profileForm.get(field);
          if (control) {
              control.setValidators(isEnabled ? [Validators.required] : null);
              control.updateValueAndValidity({ emitEvent: false });
          }
      });
      if (!isEnabled) this.resetShippingForm();
  }

  private resetShippingForm(): void {
    this.profileForm.patchValue({
      shipping_first_name: '', shipping_last_name: '', shipping_company: '',
      shipping_address_1: '', shipping_address_2: '', shipping_city: '',
      shipping_postcode: '', shipping_country: 'DE',
    });
  }

  private markAllAsTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if (control instanceof FormGroup) { this.markAllAsTouched(control); }
    });
  }

  loadOrders(page: number, userId: number): void {
    if (page < 1 || (page > this.totalPages() && this.totalPages() > 0) || !userId) return;
    this.orderIsLoading.set(true); this.currentPage.set(page);
    this.accountService.getCustomerOrders(userId, { page, per_page: this.ordersPerPage() }).pipe(
      finalize(() => { this.orderIsLoading.set(false); this.cdr.detectChanges(); })
    ).subscribe({
      next: (response) => {
        this.orders.set(response.orders); this.totalOrders.set(response.totalOrders);
        this.totalPages.set(response.totalPages);
      },
      error: () => { this.errorMessage.set(this.translocoService.translate('profilePage.errors.loadOrdersError')); }
    });
  }

  loadOrderDetails(orderId: number): void {
    if (!this.currentUserWordPressId) return;
    this.orderIsLoading.set(true); this.selectedOrder.set(null); this.clearMessages();
    this.accountService.getOrderDetails(orderId).pipe(
      finalize(() => { this.orderIsLoading.set(false); this.cdr.detectChanges(); })
    ).subscribe({
      next: (order) => {
        if (order.customer_id === this.currentUserWordPressId) {
          this.selectedOrder.set(order);
          this.activeSection.set('orderDetails');
        } else {
          this.errorMessage.set(this.translocoService.translate('profilePage.errors.unauthorizedOrder'));
          this.activeSection.set('orders');
        }
      },
      error: () => { this.errorMessage.set(this.translocoService.translate('profilePage.errors.loadOrderDetailsError')); }
    });
  }

  formatDate(dateString: string | undefined | null): string {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString(this.translocoService.getActiveLang(), {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return dateString; }
  }

  getSubtotal(): number {
    const order = this.selectedOrder();
    if (!order) {
      return 0;
    }
    const total = parseFloat(order.total);
    const shipping = parseFloat(order.shipping_total);

    if (isNaN(total) || isNaN(shipping)) {
      return 0;
    }
    
    return total - shipping;
  }

  private clearMessages(): void {
    this.errorMessage.set(null); this.successMessage.set(null);
  }

  private handleNotLoggedIn(): void {
    this.isLoading.set(false); this.router.navigate(['/']);
  }

  private setupTitleAndTranslations(): void {
    this.subscriptions.add(
      this.translocoService.langChanges$.pipe(
        startWith(this.translocoService.getActiveLang()),
        switchMap(lang => this.translocoService.selectTranslate('profilePage.title', {}, lang)),
        tap(translatedPageTitle => this.titleService.setTitle(translatedPageTitle))
      ).subscribe()
    );
  }

  isControlInvalid(control: AbstractControl | null): boolean {
    if (!control) return false;
    return control.invalid && (control.touched || this.formSubmitted());
  }

  getControl(name: string): AbstractControl | null {
    return this.profileForm.get(name);
  }

  getCountryNameByCode(code: string | null | undefined): string {
    if (!code) return '';
    const country = this.availableCountries().find(c => c.code === code);
    return country ? country.name : code;
  }
}