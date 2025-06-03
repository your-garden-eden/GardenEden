// /src/app/shared/services/ui-state.service.ts
import { Injectable, signal, WritableSignal, Signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

// Interface für die Struktur einer globalen Nachricht
export interface GlobalMessage {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number; // Optionale Anzeigedauer in ms
  details?: string; // Optionale Details
}

@Injectable({
  providedIn: 'root'
})
export class UiStateService {
  private platformId = inject(PLATFORM_ID);

  // --- Zustand für Login-Overlay ---
  private _isLoginOverlayOpen: WritableSignal<boolean> = signal(false);
  public readonly isLoginOverlayOpen$: Signal<boolean> = this._isLoginOverlayOpen.asReadonly();

  // --- ENTFERNT: Zustand für Mini-Cart ---
  // private _isMiniCartOpen: WritableSignal<boolean> = signal(false);
  // public readonly isMiniCartOpen$: Signal<boolean> = this._isMiniCartOpen.asReadonly();
  // private closeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  // private readonly DEFAULT_MINI_CART_DISPLAY_DURATION = 3000; // 3 Sekunden

  // --- Zustand für globale Nachrichten (bleibt) ---
  private _globalMessage: WritableSignal<GlobalMessage | null> = signal(null);
  public readonly globalMessage$ = this._globalMessage.asReadonly();
  private globalMessageTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {}

  // --- Methoden für Login-Overlay (angepasst) ---
  openLoginOverlay(): void {
    this._isLoginOverlayOpen.set(true);
    // ENTFERNT: this.closeMiniCart(); // Nicht mehr nötig, da Mini-Cart entfernt wird
  }

  closeLoginOverlay(): void {
    this._isLoginOverlayOpen.set(false);
  }

  toggleLoginOverlay(): void {
    this._isLoginOverlayOpen.update(value => !value);
    // ENTFERNT: if (this._isLoginOverlayOpen()) { this.closeMiniCart(); }
  }

  // --- ENTFERNT: Methoden für Mini-Cart ---
  // openMiniCart(): void {
  //   if (!isPlatformBrowser(this.platformId)) return;
  //   this.cancelCloseTimeout();
  //   this._isMiniCartOpen.set(true);
  // }

  // closeMiniCart(): void {
  //   if (!isPlatformBrowser(this.platformId) || !this._isMiniCartOpen()) return;
  //   this.cancelCloseTimeout();
  //   this._isMiniCartOpen.set(false);
  // }

  // startCloseTimeout(delay: number = 500): void {
  //   if (!isPlatformBrowser(this.platformId)) return;
  //   this.cancelCloseTimeout();
  //   this.closeTimeoutId = setTimeout(() => {
  //     this._isMiniCartOpen.set(false);
  //     this.closeTimeoutId = null;
  //   }, delay);
  // }

  // cancelCloseTimeout(): void {
  //   if (this.closeTimeoutId) {
  //     clearTimeout(this.closeTimeoutId);
  //     this.closeTimeoutId = null;
  //   }
  // }

  // public openMiniCartWithTimeout(duration: number = this.DEFAULT_MINI_CART_DISPLAY_DURATION): void {
  //   if (!isPlatformBrowser(this.platformId)) return;
  //   this.openMiniCart(); // Würde Fehler werfen, da openMiniCart entfernt wird
  //   // Stattdessen: Wenn diese Funktionalität (etwas für eine Dauer anzeigen) anderweitig gebraucht wird,
  //   // müsste sie allgemeiner implementiert werden oder spezifisch für den neuen Zweck.
  //   // Für den Mini-Cart Zweck ist sie jetzt obsolet.
  // }

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