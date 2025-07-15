// /src/app/shared/components/cookie-consent-banner/cookie-consent-banner.component.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CookieConsentService } from '../../../core/services/cookie-consent.service';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';

@Component({
  selector: 'app-cookie-consent-banner',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslocoModule
  ],
  templateUrl: './cookie-consent-banner.component.html',
  styleUrl: './cookie-consent-banner.component.scss'
})
export class CookieConsentBannerComponent {
  // KORREKTUR: Sichtbarkeit wird direkt vom primären Status-Signal abgeleitet.
  // Das ist robuster gegen Timing-Probleme.
  private cookieConsentService = inject(CookieConsentService);

  shouldShowBanner = () => this.cookieConsentService.consentStatus$() === null;

  acceptAllCookies(): void {
    this.cookieConsentService.acceptAll();
  }

  acceptEssentialCookies(): void {
    this.cookieConsentService.acceptEssential();
  }
}