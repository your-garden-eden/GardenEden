import { Component, OnInit, inject, signal, WritableSignal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../shared/services/auth.service';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
// KORRIGIERTER IMPORT
import { LoadingSpinnerComponent } from "../../../shared/components/loading-spinner/loading-spinner.component";
import { Subscription } from 'rxjs';

// Benutzerdefinierter Validator für Passwort-Übereinstimmung
export function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password');
  const confirmPassword = control.get('confirmPassword');

  if (password && confirmPassword && password.value !== confirmPassword.value) {
    // Setzt den Fehler auf dem 'confirmPassword'-Feld, damit wir die Fehlermeldung dort anzeigen können
    confirmPassword.setErrors({ passwordsMismatch: true });
    return { passwordsMismatch: true };
  } else {
    // Wenn die Passwörter übereinstimmen, entfernen wir den Fehler, falls er vorhanden war
    if (confirmPassword?.hasError('passwordsMismatch')) {
      confirmPassword.setErrors(null);
    }
    return null;
  }
}

@Component({
  selector: 'app-reset-password-page',
  standalone: true,
  // KORRIGIERTER COMPONENTEN-NAME IM IMPORTS-ARRAY
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslocoModule, LoadingSpinnerComponent],
  templateUrl: './reset-password-page.component.html',
  styleUrls: ['./reset-password-page.component.scss']
})
export class ResetPasswordPageComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  public authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  resetPasswordForm!: FormGroup;
  formSubmitted: WritableSignal<boolean> = signal(false);
  
  private resetKey: string | null = null;
  private userLogin: string | null = null;
  private paramSub: Subscription | undefined;

  isTokenValid: WritableSignal<boolean | null> = signal(null); // null = prüft noch, false = ungültig, true = gültig

  ngOnInit(): void {
    // Reset Zustand vom AuthService, falls von anderer Seite noch was gesetzt ist
    this.authService.authError.set(null);
    this.authService.successMessage.set(null);

    this.resetPasswordForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required]
    }, { validators: passwordsMatchValidator });

    this.paramSub = this.route.queryParamMap.subscribe(params => {
      this.resetKey = params.get('key');
      this.userLogin = params.get('login');

      if (!this.resetKey || !this.userLogin) {
        this.isTokenValid.set(false);
        this.authService.authError.set('Der Link zum Zurücksetzen des Passworts ist unvollständig oder ungültig.');
      } else {
        this.isTokenValid.set(true); // Wir nehmen an, der Token ist gültig, bis das Backend was anderes sagt
      }
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
  }

  get password() { return this.resetPasswordForm.get('password'); }
  get confirmPassword() { return this.resetPasswordForm.get('confirmPassword'); }

  onSubmit(): void {
    this.formSubmitted.set(true);
    this.resetPasswordForm.markAllAsTouched();

    // Kleine Korrektur: Die Validierung des Confirm-Feldes wird durch den FormGroup-Validator gesteuert
    if (this.password?.value !== this.confirmPassword?.value) {
      this.confirmPassword?.setErrors({ passwordsMismatch: true });
    }

    if (this.resetPasswordForm.invalid || !this.isTokenValid()) {
      return;
    }

    if (this.resetKey && this.userLogin) {
      const payload = {
        key: this.resetKey,
        login: this.userLogin,
        password: this.password!.value
      };

      this.authService.confirmPasswordReset(payload).subscribe({
        next: (response) => {
          // Erfolgsmeldung wird im Service gesetzt. Wir leiten nach kurzer Zeit zum Login weiter.
          if(response.success) {
            this.resetPasswordForm.disable(); // Formular nach Erfolg deaktivieren
            setTimeout(() => {
              this.router.navigate(['/']); // Zur Startseite navigieren
              this.authService.successMessage.set(null); // Nachricht entfernen vor Navigation
              // Optional das Login-Overlay öffnen
              // this.uiStateService.openLoginOverlay();
            }, 5000);
          }
        },
        error: (err) => {
          // Fehlermeldung wird im Service gesetzt und im Template angezeigt
          console.error('Passwort-Reset fehlgeschlagen:', err);
        }
      });
    }
  }
}