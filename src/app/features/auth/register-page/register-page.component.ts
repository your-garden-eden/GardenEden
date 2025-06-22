// /src/app/features/auth/register-page/register-page.component.ts (v2.0 - Mit Benutzername)
import { Component, OnInit, inject, signal, WritableSignal, ChangeDetectorRef, OnDestroy, AfterViewInit, ViewChild, ElementRef, NgZone } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService, WordPressRegisterData, CustomRegisterResponse } from '../../../shared/services/auth.service';
import { UiStateService } from '../../../shared/services/ui-state.service';
import { Title } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { WoocommerceService, WooCommerceCountry } from '../../../core/services/woocommerce.service';
import { PLATFORM_ID } from '@angular/core';

export function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password');
  const confirmPassword = control.get('confirmPassword');
  if (!password || !confirmPassword || !password.value || !confirmPassword.value) { return null; }
  return password.value === confirmPassword.value ? null : { passwordsMismatch: true };
}

// NEU: Validator, der das @-Zeichen im Benutzernamen verbietet.
export function noAtSymbolValidator(control: AbstractControl): ValidationErrors | null {
  const hasAtSymbol = control.value && control.value.includes('@');
  return hasAtSymbol ? { noAtSymbol: true } : null;
}

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslocoModule, LoadingSpinnerComponent],
  templateUrl: './register-page.component.html',
  styleUrls: ['./register-page.component.scss']
})
export class RegisterPageComponent implements OnInit, OnDestroy, AfterViewInit {
  private fb = inject(FormBuilder);
  public authService = inject(AuthService);
  private uiStateService = inject(UiStateService);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);
  private woocommerceService = inject(WoocommerceService);
  private platformId = inject(PLATFORM_ID);
  private zone = inject(NgZone);

  @ViewChild('addressStreetInput') addressStreetInput!: ElementRef<HTMLInputElement>;
  private autocomplete: google.maps.places.Autocomplete | undefined;

  registerForm!: FormGroup;
  formSubmitted: WritableSignal<boolean> = signal(false);
  registrationSuccessful: WritableSignal<boolean> = signal(false);

  passwordFieldType: WritableSignal<'password' | 'text'> = signal('password');
  confirmPasswordFieldType: WritableSignal<'password' | 'text'> = signal('password');
  public countries: WritableSignal<WooCommerceCountry[]> = signal([]);
  public isLoadingCountries: WritableSignal<boolean> = signal(true);
  private subscriptions = new Subscription();

  constructor() {}

  ngOnInit(): void {
    // GEÄNDERT: Formular um 'username' erweitert und Validatoren hinzugefügt.
    this.registerForm = this.fb.group({
      first_name: ['', Validators.required],
      last_name: ['', Validators.required],
      billing_country: ['DE', Validators.required],
      address_1: ['', Validators.required],
      postcode: ['', [Validators.required, Validators.pattern(/^\d{5}$/)]],
      city: ['', Validators.required],
      billing_phone: ['', Validators.required],
      username: ['', [Validators.required, Validators.minLength(4), noAtSymbolValidator]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
      newsletter: [false],
      acceptTerms: [false, Validators.requiredTrue]
    }, { validators: passwordMatchValidator });

    this.loadCountries();
    this.setupTitleAndLangSubscriptions();
  }
  
  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.initAutocomplete();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.autocomplete) {
      google.maps.event.clearInstanceListeners(this.autocomplete);
    }
    this.authService.authError.set(null);
  }
  
  private initAutocomplete(): void {
    if (!this.addressStreetInput?.nativeElement) {
      return;
    };
    
    this.setupAutocompleteForCountry(this.registerForm.get('billing_country')?.value);

    const countrySub = this.registerForm.get('billing_country')?.valueChanges.subscribe(countryCode => {
      this.setupAutocompleteForCountry(countryCode);
    });
    this.subscriptions.add(countrySub);
  }

  private setupAutocompleteForCountry(countryCode: string): void {
    if (this.autocomplete) {
      google.maps.event.clearInstanceListeners(this.autocomplete);
    }
    this.autocomplete = new google.maps.places.Autocomplete(this.addressStreetInput.nativeElement, {
      types: ['address'],
      componentRestrictions: { country: countryCode },
      fields: ['address_components', 'formatted_address']
    });

    this.autocomplete.addListener('place_changed', () => {
      this.zone.run(() => {
        const place = this.autocomplete?.getPlace();
        if (place?.address_components) {
          this.fillInAddress(place);
        }
      });
    });
  }

  private fillInAddress(place: google.maps.places.PlaceResult): void {
    const componentMap: { [key: string]: string } = {};
    if (!place.address_components) return;

    for (const component of place.address_components) {
      const type = component.types[0];
      if (type) {
        componentMap[type] = component.long_name;
      }
    }
    
    const route = componentMap['route'] || '';
    const streetNumber = componentMap['street_number'] || '';
    let fullStreet = route;
    if (route && streetNumber) {
        fullStreet = `${route} ${streetNumber}`;
    }

    this.registerForm.patchValue({
      address_1: fullStreet,
      city: componentMap['locality'] || componentMap['administrative_area_level_3'] || '',
      postcode: componentMap['postal_code'] || '',
    });
  }
  
  private setupTitleAndLangSubscriptions(): void {
    const titleSub = this.translocoService.selectTranslate('registerPage.title').subscribe(title => this.titleService.setTitle(title));
    this.subscriptions.add(titleSub);
  }

  private loadCountries(): void {
    this.isLoadingCountries.set(true);
    const sub = this.woocommerceService.getCountries().pipe(finalize(() => this.isLoadingCountries.set(false))).subscribe({
      next: (countries) => this.countries.set(countries),
      error: (err) => console.error('Failed to load countries', err)
    });
    this.subscriptions.add(sub);
  }

  get f() { return this.registerForm.controls; }
  
  openLoginOverlay(event: MouseEvent): void {
    event.preventDefault();
    this.uiStateService.openLoginOverlay();
  }

  togglePasswordVisibility(field: 'password' | 'confirmPassword'): void {
    if (field === 'password') this.passwordFieldType.set(this.passwordFieldType() === 'password' ? 'text' : 'password');
    else this.confirmPasswordFieldType.set(this.confirmPasswordFieldType() === 'password' ? 'text' : 'password');
  }

  onSubmit(): void {
    this.formSubmitted.set(true);
    this.authService.authError.set(null);
    this.registerForm.markAllAsTouched();

    if (this.registerForm.invalid) {
      this.focusFirstInvalidField();
      return;
    }

    const registrationData: WordPressRegisterData = this.registerForm.getRawValue();
    
    this.subscriptions.add(
      this.authService.register(registrationData).subscribe({
        next: (response: CustomRegisterResponse) => {
          if (response.success) {
            this.registrationSuccessful.set(true);
            this.registerForm.disable();
          }
        },
        error: (err) => {
          const errorMessage = err.message || '';
          if (errorMessage.toLowerCase().includes('diese e-mail-adresse wird bereits verwendet')) {
            this.registerForm.get('email')?.setErrors({ alreadyInUse: true });
            this.authService.authError.set(this.translocoService.translate('registerPage.errorEmailInUse'));
          } else if (errorMessage.toLowerCase().includes('benutzername bereits vorhanden')) { // NEU: Fehlerbehandlung für existierenden Benutzernamen
            this.registerForm.get('username')?.setErrors({ alreadyInUse: true });
            this.authService.authError.set(this.translocoService.translate('registerPage.errorUsernameInUse'));
          }
          this.focusFirstInvalidField();
        }
      })
    );
  }

  private focusFirstInvalidField(): void {
    setTimeout(() => {
        for (const name in this.registerForm.controls) {
          if (this.registerForm.controls[name].invalid) {
            const element = document.querySelector(`[formControlName="${name}"]`);
            if (element instanceof HTMLElement) {
              element.focus();
              break;
            }
          }
        }
    }, 0);
  }
}