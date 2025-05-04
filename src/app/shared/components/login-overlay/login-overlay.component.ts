// /src/app/shared/components/login-overlay/login-overlay.component.ts
import { Component, OnInit, inject, signal, WritableSignal, AfterViewInit, OnDestroy, ViewChild, ElementRef, NgZone } from '@angular/core'; // Imports erweitert für GSI
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { UiStateService } from '../../services/ui-state.service';
import { environment } from '../../../../environments/environment'; // Environment importieren

// Globale Variable für Google deklarieren
declare var google: any;

@Component({
  selector: 'app-login-overlay',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule], // GoogleMapsModule hier nicht nötig
  templateUrl: './login-overlay.component.html',
  styleUrl: './login-overlay.component.scss'
})
export class LoginOverlayComponent implements OnInit, AfterViewInit, OnDestroy { // AfterViewInit, OnDestroy implementieren
  // Services injizieren
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private uiStateService = inject(UiStateService);
  private ngZone = inject(NgZone); // NgZone für GIS Callback

  // Formular-Gruppe
  loginForm!: FormGroup;

  // Signale für UI-Zustand
  isLoading: WritableSignal<boolean> = signal(false); // Für E-Mail/Passwort & GSI
  errorMessage: WritableSignal<string | null> = signal(null);
  formSubmitted: WritableSignal<boolean> = signal(false);

  // --- NEU: ViewChild für Google Button Container ---
  @ViewChild('googleBtnContainerOverlay') googleBtnContainer!: ElementRef<HTMLDivElement>;

  // --- NEU: Google Client ID aus Environment ---
  private googleClientId = environment.googleClientId;

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });

    if (!this.googleClientId) {
        console.error('LoginOverlay: Google Client ID ist nicht konfiguriert!');
    }
  }

  ngAfterViewInit(): void {
      // Initialisiere GSI Button im Overlay
      this.initializeGoogleSignIn();
  }

  ngOnDestroy(): void {
      // Ggf. GIS Cleanup, falls nötig (siehe LoginPageComponent)
      // if (typeof google !== 'undefined') { google.accounts.id.cancel(); }
  }


  // --- Formular-Getter ---
  get email() { return this.loginForm.get('email'); }
  get password() { return this.loginForm.get('password'); }

  // Submit für E-Mail/Passwort
  async onSubmit(): Promise<void> {
    this.formSubmitted.set(true);
    this.errorMessage.set(null);
    this.loginForm.markAllAsTouched();

    if (this.loginForm.invalid) { return; }

    this.isLoading.set(true);
    try {
      await this.authService.login(this.loginForm.value.email, this.loginForm.value.password);
      console.log('Login aus Overlay erfolgreich.');
      this.closeOverlay(); // Overlay schließen
    } catch (error: any) {
      console.error('Login-Overlay fehlgeschlagen:', error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-email' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
         this.errorMessage.set('Ungültige E-Mail-Adresse oder falsches Passwort.');
      } else {
         this.errorMessage.set('Ein unbekannter Fehler ist beim Login aufgetreten.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  // --- NEU: Initialisierung für Google Identity Services im Overlay ---
  private initializeGoogleSignIn(): void {
      if (!this.googleClientId) return;

      if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
          console.error('LoginOverlay: Google Identity Services client library not loaded.');
          // setTimeout(() => this.initializeGoogleSignIn(), 500); // Erneut versuchen?
          return;
      }

      try {
          google.accounts.id.initialize({
              client_id: this.googleClientId,
              callback: this.handleGoogleCredentialResponse.bind(this)
              // Wichtig: Der Callback wird hier definiert
          });

          if (this.googleBtnContainer?.nativeElement) {
               google.accounts.id.renderButton(
                 this.googleBtnContainer.nativeElement,
                 { theme: "outline", size: "large", type: 'standard', text: 'signin_with' }
               );
               console.log('LoginOverlay: Google Button gerendert.');
          } else {
              console.error('LoginOverlay: Google Button Container nicht gefunden.');
          }
      } catch (error) {
          console.error("LoginOverlay: Fehler bei der Initialisierung von Google Sign-In:", error);
      }
    }

    // --- NEU: Callback für Google Credential Response im Overlay ---
    private async handleGoogleCredentialResponse(response: any): Promise<void> {
      console.log("LoginOverlay: Google Credential Response erhalten:", response);
      this.isLoading.set(true); // Ladevorgang starten
      this.errorMessage.set(null);

      if (!response?.credential) {
          console.error('LoginOverlay: Ungültige Credential Response von Google.');
          this.errorMessage.set('Anmeldung mit Google fehlgeschlagen (ungültige Antwort).');
          this.isLoading.set(false);
          return;
      }

      this.ngZone.run(async () => {
          try {
              await this.authService.signInWithGoogleCredential(response.credential);
              console.log('LoginOverlay: Firebase Login mit Google Credential erfolgreich.');
              this.closeOverlay(); // Overlay nach Erfolg schließen
              // Keine Navigation, User bleibt auf der Seite
          } catch (error) {
              console.error('LoginOverlay: Firebase Login mit Google Credential fehlgeschlagen:', error);
              this.errorMessage.set('Anmeldung mit Google bei Firebase fehlgeschlagen.');
          } finally {
              this.isLoading.set(false); // Ladevorgang beenden
          }
      });
    }
    // --- ENDE NEU ---

  /** Schließt das Login-Overlay */
  closeOverlay(): void {
    this.uiStateService.closeLoginOverlay();
  }

  /** Navigiert zur Registrierungsseite und schließt das Overlay */
  navigateToRegister(): void {
    this.closeOverlay();
    this.router.navigate(['/register']);
  }

   /** Navigiert zur "Passwort vergessen"-Seite und schließt das Overlay */
   navigateToForgotPassword(): void {
     this.closeOverlay();
     // TODO: Route implementieren
     console.warn('Navigation zu /forgot-password noch nicht implementiert.');
   }
}