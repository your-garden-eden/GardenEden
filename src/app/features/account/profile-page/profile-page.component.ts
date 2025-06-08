// /src/app/features/account/profile-page/profile-page.component.ts

import { Component, OnInit, inject, signal, OnDestroy, ChangeDetectorRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth.service';
import {
  WooCommerceOrder,
  PaginatedOrdersResponse,
  UserAddressesResponse,
  WpUserMeResponse
} from '../services/account.models';
import { AccountService } from '../services/account.service';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription, forkJoin, of } from 'rxjs';
import { startWith, switchMap, tap, finalize, catchError, take } from 'rxjs/operators';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { FormatPricePipe } from '../../../shared/pipes/format-price.pipe';

type ProfileSection = 'addresses' | 'orders' | 'changePassword' | 'orderDetails';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslocoModule, LoadingSpinnerComponent, FormatPricePipe],
  templateUrl: './profile-page.component.html',
  styleUrls: ['./profile-page.component.scss']
})
export class ProfilePageComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  public authService = inject(AuthService);
  private accountService = inject(AccountService);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  // UI State Signals
  isLoading = signal(true);
  isSaving = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  isEditing = signal(false);
  useBillingForShipping = signal(true);
  formSubmitted = signal(false);

  // Forms
  profileForm!: FormGroup;

  // Liste der Länder für das Dropdown
  public availableCountries = [
    { code: 'DE', name: 'Deutschland' },
    { code: 'AT', name: 'Österreich' },
    { code: 'CH', name: 'Schweiz' }
  ];

  // Data Signals
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

  constructor() {
    effect(() => {
      // Wenn isEditing auf false gesetzt wird, stellen wir sicher, dass die Formulare zurückgesetzt werden.
      if (!this.isEditing()) {
        this.formSubmitted.set(false);
        if (this.currentUserWordPressId) {
            this.loadInitialProfileData(this.currentUserWordPressId);
        }
      }
    });

    effect(() => {
        // Dieser Effect steuert die Validatoren für die Lieferadresse
        this.updateShippingFormValidators(!this.useBillingForShipping());
    });
  }

  ngOnInit(): void {
    this.setupTitleAndTranslations();
    this.initializeForm();

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
  }

  private initializeForm(): void {
    this.profileForm = this.fb.group({
      first_name: ['', Validators.required],
      last_name: ['', Validators.required],
      email: [{ value: '', disabled: true }],
      billing_company: [''],
      billing_address_1: ['', Validators.required],
      billing_address_2: [''],
      billing_city: ['', Validators.required],
      billing_postcode: ['', [Validators.required, Validators.pattern(/^\d{5}$/)]],
      billing_country: ['DE', Validators.required],
      billing_state: [''],
      billing_phone: ['', Validators.required],
      shipping_first_name: [''],
      shipping_last_name: [''],
      shipping_company: [''],
      shipping_address_1: [''],
      shipping_address_2: [''],
      shipping_city: [''],
      shipping_postcode: [''],
      shipping_country: ['DE', Validators.required],
      shipping_state: [''],
    });
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
      },
      error: err => {
        this.errorMessage.set(this.translocoService.translate('profilePage.errors.loadProfileError'));
      }
    });
  }

  private populateForm(wpUser: WpUserMeResponse, addresses: UserAddressesResponse | null): void {
    this.profileForm.patchValue({
      first_name: wpUser.first_name,
      last_name: wpUser.last_name,
      email: wpUser.email,
      billing_company: addresses?.billing.company ?? '',
      billing_address_1: addresses?.billing.address_1 ?? '',
      billing_address_2: addresses?.billing.address_2 ?? '',
      billing_city: addresses?.billing.city ?? '',
      billing_postcode: addresses?.billing.postcode ?? '',
      billing_country: addresses?.billing.country || 'DE',
      billing_state: addresses?.billing.state ?? '',
      billing_phone: addresses?.billing.phone ?? '',
    });

    const hasShippingAddress = addresses?.shipping && addresses.shipping.address_1 &&
      (addresses.billing.address_1 !== addresses.shipping.address_1 || addresses.billing.postcode !== addresses.shipping.postcode);

    if (hasShippingAddress) {
        this.useBillingForShipping.set(false);
        this.profileForm.patchValue({
            shipping_first_name: addresses.shipping.first_name ?? '',
            shipping_last_name: addresses.shipping.last_name ?? '',
            shipping_company: addresses.shipping.company ?? '',
            shipping_address_1: addresses.shipping.address_1 ?? '',
            shipping_address_2: addresses.shipping.address_2 ?? '',
            shipping_city: addresses.shipping.city ?? '',
            shipping_postcode: addresses.shipping.postcode ?? '',
            shipping_country: addresses.shipping.country || 'DE',
            shipping_state: addresses.shipping.state ?? '',
        });
    } else {
        this.useBillingForShipping.set(true);
        this.resetShippingForm();
    }
  }

  setActiveSection(section: ProfileSection): void {
    this.activeSection.set(section);
    if(section !== 'addresses') this.cancelEdit();
    if(section === 'orders' && this.orders().length === 0 && this.currentUserWordPressId){
        this.loadOrders(1, this.currentUserWordPressId);
    }
    this.selectedOrder.set(null);
  }

  toggleEdit(): void {
    this.isEditing.update(v => !v);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
    this.clearMessages();
  }

  onSaveProfile(): void {
    this.formSubmitted.set(true);
    this.markAllAsTouched(this.profileForm);

    if (this.profileForm.invalid) {
        this.errorMessage.set(this.translocoService.translate('profilePage.errors.formInvalid'));
        return;
    }
    this.isSaving.set(true);
    this.clearMessages();

    const payload = this.prepareAddressPayload();

    this.accountService.updateUserAddresses(payload).pipe(
      finalize(() => { this.isSaving.set(false); this.isEditing.set(false); this.formSubmitted.set(false); this.cdr.markForCheck(); })
    ).subscribe({
      next: (response) => {
        this.successMessage.set(this.translocoService.translate('profilePage.successProfileUpdate'));
        this.populateForm(this.wpUser()!, payload);
        const user = this.authService.getCurrentUserValue();
        if(user) {
          user.firstName = payload.billing.first_name;
          user.lastName = payload.billing.last_name;
          (this.authService as any).storeAuthData(user, user.jwt, user.refreshToken);
        }
      },
      error: err => { this.errorMessage.set(err.message || this.translocoService.translate('profilePage.errors.saveError')); }
    });
  }

  private prepareAddressPayload(): UserAddressesResponse {
    const formValue = this.profileForm.getRawValue();
    const billing = {
        first_name: formValue.first_name, last_name: formValue.last_name, company: formValue.billing_company,
        address_1: formValue.billing_address_1, address_2: formValue.billing_address_2,
        city: formValue.billing_city, postcode: formValue.billing_postcode, country: formValue.billing_country,
        state: formValue.billing_state, email: formValue.email, phone: formValue.billing_phone,
    };
    const shipping = this.useBillingForShipping() ? billing : {
        first_name: formValue.shipping_first_name, last_name: formValue.shipping_last_name, company: formValue.shipping_company,
        address_1: formValue.shipping_address_1, address_2: formValue.shipping_address_2,
        city: formValue.shipping_city, postcode: formValue.shipping_postcode, country: formValue.shipping_country,
        state: formValue.shipping_state,
    };
    return { billing, shipping };
  }

  public toggleUseBillingForShipping(event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.useBillingForShipping.set(!isChecked);
  }

  private updateShippingFormValidators(isEnabled: boolean): void {
      const shippingGroup = this.profileForm.get('shipping') as FormGroup;
      if (!shippingGroup) return;

      const requiredFields = ['first_name', 'last_name', 'address_1', 'city', 'postcode', 'country'];
      requiredFields.forEach(field => {
          const control = this.profileForm.get(`shipping_${field}`);
          if (control) {
              control.setValidators(isEnabled ? [Validators.required] : null);
              control.updateValueAndValidity();
          }
      });

      const postcodeControl = this.profileForm.get('shipping_postcode');
      if (postcodeControl) {
        const validators = isEnabled ? [Validators.required, Validators.pattern(/^\d{5}$/)] : [Validators.pattern(/^\d{5}$/)];
        postcodeControl.setValidators(validators);
        postcodeControl.updateValueAndValidity();
      }

      if (!isEnabled) {
        this.resetShippingForm();
      }
  }

  private resetShippingForm(): void {
    this.profileForm.patchValue({
      shipping_first_name: '', shipping_last_name: '', shipping_company: '',
      shipping_address_1: '', shipping_address_2: '', shipping_city: '',
      shipping_postcode: '', shipping_country: 'DE', shipping_state: ''
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
      error: (err) => { this.errorMessage.set(this.translocoService.translate('profilePage.errors.loadOrdersError')); }
    });
  }

  loadOrderDetails(orderId: number): void {
    if (!this.currentUserWordPressId) return;
    this.orderIsLoading.set(true);
    this.selectedOrder.set(null);
    this.clearMessages();
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
      error: (err) => { this.errorMessage.set(this.translocoService.translate('profilePage.errors.loadOrderDetailsError')); }
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

  private clearMessages(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  private handleNotLoggedIn(): void {
    this.isLoading.set(false);
    this.router.navigate(['/anmelden'], { queryParams: { redirect: '/mein-konto' } });
  }

  private setupTitleAndTranslations(): void {
    const langChangeSub = this.subscriptions.add(
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
    const country = this.availableCountries.find(c => c.code === code);
    return country ? country.name : code;
  }
}