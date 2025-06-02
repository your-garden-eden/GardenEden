// /src/app/shared/components/login-overlay/login-overlay.component.ts
import { Component, OnInit, inject, signal, WritableSignal, OnDestroy, ViewChild, ElementRef, NgZone, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService, WordPressUser } from '../../services/auth.service'; // WordPressUser importieren
import { UiStateService } from '../../services/ui-state.service';
import { TranslocoService, TranslocoModule } from '@ngneat/transloco';
import { Subscription } from 'rxjs';
// import { environment } from '../../../../environments/environment'; // Vorerst nicht für Google Client ID benötigt
// declare var google: any; // Vorerst nicht für Google Sign-In benötigt


@Component({
  selector: 'app-login-overlay',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslocoModule],
  templateUrl: './login-overlay.component.html',
  styleUrls: ['./login-overlay.component.scss'] // styleUrl zu styleUrls korrigiert (üblicher Standard)
})
export class LoginOverlayComponent implements OnInit, OnDestroy { // AfterViewInit entfernt, da Google Sign-In auskommentiert
  private fb = inject(FormBuilder);
  public authService = inject(AuthService);
  private router = inject(Router);
  private uiStateService = inject(UiStateService);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);
  // private ngZone = inject(NgZone); // Vorerst nicht für Google Sign-In benötigt

  loginForm!: FormGroup;
  formSubmitted: WritableSignal<boolean> = signal(false);
  private errorMessageKey: WritableSignal<string | null> = signal(null); // Für spezifische Übersetzungsschlüssel

  // @ViewChild('googleBtnContainerOverlay') googleBtnContainer!: ElementRef<HTMLDivElement>; // Google-Login auskommentiert
  // private googleClientId = environment.googleClientId; // Google-Login auskommentiert

  private langChangeSubscription: Subscription | null = null;

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      emailOrUsername: ['', [Validators.required]],
      password: ['', Validators.required]
    });

    this.langChangeSubscription = this.translocoService.langChanges$.subscribe(() => {
      // Wenn ein Fehler-Key gesetzt wurde, die Nachricht im AuthService mit der neuen Übersetzung aktualisieren
      if (this.errorMessageKey() && this.authService.authError()) {
         this.authService.authError.set(this.translocoService.translate(this.errorMessageKey()!));
         this.cdr.detectChanges(); // Sicherstellen, dass die UI die Änderung mitbekommt
      }
    });
  }

  ngOnDestroy(): void {
      if (this.langChangeSubscription) {
          this.langChangeSubscription.unsubscribe();
      }
  }

  get emailOrUsername() { return this.loginForm.get('emailOrUsername'); }
  get password() { return this.loginForm.get('password'); }

  onSubmit(): void {
    this.formSubmitted.set(true);
    this.authService.authError.set(null); // Fehler vor neuem Versuch zurücksetzen
    this.errorMessageKey.set(null); // Key zurücksetzen
    this.loginForm.markAllAsTouched();

    if (this.loginForm.invalid) { return; }

    const credentials = {
      emailOrUsername: this.loginForm.value.emailOrUsername,
      password: this.loginForm.value.password
    };

    this.authService.login(credentials).subscribe({
        next: (user) => { // user ist WordPressUser | null (oder nur WordPressUser)
          if (user) {
            console.log('Login-Overlay: Login erfolgreich über WordPress JWT Plugin', user);
            this.closeOverlay();
            // Optional: Intelligente Weiterleitung basierend auf vorheriger Seite oder zu "Mein Konto"
            // const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/mein-konto';
            // this.router.navigateByUrl(returnUrl);
          } else {
            // Dieser Block sollte seltener getroffen werden, wenn authService.login bei Fehlern (auch success:false)
            // einen Fehler wirft, der im error-Callback unten behandelt wird.
            // Falls doch, setzen wir hier einen generischen Fehler.
            if (!this.authService.authError()) {
                this.errorMessageKey.set('loginOverlay.errorUnknown');
                this.authService.authError.set(this.translocoService.translate(this.errorMessageKey()!));
            }
          }
        },
        error: (err) => {
          // Der AuthService setzt authError. Hier können wir den errorMessageKey setzen für spezifische Übersetzungen.
          console.error('Login-Overlay: Fehler Detail von authService.login:', err.message);
          // Beispiel für spezifischere Fehlermeldung basierend auf der Nachricht vom Service:
          if (err && err.message) {
            const lowerCaseError = err.message.toLowerCase();
            if (lowerCaseError.includes('invalid') || lowerCaseError.includes('ungültig') || lowerCaseError.includes('credentials') || lowerCaseError.includes('password') || lowerCaseError.includes('benutzername')) {
              this.errorMessageKey.set('loginOverlay.errorInvalidCredentials');
            } else {
              this.errorMessageKey.set('loginOverlay.errorUnknown');
            }
          } else {
            this.errorMessageKey.set('loginOverlay.errorUnknown');
          }
          // Stelle sicher, dass der authError im Service mit der übersetzten Nachricht aktualisiert wird,
          // falls er im Service selbst nicht schon übersetzt wurde oder wir hier eine spezifischere wollen.
          if (this.errorMessageKey()) {
             this.authService.authError.set(this.translocoService.translate(this.errorMessageKey()!));
          }
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
     this.router.navigate(['/passwort-vergessen']);
   }
}