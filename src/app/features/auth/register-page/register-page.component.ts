// /src/app/features/auth/register-page/register-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, ViewChild, ElementRef, NgZone, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth.service';
import { Firestore, doc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { GoogleMapsModule } from '@angular/google-maps';
import { UiStateService } from '../../../shared/services/ui-state.service'; // +++ HINZUGEFÜGT +++

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
  imports: [CommonModule, ReactiveFormsModule, RouterModule, GoogleMapsModule],
  templateUrl: './register-page.component.html',
  styleUrls: ['./register-page.component.scss'] // Die SCSS-Datei bleibt die, die wir zuletzt korrigiert haben
})
export class RegisterPageComponent implements OnInit, AfterViewInit, OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private firestore = inject(Firestore);
  private ngZone = inject(NgZone);
  private uiStateService = inject(UiStateService); // +++ HINZUGEFÜGT: UiStateService injizieren +++

  registerForm!: FormGroup;
  isLoading: WritableSignal<boolean> = signal(false);
  errorMessage: WritableSignal<string | null> = signal(null);
  formSubmitted: WritableSignal<boolean> = signal(false);
  registrationSuccessMessage: WritableSignal<string | null> = signal(null);

  @ViewChild('addressStreetInput') addressStreetInput!: ElementRef<HTMLInputElement>;
  private autocomplete: google.maps.places.Autocomplete | undefined;
  private autocompleteListener: google.maps.MapsEventListener | undefined;

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
  }

  ngAfterViewInit(): void {
    this.initializeAutocomplete();
  }

  ngOnDestroy(): void {
      if (this.autocompleteListener) {
          google.maps.event.removeListener(this.autocompleteListener);
          console.log('Autocomplete listener removed.');
          this.autocompleteListener = undefined;
      }
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
                        this.errorMessage.set('Fehler bei der Initialisierung der Adresshilfe.');
                    }
                } catch (error) {
                     this.errorMessage.set('Adress-Autovervollständigung konnte nicht initialisiert werden.');
                }
            } else {
                this.errorMessage.set('Adressfeld für Autovervollständigung nicht gefunden.');
            }
        }, 150);
    } else {
       this.errorMessage.set('Google Maps konnte nicht geladen werden. Adress-Autovervollständigung ist nicht verfügbar.');
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

  // +++ NEU: Methode zum Öffnen des Login-Overlays +++
  openLoginOverlay(event: MouseEvent): void {
    event.preventDefault(); // Verhindert Standard-Link-Verhalten
    this.uiStateService.openLoginOverlay();
    // Optional: Navigiere zur Homepage, wenn die Registrierungsseite eine eigene Seite ist
    // und das Overlay über der Homepage erscheinen soll.
    // Wenn die Registrierungsseite bereits das Hauptlayout (Header/Footer) hat,
    // ist eine Navigation eventuell nicht nötig.
    // this.router.navigate(['/']);
  }

  async onSubmit(): Promise<void> {
    this.formSubmitted.set(true);
    this.errorMessage.set(null);
    this.registrationSuccessMessage.set(null);
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
        this.registrationSuccessMessage.set(
          `Vielen Dank für Ihre Registrierung! Eine Bestätigungs-E-Mail wurde an ${formValue.email} gesendet. Bitte überprüfen Sie Ihr Postfach (auch den Spam-Ordner) und klicken Sie auf den Link, um Ihr Konto zu aktivieren.`
        );
        setTimeout(() => { this.router.navigate(['/']); }, 8000);
      } else {
        throw new Error('Benutzer konnte nach der Registrierung nicht abgerufen werden.');
      }
    } catch (error: any) {
        this.registrationSuccessMessage.set(null);
        this.errorMessage.set(error?.message || 'Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.');
        if (error.code === 'auth/email-already-in-use') {
            this.errorMessage.set('Diese E-Mail-Adresse wird bereits verwendet.');
            this.email?.setErrors({ alreadyInUse: true });
        }
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
      profileComplete: true
    };
    try {
      await setDoc(userDocRef, userData, { merge: true });
    } catch (error) {
      this.errorMessage.set("Zusätzliche Benutzerdaten konnten nicht gespeichert werden.");
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