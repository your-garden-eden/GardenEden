// /src/app/core/services/cookie-consent.service.ts
import { Injectable, signal, WritableSignal } from '@angular/core';
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

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    // KORREKTUR: Die Initialisierung wird hier im Konstruktor aufgerufen,
    // um den Zustand so früh wie möglich zu laden.
    this.loadConsentFromLocalStorage();
  }

  private loadConsentFromLocalStorage(): void {
    if (isPlatformBrowser(this.platformId)) {
      const storedStatus = localStorage.getItem(CONSENT_STORAGE_KEY) as ConsentStatus;
      if (storedStatus === 'accepted_all' || storedStatus === 'accepted_essential') {
        this._consentStatus.set(storedStatus);
      } else {
        this._consentStatus.set(null);
      }
    }
  }

  private saveConsentToLocalStorage(status: ConsentStatus): void {
    if (isPlatformBrowser(this.platformId)) {
      if (status) {
        localStorage.setItem(CONSENT_STORAGE_KEY, status);
      } else {
        localStorage.removeItem(CONSENT_STORAGE_KEY);
      }
    }
  }

  acceptAll(): void {
    this._consentStatus.set('accepted_all');
    this.saveConsentToLocalStorage('accepted_all');
    console.log('Cookies: All accepted');
  }

  acceptEssential(): void {
    this._consentStatus.set('accepted_essential');
    this.saveConsentToLocalStorage('accepted_essential');
    console.log('Cookies: Only essential accepted');
  }

  getCurrentConsentStatus(): ConsentStatus {
    return this._consentStatus();
  }

  resetConsent(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
      this._consentStatus.set(null);
      console.log('Cookies: Consent reset');
    }
  }
}