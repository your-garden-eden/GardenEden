// src/app/shared/components/cookie-consent-banner/cookie-consent-banner.component.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CookieConsentService } from '../../../core/services/cookie-consent.service';
import { RouterLink } from '@angular/router'; // RouterLink für den Link zur Datenschutzerklärung
import { TranslocoModule } from '@ngneat/transloco'; // TranslocoModule importieren

@Component({
  selector: 'app-cookie-consent-banner',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink, // RouterLink hinzufügen
    TranslocoModule // TranslocoModule hinzufügen
  ],
  templateUrl: './cookie-consent-banner.component.html',
  styleUrl: './cookie-consent-banner.component.scss'
})
export class CookieConsentBannerComponent {
  private cookieConsentService = inject(CookieConsentService);

  // Das Banner wird angezeigt, wenn showBanner() true ist.
  // Die Logik im Template war *ngIf="!showBanner()", was bedeutet,
  // wenn hasMadeChoice true ist, wird das Banner NICHT gezeigt. Das ist korrekt.
  // Wir benennen das Signal hier um, um es klarer zu machen, dass es die Bedingung ist,
  // wann das Banner angezeigt werden soll.
  shouldShowBanner = () => !this.cookieConsentService.hasMadeChoice();

  acceptAllCookies(): void {
    this.cookieConsentService.acceptAll();
  }

  acceptEssentialCookies(): void {
    this.cookieConsentService.acceptEssential();
  }
}