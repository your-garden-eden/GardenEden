// /src/app/shared/components/login-overlay/login-overlay.component.ts
import { Component, OnInit, inject, signal, WritableSignal, AfterViewInit, OnDestroy, ViewChild, ElementRef, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { UiStateService } from '../../services/ui-state.service';
import { environment } from '../../../../environments/environment';
import { TranslocoService, TranslocoModule } from '@ngneat/transloco';
import { Subscription } from 'rxjs'; // Subscription importieren

declare var google: any;

@Component({
  selector: 'app-login-overlay',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslocoModule],
  templateUrl: './login-overlay.component.html',
  styleUrl: './login-overlay.component.scss'
})
export class LoginOverlayComponent implements OnInit, AfterViewInit, OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private uiStateService = inject(UiStateService);
  private ngZone = inject(NgZone);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);

  loginForm!: FormGroup;
  isLoading: WritableSignal<boolean> = signal(false);
  errorMessage: WritableSignal<string | null> = signal(null);
  private errorMessageKey: WritableSignal<string | null> = signal(null);
  formSubmitted: WritableSignal<boolean> = signal(false);

  @ViewChild('googleBtnContainerOverlay') googleBtnContainer!: ElementRef<HTMLDivElement>;
  private googleClientId = environment.googleClientId;
  
  // KORRIGIERTE TYPISIERUNG
  private langChangeSubscription: Subscription | null = null;

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });

    if (!this.googleClientId) {
        console.error('LoginOverlay: Google Client ID ist nicht konfiguriert!');
    }

    this.langChangeSubscription = this.translocoService.langChanges$.subscribe(() => {
      if (this.errorMessageKey()) {
        this.errorMessage.set(this.translocoService.translate(this.errorMessageKey()!));
        this.cdr.detectChanges();
      }
    });
  }

  ngAfterViewInit(): void {
      this.initializeGoogleSignIn();
  }

  ngOnDestroy(): void {
      if (this.langChangeSubscription) {
          this.langChangeSubscription.unsubscribe();
      }
      // if (typeof google !== 'undefined' && google.accounts && google.accounts.id) { 
      //   google.accounts.id.cancel(); 
      // }
  }

  get email() { return this.loginForm.get('email'); }
  get password() { return this.loginForm.get('password'); }

  async onSubmit(): Promise<void> {
    this.formSubmitted.set(true);
    this.errorMessage.set(null);
    this.errorMessageKey.set(null);
    this.loginForm.markAllAsTouched();

    if (this.loginForm.invalid) { return; }

    this.isLoading.set(true);
    try {
      await this.authService.login(this.loginForm.value.email, this.loginForm.value.password);
      this.closeOverlay();
    } catch (error: any) {
      console.error('Login-Overlay fehlgeschlagen:', error);
      let errorKey = 'loginOverlay.errorUnknown';
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-email' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
         errorKey = 'loginOverlay.errorInvalidCredentials';
      }
      this.errorMessageKey.set(errorKey);
      this.errorMessage.set(this.translocoService.translate(errorKey));
    } finally {
      this.isLoading.set(false);
    }
  }

  private initializeGoogleSignIn(): void {
      if (!this.googleClientId) return;
      if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
          console.error('LoginOverlay: Google Identity Services client library not loaded.');
          return;
      }
      try {
          google.accounts.id.initialize({
              client_id: this.googleClientId,
              callback: this.handleGoogleCredentialResponse.bind(this)
          });
          if (this.googleBtnContainer?.nativeElement) {
               google.accounts.id.renderButton(
                 this.googleBtnContainer.nativeElement,
                 { theme: "outline", size: "large", type: 'standard', text: 'signin_with' }
               );
          } else {
              console.error('LoginOverlay: Google Button Container nicht gefunden.');
          }
      } catch (error) {
          console.error("LoginOverlay: Fehler bei der Initialisierung von Google Sign-In:", error);
      }
    }

    private async handleGoogleCredentialResponse(response: any): Promise<void> {
      this.isLoading.set(true);
      this.errorMessage.set(null);
      this.errorMessageKey.set(null);

      if (!response?.credential) {
          console.error('LoginOverlay: Ungültige Credential Response von Google.');
          const errorKey = 'loginOverlay.errorGoogleInvalidResponse';
          this.errorMessageKey.set(errorKey);
          this.errorMessage.set(this.translocoService.translate(errorKey));
          this.isLoading.set(false);
          return;
      }

      this.ngZone.run(async () => {
          try {
              await this.authService.signInWithGoogleCredential(response.credential);
              this.closeOverlay();
          } catch (error) {
              console.error('LoginOverlay: Firebase Login mit Google Credential fehlgeschlagen:', error);
              const errorKey = 'loginOverlay.errorGoogleFirebase';
              this.errorMessageKey.set(errorKey);
              this.errorMessage.set(this.translocoService.translate(errorKey));
          } finally {
              this.isLoading.set(false);
          }
      });
    }

  closeOverlay(): void {
    this.uiStateService.closeLoginOverlay();
  }

  navigateToRegister(): void {
    this.closeOverlay();
    this.router.navigate(['/register']);
  }

   navigateToForgotPassword(): void {
     this.closeOverlay();
     console.warn('Navigation zu /forgot-password noch nicht implementiert.');
     // this.router.navigate(['/passwort-vergessen']);
   }
}