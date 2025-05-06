// /src/app/features/auth/register-page/register-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, ViewChild, ElementRef, NgZone, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth.service';
import { Firestore, doc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { GoogleMapsModule } from '@angular/google-maps';
import { environment } from '../../../../environments/environment';

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
  styleUrls: ['./register-page.component.scss']
})
export class RegisterPageComponent implements OnInit, AfterViewInit, OnDestroy {
  // Services injizieren
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private firestore = inject(Firestore);
  private ngZone = inject(NgZone);

  // Formular-Gruppe
  registerForm!: FormGroup;

  // Signale für UI-Zustand
  isLoading: WritableSignal<boolean> = signal(false);
  errorMessage: WritableSignal<string | null> = signal(null);
  formSubmitted: WritableSignal<boolean> = signal(false);

  // ViewChild für das Adress-Input-Element
  @ViewChild('addressStreetInput') addressStreetInput!: ElementRef<HTMLInputElement>;
  private autocomplete: google.maps.places.Autocomplete | undefined;
  private autocompleteListener: google.maps.MapsEventListener | undefined;

  // Google Autocomplete Optionen
  autocompleteOptions: google.maps.places.AutocompleteOptions = {
    componentRestrictions: { country: 'de' },
    types: ['address'],
    fields: ['address_components', 'formatted_address']
  };

  ngOnInit(): void {
    // Formular-Erstellung
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
    // Initialisiere Autocomplete, nachdem die View bereit ist
    this.initializeAutocomplete();
  }

  ngOnDestroy(): void {
      // Entferne den Listener sicher, wenn er existiert
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
                console.log('Attempting to initialize Autocomplete on element:', this.addressStreetInput.nativeElement);
                try {
                    // Instanziiere Autocomplete
                    this.autocomplete = new google.maps.places.Autocomplete(
                        this.addressStreetInput.nativeElement,
                        this.autocompleteOptions
                    );

                    // === HIER DIE ÄNDERUNG: Zusätzliche if-Prüfung ===
                    if (this.autocomplete) {
                        // Listener hinzufügen und die Referenz speichern
                        this.autocompleteListener = this.autocomplete.addListener('place_changed', () => {
                            this.ngZone.run(() => {
                                this.onPlaceChanged();
                            });
                        });
                        console.log('Google Maps Autocomplete initialized successfully.');
                    } else {
                        // Sollte nicht passieren, aber sicher ist sicher
                        console.error('Autocomplete instance is unexpectedly undefined after instantiation.');
                        this.errorMessage.set('Fehler bei der Initialisierung der Adresshilfe.');
                    }
                    // ===============================================

                } catch (error) {
                     console.error('Error during Autocomplete instantiation:', error);
                     this.errorMessage.set('Adress-Autovervollständigung konnte nicht initialisiert werden.');
                }
            } else {
                console.error('RegisterPage: Address input element (#addressStreetInput) not found AFTER timeout.');
                this.errorMessage.set('Adressfeld für Autovervollständigung nicht gefunden.');
            }
        }, 150); // Leichte Verzögerung

    } else {
       console.error('RegisterPage: Google Maps Places API script not loaded yet.');
       this.errorMessage.set('Google Maps konnte nicht geladen werden. Adress-Autovervollständigung ist nicht verfügbar.');
    }
  }

  private onPlaceChanged(): void {
    // Sicherstellen, dass Autocomplete initialisiert wurde
    if (!this.autocomplete) {
      console.warn('onPlaceChanged called but autocomplete instance is undefined.');
      return;
    }
    const place = this.autocomplete.getPlace();

    if (place?.address_components) {
        console.log('Place changed:', place);
        let street = '', streetNumber = '', zip = '', city = '';
        place.address_components.forEach(component => {
            const types = component.types;
            if (types.includes('street_number')) { streetNumber = component.long_name; }
            else if (types.includes('route')) { street = component.long_name; }
            else if (types.includes('postal_code')) { zip = component.long_name; }
            else if (types.includes('locality') || types.includes('postal_town')) { city = component.long_name; }
        });
        // Formularfelder aktualisieren
        this.registerForm.patchValue({
          addressStreet: `${street} ${streetNumber}`.trim(),
          addressZip: zip,
          addressCity: city
        });
        // Felder als berührt markieren
        this.addressStreet?.markAsTouched();
        this.addressZip?.markAsTouched();
        this.addressCity?.markAsTouched();
    } else {
        console.warn('No address components available for selected place.');
    }
  }

  // --- Formular-Getter ---
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

  // --- onSubmit Methode ---
  async onSubmit(): Promise<void> {
    this.formSubmitted.set(true);
    this.errorMessage.set(null);
    this.registerForm.markAllAsTouched();

    if (this.registerForm.invalid) {
        console.log('Registration form is invalid:', this.registerForm.errors);
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
        console.log('Registration and Firestore save successful. Navigating...');
        this.router.navigate(['/']);
      } else {
        throw new Error('Benutzer konnte nach der Registrierung nicht abgerufen werden.');
      }
    } catch (error: any) {
        console.error('Registrierungsfehler im Component:', error);
        this.errorMessage.set(error?.message || 'Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.');
        if (error.code === 'auth/email-already-in-use') {
            this.errorMessage.set('Diese E-Mail-Adresse wird bereits verwendet.');
            this.email?.setErrors({ alreadyInUse: true });
        }
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Speichert zusätzliche Benutzerdaten in Firestore */
  private async saveAdditionalUserData(userId: string, formData: any): Promise<void> {
    if (!userId) {
        console.error("Cannot save user data without userId");
        throw new Error('Benutzer-ID fehlt.');
    }
    const userDocRef = doc(this.firestore, `users/${userId}`);
    const userData = {
      uid: userId,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      address: {
        street: formData.addressStreet,
        zip: formData.addressZip,
        city: formData.addressCity,
        country: 'DE'
      },
      newsletterSubscribed: formData.newsletter,
      createdAt: serverTimestamp(),
      provider: 'password',
      profileComplete: true
    };
    console.log('Saving additional user data to Firestore:', userData);
    try {
      await setDoc(userDocRef, userData);
      console.log('User data successfully saved to Firestore for UID:', userId);
    } catch (error) {
      console.error('Error saving additional user data to Firestore:', error);
      this.errorMessage.set("Zusätzliche Benutzerdaten konnten nicht gespeichert werden.");
      throw new Error('Firestore save failed');
    }
  }

  /** Fokussiert das erste invalide Formularfeld */
  private focusFirstInvalidField(): void {
    const controls = this.registerForm.controls;
    for (const name in controls) {
        if (controls[name].invalid) {
            const element = document.querySelector(`[formControlName="${name}"]`);
            if (element instanceof HTMLElement) {
                element.focus();
                break;
            }
        }
    }
  }
} // Ende der Komponente