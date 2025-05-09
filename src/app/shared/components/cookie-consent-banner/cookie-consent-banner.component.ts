// src/app/shared/components/cookie-consent-banner/cookie-consent-banner.component.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CookieConsentService } from '../../../core/services/cookie-consent.service'; // Pfad anpassen, falls nötig

@Component({
  selector: 'app-cookie-consent-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cookie-consent-banner.component.html',
  styleUrl: './cookie-consent-banner.component.scss'
})
export class CookieConsentBannerComponent {
  private cookieConsentService = inject(CookieConsentService);

  // Wir verwenden direkt das Signal aus dem Service für die Sichtbarkeit
  // und ob eine Wahl getroffen wurde.
  // Das Banner wird nur angezeigt, wenn noch keine Wahl getroffen wurde.
  showBanner = this.cookieConsentService.hasMadeChoice; // Wird im Template negiert

  acceptAllCookies(): void {
    this.cookieConsentService.acceptAll();
  }

  acceptEssentialCookies(): void {
    this.cookieConsentService.acceptEssential();
  }
}