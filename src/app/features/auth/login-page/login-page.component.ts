// /src/app/features/auth/login-page/login-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, AfterViewInit, OnDestroy, ViewChild, ElementRef, NgZone } from '@angular/core'; // Imports erweitert
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth.service';
import { environment } from '../../../../environments/environment'; // Environment für API Key importieren

// Globale Variable für Google deklarieren
declare var google: any;

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule], // GoogleMapsModule hier nicht mehr nötig
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss'
})
export class LoginPageComponent implements OnInit, AfterViewInit, OnDestroy { // AfterViewInit, OnDestroy
  // Services injizieren
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private ngZone = inject(NgZone); // NgZone für GIS Callback

  // Formular-Gruppe
  loginForm!: FormGroup;

  // Signale für UI-Zustand
  isLoading: WritableSignal<boolean> = signal(false);
  errorMessage: WritableSignal<string | null> = signal(null);
  formSubmitted: WritableSignal<boolean> = signal(false);

  // --- NEU: ViewChild für Google Button Container ---
  @ViewChild('googleBtnContainer') googleBtnContainer!: ElementRef<HTMLDivElement>;

  // --- NEU: Google Client ID aus Environment ---
  private googleClientId = environment.googleClientId; // Annahme: Key in environment.ts hinzugefügt

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });

    // --- NEU: Prüfung, ob Client ID konfiguriert ist ---
    if (!this.googleClientId) {
        console.error('Google Client ID ist nicht in den Environment-Variablen konfiguriert!');
        // Optional: Fehlermeldung für den User setzen
    }
  }

  ngAfterViewInit(): void {
    // Initialisiere Google Identity Services Button erst, wenn Container da ist
    this.initializeGoogleSignIn();
  }

  ngOnDestroy(): void {
    // Optional: GIS Cleanup falls nötig (normalerweise nicht erforderlich)
    // if (typeof google !== 'undefined') {
    //    google.accounts.id.cancel();
    // }
  }

  // Formular-Getter
  get email() { return this.loginForm.get('email'); }
  get password() { return this.loginForm.get('password'); }

  // Submit für E-Mail/Passwort Login (bleibt gleich)
  async onSubmit(): Promise<void> { /* ... */ }

  // --- NEU: Initialisierung für Google Identity Services ---
  private initializeGoogleSignIn(): void {
    if (!this.googleClientId) return; // Nicht initialisieren ohne Client ID

    // Prüfen, ob das globale 'google' Objekt verfügbar ist
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
        console.error('Google Identity Services client library not loaded.');
        // Optional: Erneut versuchen nach kurzer Verzögerung
        // setTimeout(() => this.initializeGoogleSignIn(), 500);
        return;
    }

    try {
        // GIS initialisieren
        google.accounts.id.initialize({
            client_id: this.googleClientId,
            callback: this.handleGoogleCredentialResponse.bind(this) // Callback binden!
            // auto_select: true, // Optional: Versucht automatischen Login ohne Klick
            // login_uri: ... // Optional: Wenn Backend-Login verwendet wird
        });

        // Den Button im Container rendern
        if (this.googleBtnContainer?.nativeElement) {
             google.accounts.id.renderButton(
               this.googleBtnContainer.nativeElement,
               { theme: "outline", size: "large", type: 'standard', text: 'signin_with' } // Button-Optionen
             );
             // Optional: One Tap Prompt anzeigen (wenn gewünscht)
             // google.accounts.id.prompt();
        } else {
            console.error('Google Button Container nicht gefunden.');
        }
    } catch (error) {
        console.error("Fehler bei der Initialisierung von Google Sign-In:", error);
    }
  }

  // --- NEU: Callback für Google Credential Response ---
  private async handleGoogleCredentialResponse(response: any): Promise<void> {
    console.log("Google Credential Response erhalten:", response);
    this.isLoading.set(true); // Ladevorgang starten
    this.errorMessage.set(null);

    if (!response?.credential) {
        console.error('Ungültige Credential Response von Google.');
        this.errorMessage.set('Anmeldung mit Google fehlgeschlagen (ungültige Antwort).');
        this.isLoading.set(false);
        return;
    }

    // Wichtig: Führe Firebase Login innerhalb der Angular Zone aus
    this.ngZone.run(async () => {
        try {
            // Rufe eine NEUE Methode im AuthService auf, um mit dem Credential anzumelden
            await this.authService.signInWithGoogleCredential(response.credential);
            console.log('Firebase Login mit Google Credential erfolgreich.');
            // Navigation nach Erfolg
            this.router.navigate(['/']); // Zur Startseite
        } catch (error) {
            console.error('Firebase Login mit Google Credential fehlgeschlagen:', error);
            this.errorMessage.set('Anmeldung mit Google bei Firebase fehlgeschlagen.');
        } finally {
            this.isLoading.set(false); // Ladevorgang beenden
        }
    });
  }

  // Die alte signInWithGoogle Methode wird ENTFERNT
  // async signInWithGoogle(): Promise<void> { /* ... alte Logik mit signInWithPopup ... */ }

}