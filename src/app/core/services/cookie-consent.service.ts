// src/app/core/services/cookie-consent.service.ts
import { Injectable, signal, WritableSignal, effect } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Inject } from '@angular/core';

export type ConsentStatus = 'accepted_all' | 'accepted_essential' | null;

const CONSENT_STORAGE_KEY = 'cookie_consent_status';

@Injectable({
  providedIn: 'root'
})
export class CookieConsentService {
  private _consentStatus: WritableSignal<ConsentStatus> = signal(null);
  public consentStatus$ = this._consentStatus.asReadonly();

  // Flag to indicate if the user has made any choice
  public hasMadeChoice: WritableSignal<boolean> = signal(false);

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (isPlatformBrowser(this.platformId)) {
      this.loadConsentFromLocalStorage();
    }

    // Effect to update hasMadeChoice when _consentStatus changes
    effect(() => {
      this.hasMadeChoice.set(this._consentStatus() !== null);
    });
  }

  private loadConsentFromLocalStorage(): void {
    if (isPlatformBrowser(this.platformId)) {
      const storedStatus = localStorage.getItem(CONSENT_STORAGE_KEY) as ConsentStatus;
      if (storedStatus === 'accepted_all' || storedStatus === 'accepted_essential') {
        this._consentStatus.set(storedStatus);
      } else {
        this._consentStatus.set(null); // No valid choice stored or first visit
      }
    }
  }

  private saveConsentToLocalStorage(status: ConsentStatus): void {
    if (isPlatformBrowser(this.platformId)) {
      if (status) {
        localStorage.setItem(CONSENT_STORAGE_KEY, status);
      } else {
        // Should not happen if we only set 'accepted_all' or 'accepted_essential'
        localStorage.removeItem(CONSENT_STORAGE_KEY);
      }
    }
  }

  acceptAll(): void {
    this._consentStatus.set('accepted_all');
    this.saveConsentToLocalStorage('accepted_all');
    console.log('Cookies: All accepted');
    // Hier könnten später Analytics-Skripte etc. initialisiert werden
  }

  acceptEssential(): void {
    this._consentStatus.set('accepted_essential');
    this.saveConsentToLocalStorage('accepted_essential');
    console.log('Cookies: Only essential accepted');
    // Hier könnten später nicht-essentielle Skripte ggf. deaktiviert/entfernt werden
  }

  // Optional: Methode, um den Consent-Status direkt abzufragen
  getCurrentConsentStatus(): ConsentStatus {
    return this._consentStatus();
  }

  // Optional: Methode zum Zurücksetzen (für Testzwecke oder Einstellungsdialog)
  resetConsent(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
      this._consentStatus.set(null);
      console.log('Cookies: Consent reset');
    }
  }
}