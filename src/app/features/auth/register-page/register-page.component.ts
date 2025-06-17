// /src/app/features/auth/register-page/register-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, ChangeDetectorRef, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService, WordPressRegisterData } from '../../../shared/services/auth.service';
import { UiStateService } from '../../../shared/services/ui-state.service';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

export function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password');
  const confirmPassword = control.get('confirmPassword');
  if (!password || !confirmPassword || !password.value || !confirmPassword.value) { return null; }
  return password.value === confirmPassword.value ? null : { passwordsMismatch: true };
}

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslocoModule, LoadingSpinnerComponent],
  templateUrl: './register-page.component.html',
  styleUrls: ['./register-page.component.scss']
})
export class RegisterPageComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  public authService = inject(AuthService);
  private uiStateService = inject(UiStateService);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);

  registerForm!: FormGroup;
  private errorMessageKey: WritableSignal<string | null> = signal(null);
  formSubmitted: WritableSignal<boolean> = signal(false);
  registrationSuccessMessage: WritableSignal<string | null> = signal(null);
  private registrationSuccessMessageKey: WritableSignal<string | null> = signal(null);

  passwordFieldType: WritableSignal<'password' | 'text'> = signal('password');
  confirmPasswordFieldType: WritableSignal<'password' | 'text'> = signal('password');

  private subscriptions = new Subscription();

  constructor() {
    effect(() => {
      const authErr = this.authService.authError();
      if (authErr && !this.errorMessageKey()) {}
    });
  }

  ngOnInit(): void {
    this.registerForm = this.fb.group({
      first_name: ['', Validators.required],
      last_name: ['', Validators.required],
      address_1: ['', Validators.required],
      postcode: ['', [Validators.required, Validators.pattern(/^\d{5}$/)]],
      city: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
      newsletter: [false],
      acceptTerms: [false, Validators.requiredTrue]
    }, { validators: passwordMatchValidator });

    const titleSub = this.translocoService.selectTranslate('registerPage.title').subscribe(title => {
      this.titleService.setTitle(title);
    });
    this.subscriptions.add(titleSub);

    const langChangeSub = this.translocoService.langChanges$.subscribe(() => {
        if (this.errorMessageKey() && this.authService.authError()) {
            this.authService.authError.set(this.translocoService.translate(this.errorMessageKey()!));
        }
        if (this.registrationSuccessMessageKey()) {
          const email = this.registerForm.get('email')?.value;
          this.registrationSuccessMessage.set(this.translocoService.translate(this.registrationSuccessMessageKey()!, { email: email }));
        }
    });
    this.subscriptions.add(langChangeSub);
  }

  ngOnDestroy(): void {
      this.subscriptions.unsubscribe();
  }

  get f() { return this.registerForm.controls; }

  openLoginOverlay(event: MouseEvent): void {
    event.preventDefault(); this.uiStateService.openLoginOverlay();
  }

  togglePasswordVisibility(field: 'password' | 'confirmPassword'): void {
    if (field === 'password') {
      this.passwordFieldType.set(this.passwordFieldType() === 'password' ? 'text' : 'password');
    } else {
      this.confirmPasswordFieldType.set(this.confirmPasswordFieldType() === 'password' ? 'text' : 'password');
    }
  }

  onSubmit(): void {
    this.formSubmitted.set(true);
    this.clearMessages();
    this.registerForm.markAllAsTouched();

    if (this.registerForm.invalid) {
      this.focusFirstInvalidField();
      return;
    }

    const registrationData: WordPressRegisterData = {
      email: this.registerForm.get('email')!.value,
      password: this.registerForm.get('password')!.value,
      first_name: this.registerForm.get('first_name')!.value,
      last_name: this.registerForm.get('last_name')!.value,
      address_1: this.registerForm.get('address_1')!.value,
      postcode: this.registerForm.get('postcode')!.value,
      city: this.registerForm.get('city')!.value,
    };
    
    this.authService.isLoading.set(true);

    this.authService.register(registrationData)
      .pipe(
        finalize(() => {
          this.authService.isLoading.set(false);
          // **HIER IST DIE LOGIK-ÄNDERUNG**
          // Wir prüfen NACH dem Ladevorgang, ob ein schwerwiegender Fehler aufgetreten ist.
          // Wenn nicht, zeigen wir die Erfolgsmeldung an.
          if (!this.authService.authError()) {
            this.setSuccessMessage('registerPage.successMessage', { email: registrationData.email });
          }
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        // Der next-Block wird bei einem 500er-Fehler nicht erreicht, daher verschieben wir die Logik
        next: (user) => {},
        error: (err) => {
          if (err && err.message) {
            const lowerCaseError = err.message.toLowerCase();
            if (lowerCaseError.includes('email') && (lowerCaseError.includes('bereits verwendet') || lowerCaseError.includes('already in use'))) {
              this.registerForm.get('email')?.setErrors({ alreadyInUse: true });
              this.setErrorMessage('registerPage.errorEmailInUse');
            } else {
                // Generische Fehlermeldung wird vom Service gesetzt
            }
          }
        }
    });
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

  private clearMessages(): void {
    this.errorMessageKey.set(null);
    this.registrationSuccessMessageKey.set(null);
    this.registrationSuccessMessage.set(null);
    this.authService.authError.set(null);
  }

  private setErrorMessage(key: string, params?: object): void {
    this.errorMessageKey.set(key);
    this.authService.authError.set(this.translocoService.translate(key, params));
  }

  private setSuccessMessage(key: string, params?: object): void {
    this.registrationSuccessMessageKey.set(key);
    this.registrationSuccessMessage.set(this.translocoService.translate(key, params));
  }
}