// /src/app/features/auth/register-page/register-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, ViewChild, ElementRef, NgZone, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors, FormControl } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth.service';
import { Firestore, doc, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { GoogleMapsModule } from '@angular/google-maps';
import { environment } from '../../../../environments/environment'; // Import environment

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
  styleUrl: './register-page.component.scss'
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

  // Google Client ID und Autocomplete Optionen
  private googleClientId = environment.googleClientId;
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

    // Prüfung auf Client ID
    if (!this.googleClientId) {
        console.error('RegisterPage: Google Client ID ist nicht in den Environment-Variablen konfiguriert!');
    }
  }

  ngAfterViewInit(): void {
    // Initialisiere Autocomplete, nachdem die View (und das Input-Element) initialisiert wurde
    this.initializeAutocomplete();
  }

  ngOnDestroy(): void {
      // Listener sauber entfernen, um Memory Leaks zu vermeiden
      if (this.autocompleteListener) {
          this.autocompleteListener.remove();
          console.log('Autocomplete listener removed.');
      }
  }

  // --- initializeAutocomplete ANGEPASST mit setTimeout und try-catch ---
  private initializeAutocomplete(): void {
    // Prüfen, ob Google API Skript geladen ist
    if (typeof google !== 'undefined' && google.maps && google.maps.places) {
        // Kurze Verzögerung, um sicherzustellen, dass das DOM-Element (#addressStreetInput) bereit ist
        setTimeout(() => {
            // Erneute Prüfung, ob das ElementRef und das nativeElement existieren
            if (this.addressStreetInput && this.addressStreetInput.nativeElement) {
                console.log('Attempting to initialize Autocomplete on element:', this.addressStreetInput.nativeElement);
                try {
                    // Instanziiere Autocomplete
                    this.autocomplete = new google.maps.places.Autocomplete(
                        this.addressStreetInput.nativeElement, // Direkt das native HTMLInputElement übergeben
                        this.autocompleteOptions
                    );

                    // Füge den Listener hinzu, der auf Änderungen reagiert
                    // Verwende '!' da wir sicher sind, dass autocomplete hier initialisiert wurde (innerhalb try)
                    this.autocompleteListener = this.autocomplete!.addListener('place_changed', () => {
                        // Führe die Verarbeitung innerhalb der Angular Zone aus, damit Änderungen erkannt werden
                        this.ngZone.run(() => {
                            this.onPlaceChanged();
                        });
                    });
                    console.log('Google Maps Autocomplete initialized successfully.');

                } catch (error) {
                     // Fängt Fehler bei der Instanziierung ab (z.B. wenn element doch kein Input war)
                     console.error('Error during Autocomplete instantiation:', error);
                     this.errorMessage.set('Adress-Autovervollständigung konnte nicht initialisiert werden.');
                }
            } else {
                // Fall, falls das Element auch nach dem Timeout nicht gefunden wird
                console.error('RegisterPage: Address input element (#addressStreetInput) not found AFTER timeout. Cannot initialize Autocomplete.');
                this.errorMessage.set('Adressfeld für Autovervollständigung nicht gefunden.');
            }
        }, 100); // 100ms Verzögerung - kann angepasst werden, falls nötig

    } else {
       // Fall, falls das Google Maps Skript nicht geladen wurde
       console.error('RegisterPage: Google Maps Places API script not loaded yet. Cannot initialize Autocomplete.');
       this.errorMessage.set('Google Maps konnte nicht geladen werden. Adress-Autovervollständigung ist nicht verfügbar.');
       // Optional: Erneut versuchen nach längerer Verzögerung
       // setTimeout(() => this.initializeAutocomplete(), 1500);
    }
  }
  // --- ENDE initializeAutocomplete ---

  // Methode zur Verarbeitung der ausgewählten Adresse
  private onPlaceChanged(): void {
    if (!this.autocomplete) return;
    const place = this.autocomplete.getPlace();

    if (place?.address_components) {
        console.log('Place changed:', place);
        let street = '', streetNumber = '', zip = '', city = '';
        // Extrahiere Adresskomponenten
        place.address_components.forEach(component => {
            const types = component.types;
            if (types.includes('street_number')) { streetNumber = component.long_name; }
            else if (types.includes('route')) { street = component.long_name; }
            else if (types.includes('postal_code')) { zip = component.long_name; }
            else if (types.includes('locality') || types.includes('postal_town')) { city = component.long_name; }
        });
        // Aktualisiere Formularfelder
        this.registerForm.patchValue({
          addressStreet: `${street} ${streetNumber}`.trim(),
          addressZip: zip,
          addressCity: city
        });
        // Markiere Felder als berührt
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
    if (this.registerForm.invalid) { return; }
    this.isLoading.set(true);
    try {
      const formValue = this.registerForm.value;
      const userCredential = await this.authService.register(formValue.email, formValue.password);
      const user = userCredential.user;
      if (user) {
        await this.saveAdditionalUserData(user.uid, formValue);
        this.router.navigate(['/']);
      } else { throw new Error('Benutzer konnte nicht abgerufen werden.'); }
    } catch (error: any) {
        console.error('Registrierungsfehler:', error);
        let message = 'Ein unbekannter Fehler ist aufgetreten.';
        switch (error.code) { /* ... */ }
        if (this.errorMessage() === null) { this.errorMessage.set(message); }
    } finally { this.isLoading.set(false); }
  }

  /** Speichert zusätzliche Benutzerdaten in Firestore */
  private async saveAdditionalUserData(userId: string, formData: any): Promise<void> {
      const userDocRef = doc(this.firestore, `users/${userId}`);
      const userData = { /* ... profileComplete: true ... */ };
      try { await setDoc(userDocRef, userData); }
      catch (error) { /* ... */ throw new Error('Firestore save failed'); }
  }
}