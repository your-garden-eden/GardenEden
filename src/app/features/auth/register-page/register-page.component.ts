// /src/app/features/auth/register-page/register-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, ViewChild, ElementRef, NgZone, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors, FormControl } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth.service';
import { Firestore, doc, setDoc, serverTimestamp } from '@angular/fire/firestore'; // serverTimestamp importiert
import { GoogleMapsModule } from '@angular/google-maps';

// --- KORRIGIERTER Custom Validator für Passwort-Match ---
export function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password');
  const confirmPassword = control.get('confirmPassword');

  // Wenn Controls noch nicht initialisiert oder eines fehlt, keinen Fehler werfen
  if (!password || !confirmPassword || !password.value || !confirmPassword.value) {
    return null;
  }

  // Fehler zurückgeben, wenn Passwörter nicht übereinstimmen
  return password.value === confirmPassword.value ? null : { passwordsMismatch: true };
}
// --- ENDE KORREKTUR ---

// Globale Variable für google
declare var google: any;

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, GoogleMapsModule],
  templateUrl: './register-page.component.html',
  styleUrl: './register-page.component.scss'
})
export class RegisterPageComponent implements OnInit, AfterViewInit, OnDestroy {
  // Services, Formular, Signale, ViewChild, Autocomplete...
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private firestore = inject(Firestore);
  private ngZone = inject(NgZone);

  registerForm!: FormGroup;
  isLoading: WritableSignal<boolean> = signal(false);
  errorMessage: WritableSignal<string | null> = signal(null);
  formSubmitted: WritableSignal<boolean> = signal(false);

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
  ngAfterViewInit(): void { this.initializeAutocomplete(); }
  ngOnDestroy(): void { if (this.autocompleteListener) { this.autocompleteListener.remove(); } }

  private initializeAutocomplete(): void { /* ... wie zuvor ... */
      if (typeof google !== 'undefined' && google.maps && google.maps.places && this.addressStreetInput) {
         this.autocomplete = new google.maps.places.Autocomplete(/* ... */);
         this.autocompleteListener = this.autocomplete!.addListener('place_changed', () => {
            this.ngZone.run(() => { this.onPlaceChanged(); });
         });
      } else { /* ... */ }
  }
  private onPlaceChanged(): void { /* ... wie zuvor ... */
      if (!this.autocomplete) return;
      const place = this.autocomplete.getPlace();
      if (place?.address_components) { /* ... Extraktion ... */
         this.registerForm.patchValue({ /* ... */ });
         /* ... markAsTouched ... */
      } else { /* ... */ }
  }

  // --- KORRIGIERTE Formular-Getter ---
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
  // --- ENDE KORREKTUR ---

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
        await this.saveAdditionalUserData(user.uid, formValue); // Ruft korrigierte Methode auf
        this.router.navigate(['/']);
      } else { throw new Error('Benutzer konnte nicht abgerufen werden.'); }
    } catch (error: any) {
        console.error('Registrierungsfehler:', error);
        let message = 'Ein unbekannter Fehler ist aufgetreten.';
        switch (error.code) { /* ... */ }
        if (this.errorMessage() === null) { this.errorMessage.set(message); }
    }
    finally { this.isLoading.set(false); }
  }

  /** Speichert zusätzliche Benutzerdaten in Firestore (mit profileComplete: true). */
  private async saveAdditionalUserData(userId: string, formData: any): Promise<void> {
      const userDocRef = doc(this.firestore, `users/${userId}`);
      const userData = {
        uid: userId,
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        address: {
          street: formData.addressStreet,
          zip: formData.addressZip,
          city: formData.addressCity
        },
        newsletterSubscribed: formData.newsletter,
        createdAt: serverTimestamp(),
        provider: 'password',
        profileComplete: true // <<< Wichtig für normale Registrierung
      };
      try {
        await setDoc(userDocRef, userData);
        console.log('Zusätzliche Benutzerdaten erfolgreich in Firestore gespeichert.');
      } catch (error) {
        console.error('Fehler beim Speichern der Benutzerdaten in Firestore:', error);
        this.errorMessage.set('Registrierung war erfolgreich, aber Profildaten konnten nicht gespeichert werden.');
        throw new Error('Firestore save failed');
      }
  }
}