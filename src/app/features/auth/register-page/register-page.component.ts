// /src/app/features/auth/register-page/register-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, ViewChild, ElementRef, NgZone, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth.service';
import { Firestore, doc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { GoogleMapsModule } from '@angular/google-maps'; // Behalten, falls noch für was anderes genutzt, sonst prüfen
// import { environment } from '../../../../environments/environment'; // Wird nicht verwendet, kann entfernt werden

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
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private firestore = inject(Firestore);
  private ngZone = inject(NgZone);

  registerForm!: FormGroup;
  isLoading: WritableSignal<boolean> = signal(false);
  errorMessage: WritableSignal<string | null> = signal(null);
  formSubmitted: WritableSignal<boolean> = signal(false);

  // +++ NEU: Signal für Erfolgsmeldung +++
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
                console.log('Attempting to initialize Autocomplete on element:', this.addressStreetInput.nativeElement);
                try {
                    this.autocomplete = new google.maps.places.Autocomplete(
                        this.addressStreetInput.nativeElement,
                        this.autocompleteOptions
                    );
                    if (this.autocomplete) {
                        this.autocompleteListener = this.autocomplete.addListener('place_changed', () => {
                            this.ngZone.run(() => {
                                this.onPlaceChanged();
                            });
                        });
                        console.log('Google Maps Autocomplete initialized successfully.');
                    } else {
                        console.error('Autocomplete instance is unexpectedly undefined after instantiation.');
                        this.errorMessage.set('Fehler bei der Initialisierung der Adresshilfe.');
                    }
                } catch (error) {
                     console.error('Error during Autocomplete instantiation:', error);
                     this.errorMessage.set('Adress-Autovervollständigung konnte nicht initialisiert werden.');
                }
            } else {
                console.error('RegisterPage: Address input element (#addressStreetInput) not found AFTER timeout.');
                this.errorMessage.set('Adressfeld für Autovervollständigung nicht gefunden.');
            }
        }, 150);
    } else {
       console.error('RegisterPage: Google Maps Places API script not loaded yet.');
       this.errorMessage.set('Google Maps konnte nicht geladen werden. Adress-Autovervollständigung ist nicht verfügbar.');
    }
  }

  private onPlaceChanged(): void {
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
        this.registerForm.patchValue({
          addressStreet: `${street} ${streetNumber}`.trim(),
          addressZip: zip,
          addressCity: city
        });
        this.addressStreet?.markAsTouched();
        this.addressZip?.markAsTouched();
        this.addressCity?.markAsTouched();
    } else {
        console.warn('No address components available for selected place.');
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

  async onSubmit(): Promise<void> {
    this.formSubmitted.set(true);
    this.errorMessage.set(null);
    // +++ WICHTIG: Erfolgsmeldung zurücksetzen, falls vorher eine da war +++
    this.registrationSuccessMessage.set(null);
    this.registerForm.markAllAsTouched();

    if (this.registerForm.invalid) {
        console.log('Registration form is invalid:', this.registerForm.errors);
        this.focusFirstInvalidField();
        return;
    }

    this.isLoading.set(true);

    try {
      const formValue = this.registerForm.value;
      // Der AuthService.register sendet jetzt die Bestätigungs-E-Mail
      const userCredential = await this.authService.register(formValue.email, formValue.password);
      const user = userCredential.user;

      if (user) {
        // Die _initializeFirestoreData im AuthService kümmert sich um das Speichern der Basisdaten inkl. emailVerified.
        // Die zusätzliche Speicherung hier ist redundant und kann ggf. angepasst werden,
        // um nur die spezifischen Adressdaten etc. zu speichern, die der AuthService nicht kennt.
        // Für den Moment lassen wir saveAdditionalUserData, da es die profileComplete-Logik enthält.
        await this.saveAdditionalUserData(user.uid, formValue); // Stellt sicher, dass profileComplete richtig gesetzt wird.

        console.log('Registration and Firestore save successful.');
        // +++ NEU: Erfolgsmeldung setzen und Formular ausblenden/deaktivieren +++
        this.registrationSuccessMessage.set(
          `Vielen Dank für Ihre Registrierung! Eine Bestätigungs-E-Mail wurde an ${formValue.email} gesendet. Bitte überprüfen Sie Ihr Postfach (auch den Spam-Ordner) und klicken Sie auf den Link, um Ihr Konto zu aktivieren.`
        );
        // Optional: Formular deaktivieren, um weitere Eingaben zu verhindern
        // this.registerForm.disable(); // Oder einzelne Felder, oder durch *ngIf steuern (siehe HTML)

        // Automatische Weiterleitung nach einer Verzögerung
        setTimeout(() => {
          this.router.navigate(['/']); // Zur Homepage oder Login-Seite
        }, 8000); // 8 Sekunden warten, damit der Nutzer die Nachricht lesen kann

      } else {
        throw new Error('Benutzer konnte nach der Registrierung nicht abgerufen werden.');
      }
    } catch (error: any) {
        console.error('Registrierungsfehler im Component:', error);
        // Erfolgsmeldung entfernen, falls ein Fehler auftritt
        this.registrationSuccessMessage.set(null);
        this.errorMessage.set(error?.message || 'Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.');
        if (error.code === 'auth/email-already-in-use') {
            this.errorMessage.set('Diese E-Mail-Adresse wird bereits verwendet.');
            this.email?.setErrors({ alreadyInUse: true });
        }
    } finally {
      this.isLoading.set(false);
      // Wichtig: isLoading erst hier auf false setzen, damit der Ladezustand während der Erfolgsmeldung nicht aktiv ist,
      // falls die Erfolgsmeldung das Formular nicht ausblendet.
    }
  }

  private async saveAdditionalUserData(userId: string, formData: any): Promise<void> {
    // Diese Methode ist jetzt teilweise redundant, da _initializeFirestoreData im AuthService
    // bereits Standarddaten schreibt. Wir müssen sicherstellen, dass keine Konflikte entstehen
    // und profileComplete: true korrekt gesetzt wird.
    // Der AuthService setzt profileComplete abhängig von den übergebenen `additionalData`.
    // Wenn wir hier `profileComplete: true` explizit setzen wollen, ist das ok.
    if (!userId) {
        console.error("Cannot save user data without userId");
        throw new Error('Benutzer-ID fehlt.');
    }
    const userDocRef = doc(this.firestore, `users/${userId}`);
    const userData = {
      // uid und email werden bereits vom AuthService._initializeFirestoreData gesetzt.
      // Wir fügen hier nur hinzu oder überschreiben, was spezifisch für dieses Formular ist.
      firstName: formData.firstName,
      lastName: formData.lastName,
      address: {
        street: formData.addressStreet,
        zip: formData.addressZip,
        city: formData.addressCity,
        country: 'DE' // Standardmäßig auf DE
      },
      newsletterSubscribed: formData.newsletter,
      // createdAt und provider werden vom AuthService gesetzt.
      profileComplete: true // Da alle Daten hier erfasst wurden.
    };
    console.log('Merging additional user data to Firestore:', userData);
    try {
      // Mit { merge: true } stellen wir sicher, dass wir bestehende Felder vom AuthService nicht ungewollt löschen.
      await setDoc(userDocRef, userData, { merge: true });
      console.log('User data successfully merged to Firestore for UID:', userId);
    } catch (error) {
      console.error('Error merging additional user data to Firestore:', error);
      this.errorMessage.set("Zusätzliche Benutzerdaten konnten nicht gespeichert werden.");
      throw new Error('Firestore merge failed');
    }
  }

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
}