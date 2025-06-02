// src/app/features/account/profile-page/profile-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, OnDestroy, ChangeDetectorRef, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService, WordPressUser } from '../../../shared/services/auth.service';
import {
  WooCommerceCustomer, // Bleibt für Typisierung, falls updateWooCommerceCustomerDetails es zurückgibt
  WooCommerceOrder,
  PaginatedOrdersResponse,
  // BillingAddress, // Nicht mehr direkt für Payload-Erstellung benötigt, aber Teil von WooCommerceCustomerUpdatePayload
  // ShippingAddress, // Nicht mehr direkt für Payload-Erstellung benötigt, aber Teil von WooCommerceCustomerUpdatePayload
  WooCommerceCustomerUpdatePayload
} from '../services/account.models';
import { AccountService, WpUserMeResponse } from '../services/account.service';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription, forkJoin, of, timer, EMPTY } from 'rxjs'; // EMPTY hinzugefügt
import { startWith, switchMap, tap, filter, finalize, catchError, map, take } from 'rxjs/operators';

// PasswordMatchValidator wird aktuell nicht verwendet, da Passwortänderung in Wartung ist.
// Kann für spätere Reaktivierung bleiben.
export function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const newPassword = control.get('newPassword');
  const confirmPassword = control.get('confirmPassword');
  if (!newPassword || !confirmPassword || !newPassword.value || !confirmPassword.value) { return null; }
  return newPassword.value === confirmPassword.value ? null : { passwordsMismatch: true };
}

