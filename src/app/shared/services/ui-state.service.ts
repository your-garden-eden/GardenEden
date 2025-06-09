// /src/app/shared/services/ui-state.service.ts
import { Injectable, signal, WritableSignal, Signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { ConfirmationModalData } from './ui-state.models'; // Importieren wir gleich

// Interface für die Struktur einer globalen Nachricht
export interface GlobalMessage {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  details?: string;
}

@Injectable({
  providedIn: 'root'
})
export class UiStateService {
  private platformId = inject(PLATFORM_ID);

  // --- GLOBALE SCHALTER FÜR POPUPS ---
  public readonly enableMaintenancePopup: boolean = true;
  public readonly enableCartDiscountPopup: boolean = true;

  // --- Session Storage Keys ---
  private readonly MAINTENANCE_POPUP_SHOWN_KEY = 'maintenancePopupShownInSession';
  private readonly CART_DISCOUNT_POPUP_SHOWN_KEY = 'cartDiscountPopupShownInSession';

  // --- Zustand für Login-Overlay ---
  private _isLoginOverlayOpen: WritableSignal<boolean> = signal(false);
  public readonly isLoginOverlayOpen$: Signal<boolean> = this._isLoginOverlayOpen.asReadonly();

  // --- Zustand für globale Nachrichten ---
  private _globalMessage: WritableSignal<GlobalMessage | null> = signal(null);
  public readonly globalMessage$ = this._globalMessage.asReadonly();
  private globalMessageTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // --- Zustand für Wartungshinweis-Popup ---
  private _showMaintenancePopup: WritableSignal<boolean> = signal(false);
  public readonly showMaintenancePopup$: Signal<boolean> = this._showMaintenancePopup.asReadonly();

  // --- Zustand für Rabatthinweis-Popup (Warenkorb) ---
  private _showCartDiscountPopup: WritableSignal<boolean> = signal(false);
  public readonly showCartDiscountPopup$: Signal<boolean> = this._showCartDiscountPopup.asReadonly();

  // +++ NEU: Zustand für das Bestätigungs-Modal +++
  private confirmationModalDataSubject = new BehaviorSubject<ConfirmationModalData | null>(null);
  public confirmationModalData$ = this.confirmationModalDataSubject.asObservable();
  
  private isConfirmationModalVisibleSubject = new BehaviorSubject<boolean>(false);
  public isConfirmationModalVisible$ = this.isConfirmationModalVisibleSubject.asObservable();

  private confirmationPromiseResolve?: (value: boolean) => void;

  constructor() {}

  // +++ NEU: Methoden für das Bestätigungs-Modal +++
  public openConfirmationModal(data: ConfirmationModalData): Promise<boolean> {
    this.confirmationModalDataSubject.next(data);
    this.isConfirmationModalVisibleSubject.next(true);

    return new Promise<boolean>((resolve) => {
      this.confirmationPromiseResolve = resolve;
    });
  }

  public closeConfirmationModal(result: boolean): void {
    if (this.confirmationPromiseResolve) {
      this.confirmationPromiseResolve(result);
    }
    this.isConfirmationModalVisibleSubject.next(false);
    // Optional: Daten nach kurzer Verzögerung zurücksetzen, um Fade-Out-Animationen zu ermöglichen
    setTimeout(() => {
      this.confirmationModalDataSubject.next(null);
      this.confirmationPromiseResolve = undefined;
    }, 300);
  }


  // --- Methoden für Login-Overlay ---
  openLoginOverlay(): void {
    this._isLoginOverlayOpen.set(true);
  }

  closeLoginOverlay(): void {
    this._isLoginOverlayOpen.set(false);
  }

  toggleLoginOverlay(): void {
    this._isLoginOverlayOpen.update(value => !value);
  }

  // --- Methoden für Wartungshinweis-Popup ---
  public triggerMaintenancePopup(): void {
    if (!isPlatformBrowser(this.platformId) || !this.enableMaintenancePopup) {
      return;
    }
    try {
      const alreadyShown = sessionStorage.getItem(this.MAINTENANCE_POPUP_SHOWN_KEY);
      if (!alreadyShown) {
        this._showMaintenancePopup.set(true);
      }
    } catch (e) {
      console.warn('SessionStorage nicht verfügbar für Maintenance Popup:', e);
      if (!this._showMaintenancePopup()) {
          this._showMaintenancePopup.set(true);
      }
    }
  }

  public hideMaintenancePopup(): void {
    this._showMaintenancePopup.set(false);
    if (isPlatformBrowser(this.platformId) && this.enableMaintenancePopup) {
      try {
        sessionStorage.setItem(this.MAINTENANCE_POPUP_SHOWN_KEY, 'true');
      } catch (e) {
        console.warn('Fehler beim Schreiben in SessionStorage für Maintenance Popup:', e);
      }
    }
  }

  // --- Methoden für Rabatthinweis-Popup (Warenkorb) ---
  public triggerCartDiscountPopup(): void {
    if (!isPlatformBrowser(this.platformId) || !this.enableCartDiscountPopup) {
      return;
    }
     try {
        const alreadyShown = sessionStorage.getItem(this.CART_DISCOUNT_POPUP_SHOWN_KEY);
        if (!alreadyShown) {
          this._showCartDiscountPopup.set(true);
        }
    } catch (e) {
        console.warn('SessionStorage nicht verfügbar für Cart Discount Popup:', e);
        if (!this._showCartDiscountPopup()) {
            this._showCartDiscountPopup.set(true);
        }
    }
  }

  public hideCartDiscountPopup(): void {
    this._showCartDiscountPopup.set(false);
    if (isPlatformBrowser(this.platformId) && this.enableCartDiscountPopup) {
      try {
        sessionStorage.setItem(this.CART_DISCOUNT_POPUP_SHOWN_KEY, 'true');
      } catch (e) {
        console.warn('Fehler beim Schreiben in SessionStorage für Cart Discount Popup:', e);
      }
    }
  }

  // --- Methoden für globale Nachrichten (bleiben unverändert) ---
  public showGlobalMessage(
    message: string,
    type: GlobalMessage['type'] = 'info',
    duration: number = 5000,
    details?: string
  ): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.globalMessageTimeoutId) {
      clearTimeout(this.globalMessageTimeoutId);
    }

    this._globalMessage.set({ message, type, duration, details });

    if (duration > 0) {
      this.globalMessageTimeoutId = setTimeout(() => {
        this.clearGlobalMessage();
      }, duration);
    }
  }

  public showGlobalSuccess(message: string, duration: number = 4000, details?: string): void {
    this.showGlobalMessage(message, 'success', duration, details);
  }

  public showGlobalError(message: string, duration: number = 7000, details?: string): void {
    this.showGlobalMessage(message, 'error', duration, details);
  }

  public showGlobalInfo(message: string, duration: number = 5000, details?: string): void {
    this.showGlobalMessage(message, 'info', duration, details);
  }

  public showGlobalWarning(message: string, duration: number = 6000, details?: string): void {
    this.showGlobalMessage(message, 'warning', duration, details);
  }

  public clearGlobalMessage(): void {
    this._globalMessage.set(null);
    if (this.globalMessageTimeoutId) {
      clearTimeout(this.globalMessageTimeoutId);
      this.globalMessageTimeoutId = null;
    }
  }
}