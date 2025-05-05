// /src/app/shared/services/ui-state.service.ts
import { Injectable, signal, WritableSignal, Signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class UiStateService {
  private platformId = inject(PLATFORM_ID);

  // --- Zustand für Login-Overlay ---
  private _isLoginOverlayOpen: WritableSignal<boolean> = signal(false);
  public readonly isLoginOverlayOpen$: Signal<boolean> = this._isLoginOverlayOpen.asReadonly();

  // --- Zustand für Mini-Cart ---
  private _isMiniCartOpen: WritableSignal<boolean> = signal(false);
  public readonly isMiniCartOpen$: Signal<boolean> = this._isMiniCartOpen.asReadonly();
  private closeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {}

  // --- Methoden für Login-Overlay ---
  openLoginOverlay(): void {
    // console.log('UiStateService: Opening Login Overlay');
    this._isLoginOverlayOpen.set(true);
    this.closeMiniCart(); // Schließe Mini-Cart, wenn Login geöffnet wird
  }

  closeLoginOverlay(): void {
    // console.log('UiStateService: Closing Login Overlay');
    this._isLoginOverlayOpen.set(false);
  }

  toggleLoginOverlay(): void {
    // console.log('UiStateService: Toggling Login Overlay');
    this._isLoginOverlayOpen.update(value => !value);
    if (this._isLoginOverlayOpen()) {
      this.closeMiniCart();
    }
  }

  // --- Methoden für Mini-Cart ---
  openMiniCart(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    // console.log('UiStateService: Opening Mini Cart');
    this.cancelCloseTimeout();
    this._isMiniCartOpen.set(true);
    // Optional: Login-Overlay schließen, wenn Mini-Cart geöffnet wird?
    // this.closeLoginOverlay();
  }

  closeMiniCart(): void {
    if (!isPlatformBrowser(this.platformId) || !this._isMiniCartOpen()) return;
    // console.log('UiStateService: Closing Mini Cart');
    this.cancelCloseTimeout();
    this._isMiniCartOpen.set(false);
  }

  startCloseTimeout(delay: number = 300): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.cancelCloseTimeout();
    // console.log(`UiStateService: Starting close timeout (${delay}ms)`);
    this.closeTimeoutId = setTimeout(() => {
      // console.log('UiStateService: Closing Mini Cart via timeout');
      this._isMiniCartOpen.set(false);
      this.closeTimeoutId = null;
    }, delay);
  }

  cancelCloseTimeout(): void {
    if (this.closeTimeoutId) {
      // console.log('UiStateService: Cancelling close timeout');
      clearTimeout(this.closeTimeoutId);
      this.closeTimeoutId = null;
    }
  }
}