type ProfileSection = 'overview' | 'personalData' | 'addresses' | 'orders' | 'changePassword' | 'orderDetails';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslocoModule],
  templateUrl: './profile-page.component.html',
  styleUrls: ['./profile-page.component.scss']
})
export class ProfilePageComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  public authService = inject(AuthService); // Muss public sein, falls Logout-Button im HTML wieder verwendet wird
  private accountService = inject(AccountService);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  wpUser: WritableSignal<WpUserMeResponse | null> = signal(null);
  // wooCommerceProfile Signal bleibt, wird aber nicht mehr mit Adressdaten für die UI befüllt
  wooCommerceProfile: WritableSignal<WooCommerceCustomer | null> = signal(null);

  orders: WritableSignal<WooCommerceOrder[]> = signal([]);
  selectedOrder: WritableSignal<WooCommerceOrder | null> = signal(null);
  orderIsLoading: WritableSignal<boolean> = signal(false);
  totalOrders = signal(0);
  totalPages = signal(0);
  currentPage = signal(1);
  ordersPerPage = signal(5);

  isLoading: WritableSignal<boolean> = signal(true);
  isSaving: WritableSignal<boolean> = signal(false);
  // isRequestingPasswordReset nicht mehr benötigt, da Passwort-Sektion in Wartung
  // isRequestingPasswordReset: WritableSignal<boolean> = signal(false);
  errorMessage: WritableSignal<string | null> = signal(null);
  private errorMessageKey: WritableSignal<string | null> = signal(null);
  successMessage: WritableSignal<string | null> = signal(null);
  private successMessageKey: WritableSignal<string | null> = signal(null);

  isEditingPersonalData: WritableSignal<boolean> = signal(false);
  // Folgende Signals für Adressbearbeitung nicht mehr benötigt, da Adressen in Wartung:
  // isEditingBillingAddress: WritableSignal<boolean> = signal(false);
  // isEditingShippingAddress: WritableSignal<boolean> = signal(false);

  formSubmitted: WritableSignal<boolean> = signal(false);
  // passwordFormSubmitted nicht mehr benötigt
  // passwordFormSubmitted: WritableSignal<boolean> = signal(false);

  personalDataForm!: FormGroup;
  // Adressformulare werden initialisiert, aber nicht mehr für UI-Eingabe/Anzeige der Adressen genutzt
  billingAddressForm!: FormGroup;
  shippingAddressForm!: FormGroup;
  // changePasswordForm nicht mehr benötigt
  // changePasswordForm!: FormGroup;
  // useBillingForShipping nicht mehr benötigt
  // useBillingForShipping = signal(true);

  activeSection: WritableSignal<ProfileSection> = signal('overview');
  private subscriptions = new Subscription();
  currentUserWordPressId: number | null = null;

  // Der Effect für useBillingForShipping ist nicht mehr relevant, da Adressen in Wartung
  constructor() {
    // effect(() => { ... }); // Auskommentiert, da useBillingForShipping nicht mehr verwendet wird
  }

  ngOnInit(): void {
    this.setupTitleAndTranslations();
    this.initializeForms(); // Initialisiert persönliche Daten und (minimal) Adressformulare

    const authSub = this.authService.currentWordPressUser$.pipe(
      tap(user => console.log('[ProfilePage] Auth state received in ngOnInit:', user?.email, 'ID:', user?.id)),
      filter((user): user is WordPressUser => !!user && user.id !== undefined && user.id !== null),
    ).subscribe(
      user => {
        this.currentUserWordPressId = user.id;
        this.wpUser.set({
            id: user.id, email: user.email, name: user.displayName,
            first_name: user.firstName || user.displayName.split(' ')[0] || '',
            last_name: user.lastName || user.displayName.split(' ').slice(1).join(' ') || '',
            username: user.username || user.displayName, roles: user.roles
        });

        console.log('[ProfilePage] User identified in ngOnInit, ID:', user.id, '. Preparing to load initial profile data (addresses & password change in maintenance).');
        // Der Timeout kann beibehalten werden, falls er für andere GET-Requests noch relevant ist (z.B. users/me, orders)
        setTimeout(() => {
          console.log('[ProfilePage] DELAY ENDED. Now loading initial profile data for user ID:', user.id);
          this.loadInitialProfileData(user.id);
        }, 2000);
      },
      () => { if (!this.authService.isLoading()) { this.handleNotLoggedIn(); } }
    );
    this.subscriptions.add(authSub);

    if (!this.authService.getCurrentUserValue() && !this.authService.isLoading()) {
        console.log('[ProfilePage] No current user value and not loading in ngOnInit. Handling as not logged in.');
        this.handleNotLoggedIn();
    }
  }

  private initializeForms(): void {
    this.personalDataForm = this.fb.group({
      email: [{ value: '', disabled: true }, [Validators.required, Validators.email]],
      firstName: ['', Validators.required], lastName: ['', Validators.required],
    });

    // Adressformulare: Basisstruktur beibehalten, falls sie später reaktiviert werden, aber keine Validatoren mehr zwingend nötig, da nicht für Eingabe
    const addressBaseValidators = {
      first_name: [''], last_name: [''], company: [''],
      address_1: [''], address_2: [''], city: [''],
      state: [''], postcode: [''],
      country: [{value: 'DE', disabled: true }], // Land kann fix bleiben
    };
    this.billingAddressForm = this.fb.group({
      ...addressBaseValidators,
      email: [{value: '', disabled: true}], // E-Mail readonly
      phone: ['']
    });
    this.shippingAddressForm = this.fb.group({ ...addressBaseValidators, phone: [''] });

    // changePasswordForm wird nicht mehr initialisiert
  }

  private loadInitialProfileData(userId: number): void {
    console.log('[ProfilePage] loadInitialProfileData CALLED for userId:', userId, '(Addresses & Password Change in maintenance)');
    if (!userId) { this.handleMissingUserError('loadInitialProfileData'); return; }
    this.isLoading.set(true); this.clearMessages();

    const wpUserDetails$ = this.accountService.getWpUserDetails().pipe(
      tap(response => console.log('[ProfilePage] WP User Details response:', response)),
      catchError(err => {
        console.warn('[ProfilePage] Konnte WP User Details nicht laden. Fehler:', err);
        this.errorMessageKey.set('profilePage.errorWpUserLoad'); this.updateErrorMessage();
        return of(this.wpUser() || null);
    }));

    // WooCommerce Kundendetails (mit Adressen) werden NICHT mehr geladen, da Sektion in Wartung
    const wooCustomerDetails$ = of(null); // Gibt ein Observable zurück, das sofort `null` emittiert

    const orders$ = this.accountService.getCustomerOrders(userId, { page: this.currentPage(), per_page: this.ordersPerPage() }).pipe(
      tap(response => console.log('[ProfilePage] Customer Orders response:', response)),
      catchError(err => {
        console.error('[ProfilePage] Fehler beim Laden der Bestellungen. Fehler:', err);
        this.errorMessageKey.set('profilePage.errorOrdersLoad'); this.updateErrorMessage();
        return of({ orders: [], totalOrders: 0, totalPages: 0 } as PaginatedOrdersResponse);
      })
    );

    this.subscriptions.add(
      forkJoin({ wpUser: wpUserDetails$, wooCustomer: wooCustomerDetails$, ordersResponse: orders$ }).pipe(
        finalize(() => { this.isLoading.set(false); this.cdr.detectChanges(); })
      ).subscribe({
        next: ({ wpUser, wooCustomer, ordersResponse }) => {
          console.log('[ProfilePage] forkJoin next - WP User:', wpUser, '- WooCustomer (should be null):', wooCustomer, '- OrdersResponse:', ordersResponse);
          if(wpUser) this.wpUser.set(wpUser);
          this.wooCommerceProfile.set(null); // Explizit auf null setzen, da Adressen in Wartung

          this.orders.set(ordersResponse.orders); this.totalOrders.set(ordersResponse.totalOrders);
          this.totalPages.set(ordersResponse.totalPages);
          
          // populateForms nur mit wpUser-Daten für persönliche Daten, wooCustomer ist null
          this.populateForms(this.wpUser(), null);
        },
        error: (err) => {
          console.error('[ProfilePage] Unerwarteter Fehler im forkJoin Profildaten:', err.message || err);
          this.errorMessageKey.set('profilePage.errorProfileLoadGeneral'); this.updateErrorMessage();
        }
      })
    );
  }

  private populateForms(wpUser?: WpUserMeResponse | null, wooCustomer?: WooCommerceCustomer | null): void {
    // wooCustomer wird hier null sein oder ignoriert für Adressen
    console.log('[ProfilePage] populateForms - WP User Signal:', wpUser, '(WooCommerce customer data not used for addresses)');
    
    const emailToUse = wpUser?.email || this.authService.getCurrentUserValue()?.email || '';
    this.personalDataForm.patchValue({
      email: emailToUse,
      firstName: wpUser?.first_name || '', // Nutze Daten aus wpUser
      lastName: wpUser?.last_name || '',   // Nutze Daten aus wpUser
    }, { emitEvent: false });

    // Adressformulare werden nicht mehr mit Daten befüllt.
    // Die Formulare existieren noch (billingAddressForm, shippingAddressForm), werden aber im HTML nicht für die Eingabe genutzt.

    this.formSubmitted.set(false);
    this.cdr.detectChanges();
  }

  setActiveSection(section: ProfileSection, orderId?: number): void {
    this.activeSection.set(section); this.clearMessages(); this.formSubmitted.set(false);
    this.isEditingPersonalData.set(false);
    // isEditingBillingAddress und isEditingShippingAddress werden nicht mehr umgeschaltet

    if (section === 'orderDetails' && orderId) { this.loadOrderDetails(orderId); }
    else {
      this.selectedOrder.set(null);
      if (section === 'orders' && this.currentUserWordPressId) {
        this.loadOrders(this.currentPage(), this.currentUserWordPressId);
      }
    }
    // Für Adressen und Passwort ändern wird die Wartungsmeldung direkt im HTML angezeigt
    this.cdr.detectChanges();
  }

  onSavePersonalData(): void {
    // Diese Funktion bleibt für das Speichern von Vorname/Nachname.
    // Sie verwendet updateWooCommerceCustomerDetails, was das 403-Problem haben könnte.
    this.formSubmitted.set(true); this.clearMessages(); if (this.personalDataForm.invalid) { return; }
    const customerIdToUpdate = this.currentUserWordPressId;
    if (!customerIdToUpdate) { this.handleMissingUserError('onSavePersonalData (missing customer ID)'); return; }

    this.isSaving.set(true); const formValue = this.personalDataForm.getRawValue();
    const payload: WooCommerceCustomerUpdatePayload = {
      first_name: formValue.firstName,
      last_name: formValue.lastName,
      // Wichtig: Keine Adressdaten im Payload, wenn diese nicht editiert/gesendet werden sollen.
      // Wenn der Server leere Adressdaten als "Löschen" interpretiert, wäre das unerwünscht.
      // Da wir die Adressen aber gar nicht erst laden, ist das hier konsistent.
    };
    console.log('[ProfilePage] Attempting to save personal data (first_name, last_name only) with payload:', payload);

    this.accountService.updateWooCommerceCustomerDetails(customerIdToUpdate, payload).pipe(
      finalize(() => { this.isSaving.set(false); this.formSubmitted.set(false); this.isEditingPersonalData.set(false); this.cdr.detectChanges(); })
    ).subscribe({
      next: (updatedCustomer) => {
        // Aktualisiere wpUser Signal mit den neuen Vor-/Nachnamen
        this.wpUser.update(currentUser => currentUser ? {
            ...currentUser,
            first_name: updatedCustomer.first_name, // Annahme: updatedCustomer enthält zumindest diese Felder
            last_name: updatedCustomer.last_name,
            name: `${updatedCustomer.first_name || ''} ${updatedCustomer.last_name || ''}`.trim()
        } : null);

        // Aktualisiere Benutzerdaten im AuthService (localStorage)
        this.authService.currentWordPressUser$.pipe(take(1)).subscribe(authUser => {
          if (authUser) {
            const updatedAuthUser: WordPressUser = {
                ...authUser,
                firstName: updatedCustomer.first_name,
                lastName: updatedCustomer.last_name,
                displayName: `${updatedCustomer.first_name || ''} ${updatedCustomer.last_name || ''}`.trim(),
            };
            // Stelle sicher, dass storeAuthData verfügbar ist und aufgerufen wird
            if (typeof (this.authService as any).storeAuthData === 'function') {
                 (this.authService as any).storeAuthData(updatedAuthUser, updatedAuthUser.jwt, updatedAuthUser.refreshToken);
            } else {
              console.warn('[ProfilePage] authService.storeAuthData is not a function. Cannot update user in localStorage.');
            }
          }
        });
        
        // populateForms nur mit wpUser-Daten neu aufrufen, um die Anzeige zu aktualisieren
        this.populateForms(this.wpUser(), null); // wooCommerceProfile bleibt null

        this.successMessageKey.set('profilePage.successProfileUpdate'); this.updateSuccessMessage();
        setTimeout(() => this.clearMessages(), 3000);
      },
      error: (err) => { 
        this.errorMessageKey.set('profilePage.errorProfileSave'); this.updateErrorMessage(); 
        console.error('[ProfilePage] Error saving personal data:', err);
      }
    });
  }

  // Adress-Speicherfunktionen werden nicht mehr benötigt, da die Sektion im HTML in Wartung ist
  // onSaveBillingAddress(): void { /* Inhalt entfernt oder auskommentiert */ }
  // onSaveShippingAddress(): void { /* Inhalt entfernt oder auskommentiert */ }

  // Passwort-Reset-Anforderung wird nicht mehr benötigt, da die Sektion im HTML in Wartung ist
  // onSavePassword(): void { /* Inhalt entfernt oder auskommentiert */ }

  loadOrders(page: number, userId: number): void {
    if (page < 1 || (page > this.totalPages() && this.totalPages() > 0) || !userId) {
      console.warn('[ProfilePage] loadOrders: Ungültige Seite oder User-ID', page, userId); return;
    }
    this.orderIsLoading.set(true); this.currentPage.set(page);
    this.accountService.getCustomerOrders(userId, { page: this.currentPage(), per_page: this.ordersPerPage() })
      .pipe(finalize(() => { this.orderIsLoading.set(false); this.cdr.detectChanges(); }))
      .subscribe({
        next: (response) => {
          this.orders.set(response.orders); this.totalOrders.set(response.totalOrders);
          this.totalPages.set(response.totalPages);
        },
        error: (err) => { this.errorMessageKey.set('profilePage.errorOrdersLoad'); this.updateErrorMessage(); }
      });
  }

  loadOrderDetails(orderId: number): void {
    const customerIdForOrderCheck = this.currentUserWordPressId;
    if (!customerIdForOrderCheck) { this.handleMissingUserError('loadOrderDetails (missing customer ID)'); return; }

    this.isLoading.set(true); this.selectedOrder.set(null); this.clearMessages();
    this.accountService.getOrderDetails(orderId)
      .pipe(finalize(() => { this.isLoading.set(false); this.cdr.detectChanges(); }))
      .subscribe({
        next: (order) => {
            if (order.customer_id === customerIdForOrderCheck) {
                this.selectedOrder.set(order);
                this.activeSection.set('orderDetails');
            } else {
                console.warn('[ProfilePage] Order detail loaded, but customer_id does not match current user.', order, customerIdForOrderCheck);
                this.errorMessageKey.set('profilePage.errorOrderDetailLoad'); this.updateErrorMessage();
                this.activeSection.set('orders');
            }
        },
        error: (err) => { this.errorMessageKey.set('profilePage.errorOrderDetailLoad'); this.updateErrorMessage(); }
      });
  }

  formatDate(dateString: string | undefined | null): string {
    if (!dateString) return this.translocoService.translate('profilePage.notAvailable');
    try {
      return new Date(dateString).toLocaleDateString(this.translocoService.getActiveLang(), {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return dateString; }
  }

  // toggleUseBillingForShipping nicht mehr benötigt, da Adressen in Wartung
  // public toggleUseBillingForShipping(event: Event): void {
  //   const inputElement = event.target as HTMLInputElement;
  //   this.useBillingForShipping.set(!inputElement.checked);
  // }

  private clearMessages(): void {
    this.errorMessage.set(null); this.errorMessageKey.set(null);
    this.successMessage.set(null); this.successMessageKey.set(null);
  }

  private updateErrorMessage(): void {
    if (this.errorMessageKey()) this.errorMessage.set(this.translocoService.translate(this.errorMessageKey()!));
    else if (!this.errorMessage()) this.errorMessage.set(null); // Stellt sicher, dass eine direkte Fehlermeldung nicht überschrieben wird
    this.cdr.detectChanges();
  }

  private updateSuccessMessage(): void {
     if (this.successMessageKey()) this.successMessage.set(this.translocoService.translate(this.successMessageKey()!));
     else if (!this.successMessage()) this.successMessage.set(null);
     this.cdr.detectChanges();
  }

  private handleMissingUserError(operation: string): void {
    this.isLoading.set(false); this.isSaving.set(false);
    // this.isRequestingPasswordReset.set(false); // Nicht mehr benötigt
    this.errorMessageKey.set('profilePage.errorUserNotFoundContext');
    this.updateErrorMessage();
    console.error(`[ProfilePage] Aktion '${operation}' fehlgeschlagen, da Benutzer nicht gefunden wurde oder keine ID/E-Mail hat.`);
    this.cdr.detectChanges();
  }
  
  private handleNotLoggedIn(): void {
    this.isLoading.set(false);
    this.errorMessageKey.set('profilePage.errorUserNotLoggedIn');
    this.updateErrorMessage();
    console.warn('[ProfilePage] User not logged in or user ID missing. Profile data not loaded.');
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void { this.subscriptions.unsubscribe(); }

  private setupTitleAndTranslations(): void {
    const langChangeSub = this.translocoService.langChanges$.pipe(
      startWith(this.translocoService.getActiveLang()),
      switchMap(lang => this.translocoService.selectTranslate('profilePage.mainTitle', {}, lang)),
      tap(translatedPageTitle => this.titleService.setTitle(translatedPageTitle))
    ).subscribe(() => {
      this.updateErrorMessage(); this.updateSuccessMessage(); this.cdr.detectChanges();
    });
    this.subscriptions.add(langChangeSub);
  }

  isControlInvalid(form: FormGroup, controlName: string): boolean {
    const control = form.get(controlName);
    return !!control?.invalid && (control?.touched || this.formSubmitted());
  }

  // isPasswordControlInvalid nicht mehr benötigt
  // isPasswordControlInvalid(controlName: string): boolean {
  //   const control = this.changePasswordForm.get(controlName);
  //   return !!control?.invalid && (control?.touched || this.passwordFormSubmitted());
  // }
}