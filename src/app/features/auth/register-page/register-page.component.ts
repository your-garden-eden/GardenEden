// /src/app/features/auth/register-page/register-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, ViewChild, ElementRef, NgZone, AfterViewInit, OnDestroy, ChangeDetectorRef, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService, WordPressUser, WordPressRegisterData } from '../../../shared/services/auth.service';
import { AccountService } from '../../account/services/account.service';
import {
  BillingAddress,
  ShippingAddress,
  WooCommerceCustomerUpdatePayload
} from '../../account/services/account.models';
import { GoogleMapsModule } from '@angular/google-maps';
import { UiStateService } from '../../../shared/services/ui-state.service';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription, throwError, of } from 'rxjs';
import { switchMap, catchError, tap, finalize, map, startWith } from 'rxjs/operators';

// +++ NEU: LoadingSpinnerComponent importieren +++
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';


export function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password');
  const confirmPassword = control.get('confirmPassword');
  if (!password || !confirmPassword || !password.value || !confirmPassword.value) { return null; }
  return password.value === confirmPassword.value ? null : { passwordsMismatch: true };
}

declare var google: any;

@Component({
  selector: 'app-register-page',
  standalone: true,
  // +++ NEU: LoadingSpinnerComponent zu den Imports hinzufügen +++
  imports: [CommonModule, ReactiveFormsModule, RouterModule, GoogleMapsModule, TranslocoModule, LoadingSpinnerComponent],
  templateUrl: './register-page.component.html',
  styleUrls: ['./register-page.component.scss']
})
export class RegisterPageComponent implements OnInit, AfterViewInit, OnDestroy {
  private fb = inject(FormBuilder);
  public authService = inject(AuthService);
  private accountService = inject(AccountService);
  private router = inject(Router);
  private ngZone = inject(NgZone);
  private uiStateService = inject(UiStateService);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);

  registerForm!: FormGroup;
  private errorMessageKey: WritableSignal<string | null> = signal(null);
  formSubmitted: WritableSignal<boolean> = signal(false);
  registrationSuccessMessage: WritableSignal<string | null> = signal(null);
  private registrationSuccessMessageKey: WritableSignal<string | null> = signal(null);

  @ViewChild('addressStreetInput') addressStreetInput!: ElementRef<HTMLInputElement>;
  private autocomplete: google.maps.places.Autocomplete | undefined;
  private autocompleteListener: google.maps.MapsEventListener | undefined;
  private subscriptions = new Subscription();

  autocompleteOptions: google.maps.places.AutocompleteOptions = {
    componentRestrictions: { country: 'de' },
    types: ['address'],
    fields: ['address_components', 'formatted_address']
  };

  constructor() {
    effect(() => {
      const authErr = this.authService.authError();
      if (authErr && !this.errorMessageKey()) {
        // Generische Fehlermeldung anzeigen, wenn authError gesetzt ist, aber kein spezifischer hier
      }
    });
  }

  ngOnInit(): void {
    this.registerForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      user_login: [''],
      addressStreet: ['', Validators.required],
      addressZip: ['', [Validators.required, Validators.pattern(/^\d{5}$/)]],
      addressCity: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
      newsletter: [false],
      acceptTerms: [false, Validators.requiredTrue]
    }, { validators: passwordMatchValidator });

    const titleSub = this.translocoService.selectTranslate('registerPage.title').subscribe(title => {
      this.titleService.setTitle(title);
    });
    this.subscriptions.add(titleSub);

    const langChangeSub = this.translocoService.langChanges$.subscribe(() => {
        if (this.errorMessageKey() && this.authService.authError()) {
            this.authService.authError.set(this.translocoService.translate(this.errorMessageKey()!));
        }
        if (this.registrationSuccessMessageKey()) {
          const emailValue = this.registerForm.get('email')?.value || 'Ihrer E-Mail-Adresse';
          this.registrationSuccessMessage.set(this.translocoService.translate(this.registrationSuccessMessageKey()!, { email: emailValue }));
        }
        this.cdr.detectChanges();
    });
    this.subscriptions.add(langChangeSub);
  }

  ngAfterViewInit(): void {
    this.initializeAutocomplete();
  }

  ngOnDestroy(): void {
      if (this.autocompleteListener && typeof google !== 'undefined' && google.maps && google.maps.event) {
          google.maps.event.removeListener(this.autocompleteListener);
          this.autocompleteListener = undefined;
      }
      this.subscriptions.unsubscribe();
  }

  private initializeAutocomplete(): void {
    if (typeof google !== 'undefined' && google.maps && google.maps.places) {
        setTimeout(() => {
            if (this.addressStreetInput && this.addressStreetInput.nativeElement) {
                try {
                    this.autocomplete = new google.maps.places.Autocomplete(
                        this.addressStreetInput.nativeElement, this.autocompleteOptions
                    );
                    if (this.autocomplete) {
                        this.autocompleteListener = this.autocomplete.addListener('place_changed', () => {
                            this.ngZone.run(() => { this.onPlaceChanged(); });
                        });
                    } else { this.setErrorMessage('registerPage.errorAutocompleteInit'); }
                } catch (error) { this.setErrorMessage('registerPage.errorAutocompleteInitGeneral'); console.error("Autocomplete Init Error: ", error); }
            } else { this.setErrorMessage('registerPage.errorAddressFieldNotFound'); }
        }, 200);
    } else { this.setErrorMessage('registerPage.errorGoogleMapsLoad'); }
  }

  private onPlaceChanged(): void {
    if (!this.autocomplete) { return; }
    const place = this.autocomplete.getPlace();
    if (place?.address_components) {
        let street = '', streetNumber = '', zip = '', city = '';
        place.address_components.forEach(component => {
            const types = component.types;
            if (types.includes('street_number')) { streetNumber = component.long_name; }
            else if (types.includes('route')) { street = component.long_name; }
            else if (types.includes('postal_code')) { zip = component.long_name; }
            else if (types.includes('locality') || types.includes('political')) { city = component.long_name; }
        });
        this.registerForm.patchValue({
          addressStreet: `${street} ${streetNumber}`.trim(), addressZip: zip, addressCity: city
        });
        ['addressStreet', 'addressZip', 'addressCity'].forEach(name => this.registerForm.get(name)?.markAsTouched());
    }
  }

  get firstName() { return this.registerForm.get('firstName'); }
  get lastName() { return this.registerForm.get('lastName'); }
  get user_login() { return this.registerForm.get('user_login'); }
  get addressStreet() { return this.registerForm.get('addressStreet'); }
  get addressZip() { return this.registerForm.get('addressZip'); }
  get addressCity() { return this.registerForm.get('addressCity'); }
  get email() { return this.registerForm.get('email'); }
  get password() { return this.registerForm.get('password'); }
  get confirmPassword() { return this.registerForm.get('confirmPassword'); }
  get newsletter() { return this.registerForm.get('newsletter'); }
  get acceptTerms() { return this.registerForm.get('acceptTerms'); }

  openLoginOverlay(event: MouseEvent): void {
    event.preventDefault(); this.uiStateService.openLoginOverlay();
  }

  onSubmit(): void {
    this.formSubmitted.set(true); this.clearMessages(); this.registerForm.markAllAsTouched();
    if (this.registerForm.invalid) { this.focusFirstInvalidField(); return; }

    const formValue = this.registerForm.value;
    const registrationData: WordPressRegisterData = {
      email: formValue.email, password: formValue.password, user_login: formValue.user_login || undefined,
      first_name: formValue.firstName, last_name: formValue.lastName,
      display_name: `${formValue.firstName} ${formValue.lastName}`.trim()
    };
    if (!registrationData.display_name && registrationData.user_login) registrationData.display_name = registrationData.user_login;
    else if (!registrationData.display_name) registrationData.display_name = registrationData.email.split('@')[0];

    this.authService.isLoading.set(true);
    this.authService.register(registrationData).pipe(
      switchMap((user: WordPressUser | null) => {
        if (user && user.id) {
          console.log('RegisterPageComponent: Registrierung und direkter Login erfolgreich. Speichere Adressdaten für User ID:', user.id);
          const billingAddress: BillingAddress = {
            first_name: formValue.firstName, last_name: formValue.lastName,
            company: formValue.company || '',
            address_1: formValue.addressStreet, address_2: formValue.address2 || '',
            city: formValue.addressCity, state: formValue.state || '',
            postcode: formValue.addressZip, country: 'DE',
            email: formValue.email, phone: formValue.phone || ''
          };
          const addressPayload: WooCommerceCustomerUpdatePayload = {
            billing: billingAddress,
            shipping: (({ email, ...rest }) => rest)(billingAddress)
          };
          return this.accountService.updateWooCommerceCustomerDetails(user.id, addressPayload).pipe(
            map(() => user),
            catchError(addressError => {
              console.warn('RegisterPageComponent: Benutzer registriert, aber Fehler beim Speichern der Adresse:', addressError);
              this.setErrorMessage('registerPage.errorSavingAddress'); return of(user);
            })
          );
        } else if (user === null && !this.authService.authError()) {
          this.setSuccessMessage('registerPage.successMessagePendingVerification', { email: formValue.email }); return of(null);
        }
        return of(null);
      }),
      finalize(() => { /* isLoading wird im AuthService gehandhabt */ })
    ).subscribe({
        next: (userAfterAddressUpdate) => {
          if (userAfterAddressUpdate && userAfterAddressUpdate.jwt) {
            if (this.errorMessageKey() === 'registerPage.errorSavingAddress') {
                this.setSuccessMessage('registerPage.successMessageLoggedInButAddressError', { email: formValue.email });
            } else {
                this.setSuccessMessage('registerPage.successMessageLoggedInAndAddressSaved', { email: formValue.email });
            }
            setTimeout(() => { this.router.navigate(['/mein-konto']); }, 4000);
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
            if (err && err.message && !this.authService.authError()) {
                const lowerCaseError = err.message.toLowerCase();
                if (lowerCaseError.includes('email') && (lowerCaseError.includes('already in use') || lowerCaseError.includes('existiert bereits'))) {
                    this.setErrorMessage('registerPage.errorEmailInUse');
                    this.email?.setErrors({ alreadyInUse: true });
                } else { this.setErrorMessage('registerPage.errorGeneric'); }
            }
            this.cdr.markForCheck();
        }
      });
  }

  private focusFirstInvalidField(): void {
    const controls = this.registerForm.controls;
    for (const name in controls) {
        if (controls[name].invalid) {
            const element = document.querySelector(`[formControlName="${name}"]`);
            if (element instanceof HTMLElement) { element.focus(); break; }
        }
    }
  }

  private clearMessages(): void {
    this.errorMessageKey.set(null); this.registrationSuccessMessageKey.set(null);
    this.registrationSuccessMessage.set(null); this.authService.authError.set(null);
  }

  private setErrorMessage(key: string, params?: object): void {
    this.errorMessageKey.set(key);
    this.authService.authError.set(this.translocoService.translate(key, params));
    this.cdr.detectChanges();
  }
  private setSuccessMessage(key: string, params?: object): void {
    this.registrationSuccessMessageKey.set(key);
    this.registrationSuccessMessage.set(this.translocoService.translate(key, params));
    this.cdr.detectChanges();
  }
}