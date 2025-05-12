// /src/app/features/auth/register-page/register-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, ViewChild, ElementRef, NgZone, AfterViewInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth.service';
import { Firestore, doc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { GoogleMapsModule } from '@angular/google-maps';
import { UiStateService } from '../../../shared/services/ui-state.service';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs';
import { switchMap, startWith, tap } from 'rxjs/operators'; // tap hinzugefügt, falls nicht schon da

// Custom Validator für Passwort-Match
export function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password');
  const confirmPassword = control.get('confirmPassword');
  if (!password || !confirmPassword || !password.value || !confirmPassword.value) { return null; }
  return password.value === confirmPassword.value ? null : { passwordsMismatch: true };
}

// Globale Variable für google deklarieren
declare var google: any;

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, GoogleMapsModule, TranslocoModule],
  templateUrl: './register-page.component.html',
  styleUrls: ['./register-page.component.scss']
})
export class RegisterPageComponent implements OnInit, AfterViewInit, OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private firestore = inject(Firestore);
  private ngZone = inject(NgZone);
  private uiStateService = inject(UiStateService);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);

  registerForm!: FormGroup;
  isLoading: WritableSignal<boolean> = signal(false);
  errorMessage: WritableSignal<string | null> = signal(null);
  private errorMessageKey: WritableSignal<string | null> = signal(null);
  formSubmitted: WritableSignal<boolean> = signal(false);
  registrationSuccessMessage: WritableSignal<string | null> = signal(null);
  private registrationSuccessMessageKey: WritableSignal<string | null> = signal(null);

  @ViewChild('addressStreetInput') addressStreetInput!: ElementRef<HTMLInputElement>;
  private autocomplete: google.maps.places.Autocomplete | undefined;
  private autocompleteListener: google.maps.MapsEventListener | undefined;
  private subscriptions = new Subscription(); // Alle Subscriptions hier sammeln

  autocompleteOptions: google.maps.places.AutocompleteOptions = {
    componentRestrictions: { country: 'de' },
    types: ['address'],
    fields: ['address_components', 'formatted_address']
  };

  ngOnInit(): void {
    this.registerForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      addressStreet: ['', Validators.required],
      addressZip: ['', [Validators.required, Validators.pattern(/^\d{5}$/)]],
      addressCity: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
      newsletter: [false],
      acceptTerms: [false, Validators.requiredTrue]
    }, { validators: passwordMatchValidator });

    const langChangeSub = this.translocoService.langChanges$.pipe(
      startWith(this.translocoService.getActiveLang()),
      switchMap(lang =>
        this.translocoService.selectTranslate('registerPage.title', {}, lang)
      ),
      tap(translatedPageTitle => { // tap für Seiteneffekte verwenden
        this.titleService.setTitle(translatedPageTitle);
        // Fehlermeldungen und Erfolgsmeldung neu übersetzen, falls vorhanden
        if (this.errorMessageKey()) {
          this.errorMessage.set(this.translocoService.translate(this.errorMessageKey()!));
        }
        if (this.registrationSuccessMessageKey()) {
          const emailValue = this.registerForm.get('email')?.value || 'Ihrer E-Mail-Adresse'; // Fallback
          this.registrationSuccessMessage.set(this.translocoService.translate(this.registrationSuccessMessageKey()!, { email: emailValue }));
        }
      })
    ).subscribe(() => {
      this.cdr.detectChanges(); // UI Update anstoßen, nachdem alle Seiteneffekte durch sind
    });
    this.subscriptions.add(langChangeSub);
  }

  ngAfterViewInit(): void {
    this.initializeAutocomplete();
  }

  ngOnDestroy(): void {
      if (this.autocompleteListener) {
          google.maps.event.removeListener(this.autocompleteListener);
          this.autocompleteListener = undefined;
          console.log('Autocomplete listener removed.');
      }
      this.subscriptions.unsubscribe();
  }

  private initializeAutocomplete(): void {
    if (typeof google !== 'undefined' && google.maps && google.maps.places) {
        setTimeout(() => {
            if (this.addressStreetInput && this.addressStreetInput.nativeElement) {
                try {
                    this.autocomplete = new google.maps.places.Autocomplete(
                        this.addressStreetInput.nativeElement,
                        this.autocompleteOptions
                    );
                    if (this.autocomplete) {
                        this.autocompleteListener = this.autocomplete.addListener('place_changed', () => {
                            this.ngZone.run(() => { this.onPlaceChanged(); });
                        });
                    } else {
                        this.errorMessageKey.set('registerPage.errorAutocompleteInit');
                        this.errorMessage.set(this.translocoService.translate(this.errorMessageKey()!));
                    }
                } catch (error) {
                     this.errorMessageKey.set('registerPage.errorAutocompleteInitGeneral');
                     this.errorMessage.set(this.translocoService.translate(this.errorMessageKey()!));
                }
            } else {
                this.errorMessageKey.set('registerPage.errorAddressFieldNotFound');
                this.errorMessage.set(this.translocoService.translate(this.errorMessageKey()!));
            }
        }, 150);
    } else {
       this.errorMessageKey.set('registerPage.errorGoogleMapsLoad');
       this.errorMessage.set(this.translocoService.translate(this.errorMessageKey()!));
    }
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
            else if (types.includes('locality') || types.includes('postal_town')) { city = component.long_name; }
        });
        this.registerForm.patchValue({
          addressStreet: `${street} ${streetNumber}`.trim(),
          addressZip: zip,
          addressCity: city
        });
        this.addressStreet?.markAsTouched();
        this.addressZip?.markAsTouched();
        this.addressCity?.markAsTouched();
    }
  }

  get firstName() { return this.registerForm.get('firstName'); }
  get lastName() { return this.registerForm.get('lastName'); }
  get addressStreet() { return this.registerForm.get('addressStreet'); }
  get addressZip() { return this.registerForm.get('addressZip'); }
  get addressCity() { return this.registerForm.get('addressCity'); }
  get email() { return this.registerForm.get('email'); }
  get password() { return this.registerForm.get('password'); }
  get confirmPassword() { return this.registerForm.get('confirmPassword'); }
  get newsletter() { return this.registerForm.get('newsletter'); }
  get acceptTerms() { return this.registerForm.get('acceptTerms'); }

  openLoginOverlay(event: MouseEvent): void {
    event.preventDefault();
    this.uiStateService.openLoginOverlay();
  }

  async onSubmit(): Promise<void> {
    this.formSubmitted.set(true);
    this.errorMessage.set(null);
    this.errorMessageKey.set(null);
    this.registrationSuccessMessage.set(null);
    this.registrationSuccessMessageKey.set(null);
    this.registerForm.markAllAsTouched();

    if (this.registerForm.invalid) {
        this.focusFirstInvalidField();
        return;
    }
    this.isLoading.set(true);
    try {
      const formValue = this.registerForm.value;
      const userCredential = await this.authService.register(formValue.email, formValue.password);
      const user = userCredential.user;

      if (user) {
        await this.saveAdditionalUserData(user.uid, formValue);
        const successMsgKey = 'registerPage.successMessage';
        this.registrationSuccessMessageKey.set(successMsgKey);
        this.registrationSuccessMessage.set(
          this.translocoService.translate(successMsgKey, { email: formValue.email })
        );
        setTimeout(() => { this.router.navigate(['/']); }, 8000);
      } else {
        throw new Error(this.translocoService.translate('registerPage.errorUserRetrieval'));
      }
    } catch (error: any) {
        this.registrationSuccessMessage.set(null);
        this.registrationSuccessMessageKey.set(null);
        let errorKey = 'registerPage.errorGeneric';
        if (error.code === 'auth/email-already-in-use') {
            errorKey = 'registerPage.errorEmailInUse';
            this.email?.setErrors({ alreadyInUse: true });
        } else if (error.message === 'Firestore merge failed') {
            errorKey = 'registerPage.errorSavingUserData';
        }
        this.errorMessageKey.set(errorKey);
        this.errorMessage.set(this.translocoService.translate(errorKey));
    } finally {
      this.isLoading.set(false);
    }
  }

  private async saveAdditionalUserData(userId: string, formData: any): Promise<void> {
    if (!userId) { throw new Error('Benutzer-ID fehlt.'); }
    const userDocRef = doc(this.firestore, `users/${userId}`);
    const userData = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      address: {
        street: formData.addressStreet,
        zip: formData.addressZip,
        city: formData.addressCity,
        country: 'DE'
      },
      newsletterSubscribed: formData.newsletter,
      profileComplete: true,
      createdAt: serverTimestamp()
    };
    try {
      await setDoc(userDocRef, userData, { merge: true });
    } catch (error) {
      console.error("Fehler beim Speichern zusätzlicher Benutzerdaten:", error);
      throw new Error('Firestore merge failed');
    }
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
}