// /src/app/app.component.ts
import { Component, inject, Signal, OnInit, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { environment } from '../environments/environment';
import { MaintenanceComponent } from './maintenance/maintenance.component';
import { HeaderComponent } from './shared/components/header/header.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { LoginOverlayComponent } from './shared/components/login-overlay/login-overlay.component';
import { UiStateService } from './shared/services/ui-state.service';
import { CookieConsentBannerComponent } from './shared/components/cookie-consent-banner/cookie-consent-banner.component';
import { MaintenanceInfoModalComponent } from './shared/components/maintenance-info-modal/maintenance-info-modal.component';
import { ConfirmationModalComponent } from './shared/components/confirmation-modal/confirmation-modal.component';
import { CartDiscountInfoModalComponent } from './shared/components/cart-discount-info-modal/cart-discount-info-modal.component'; // NEU
import { TranslocoService } from '@ngneat/transloco';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MaintenanceComponent,
    HeaderComponent,
    FooterComponent,
    LoginOverlayComponent,
    CookieConsentBannerComponent,
    MaintenanceInfoModalComponent,
    ConfirmationModalComponent,
    CartDiscountInfoModalComponent // NEU
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  maintenanceMode = environment.maintenanceMode;
  currentYear = new Date().getFullYear();

  // ANGEPASST: `uiStateService` public gemacht
  public uiStateService = inject(UiStateService);
  private platformId = inject(PLATFORM_ID);
  private translocoService = inject(TranslocoService);

  // Diese sind jetzt über `uiStateService.isLoginOverlayOpen$()` direkt im Template verfügbar
  // isLoginOverlayOpen$: Signal<boolean> = this.uiStateService.isLoginOverlayOpen$;
  // showMaintenancePopup$: Signal<boolean> = this.uiStateService.showMaintenancePopup$;

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.initializeLanguage();

      if (!this.maintenanceMode) {
        this.uiStateService.triggerMaintenancePopup();
      }
    }
  }

  private initializeLanguage(): void {
    const LANG_KEY = 'transloco-lang';
    const savedLang = localStorage.getItem(LANG_KEY);

    if (savedLang) {
      this.translocoService.setActiveLang(savedLang);
      return;
    }

    const browserLang = navigator.language.split('-')[0];
    const availableLangs = this.translocoService.getAvailableLangs() as string[];

    if (availableLangs.includes(browserLang)) {
      this.translocoService.setActiveLang(browserLang);
    }
  }
}