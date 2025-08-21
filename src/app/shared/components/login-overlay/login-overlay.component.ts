// /src/app/shared/components/login-overlay/login-overlay.component.ts
import { Component, OnInit, inject, signal, WritableSignal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { UiStateService } from '../../services/ui-state.service';
import { TranslocoModule } from '@ngneat/transloco';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-login-overlay',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslocoModule],
  templateUrl: './login-overlay.component.html',
  styleUrls: ['./login-overlay.component.scss']
})
export class LoginOverlayComponent implements OnInit, OnDestroy {
  // --- Services & Injections ---
  private fb = inject(FormBuilder);
  public authService = inject(AuthService);
  private router = inject(Router);
  private uiStateService = inject(UiStateService);

  // --- Forms & State ---
  loginForm!: FormGroup;
  forgotPasswordForm!: FormGroup;
  forgotUsernameForm!: FormGroup; // NEU
  public viewMode: WritableSignal<'login' | 'forgotPassword' | 'forgotUsername'> = signal('login'); // ERWEITERT
  formSubmitted: WritableSignal<boolean> = signal(false);
  
  private subscriptions = new Subscription();

  ngOnInit(): void {
    // KORRIGIERT: Das Feld heißt jetzt 'username' für mehr Klarheit im Code
    this.loginForm = this.fb.group({
      username: ['', [Validators.required]],
      password: ['', Validators.required]
    });

    this.forgotPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });

    // NEU: Formular für "Benutzername vergessen"
    this.forgotUsernameForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  ngOnDestroy(): void {
      this.subscriptions.unsubscribe();
      // Zustand beim Verlassen der Komponente zurücksetzen
      this.authService.authError.set(null);
      this.authService.successMessage.set(null);
  }

  // --- GETTERS FÜR FORMULARFELDER ---
  get username(): FormControl { return this.loginForm.get('username') as FormControl; } // KORRIGIERT
  get password(): FormControl { return this.loginForm.get('password') as FormControl; }
  get forgotPasswordEmail(): FormControl { return this.forgotPasswordForm.get('email') as FormControl; }
  get forgotUsernameEmail(): FormControl { return this.forgotUsernameForm.get('email') as FormControl; } // NEU

  // --- VIEW-WECHSEL LOGIK ---
  private resetStateAndSwitchView(view: 'login' | 'forgotPassword' | 'forgotUsername'): void {
    this.viewMode.set(view);
    this.authService.authError.set(null);
    this.authService.successMessage.set(null);
    this.formSubmitted.set(false);
  }

  switchToForgotPasswordView(): void {
    this.resetStateAndSwitchView('forgotPassword');
  }

  switchToForgotUsernameView(): void { // NEU
    this.resetStateAndSwitchView('forgotUsername');
  }

  switchToLoginView(): void {
    this.resetStateAndSwitchView('login');
  }

  // --- SUBMIT-METHODEN ---

  onLoginSubmit(): void {
    this.formSubmitted.set(true);
    this.authService.authError.set(null);
    this.authService.successMessage.set(null);
    this.loginForm.markAllAsTouched();

    if (this.loginForm.invalid) { return; }

    // Das Backend erwartet 'emailOrUsername', auch wenn die UI nur 'Benutzername' anzeigt.
    const credentials = {
      emailOrUsername: this.loginForm.value.username,
      password: this.loginForm.value.password
    };

    this.subscriptions.add(
      this.authService.login(credentials).subscribe({
          next: (user) => {
            if (user) {
              console.log('Login-Overlay: Login erfolgreich.');
              this.closeOverlay();
            }
          },
          error: (err) => {
            console.error('Login-Overlay: Fehler von authService.login abgefangen.', err.message);
          }
        })
    );
  }

  onForgotPasswordSubmit(): void {
    this.formSubmitted.set(true);
    this.authService.authError.set(null);
    this.authService.successMessage.set(null);
    this.forgotPasswordForm.markAllAsTouched();

    if (this.forgotPasswordForm.invalid) { return; }
    
    const email = this.forgotPasswordForm.value.email;
    
    this.subscriptions.add(
      this.authService.requestPasswordReset(email).subscribe({
        next: (response) => {
          if (response.success) {
            this.forgotPasswordForm.reset();
            this.formSubmitted.set(false);
          }
        },
        error: (err) => {
          console.error('Login-Overlay: Fehler bei Passwort-Reset-Anfrage abgefangen:', err.message);
        }
      })
    );
  }

  onRequestUsernameSubmit(): void { // NEU
    this.formSubmitted.set(true);
    this.authService.authError.set(null);
    this.authService.successMessage.set(null);
    this.forgotUsernameForm.markAllAsTouched();

    if (this.forgotUsernameForm.invalid) { return; }

    const email = this.forgotUsernameForm.value.email;
    
    this.subscriptions.add(
      this.authService.requestUsername(email).subscribe({
        next: (response) => {
          if(response.success) {
            this.forgotUsernameForm.reset();
            this.formSubmitted.set(false);
          }
        },
        error: (err) => {
           console.error('Login-Overlay: Fehler bei Benutzername-Anfrage abgefangen:', err.message);
        }
      })
    );
  }

  // --- NAVIGATION & OVERLAY STEUERUNG ---
  closeOverlay(): void {
    this.uiStateService.closeLoginOverlay();
  }

  navigateToRegister(): void {
    this.closeOverlay();
    this.router.navigate(['/register']);
  }
}

// Test 