// /src/app/shared/services/ui-state.service.ts
import { Injectable, signal, WritableSignal, computed, Signal } from '@angular/core'; // signal, WritableSignal, computed, Signal importieren

@Injectable({
  providedIn: 'root'
})
export class UiStateService {

  // --- NEU: Zustand für Login-Overlay ---
  // Privates beschreibbares Signal
  private _isLoginOverlayOpen: WritableSignal<boolean> = signal(false);
  // Öffentliches readonly Signal (oder computed, falls komplexer)
  public readonly isLoginOverlayOpen$: Signal<boolean> = this._isLoginOverlayOpen.asReadonly();
  // --- ENDE NEU ---

  // --- Mini-Cart Zustand (Beispiel, falls benötigt) ---
  // private _isMiniCartOpen = signal(false);
  // public readonly isMiniCartOpen$ = this._isMiniCartOpen.asReadonly();
  // private closeTimeoutId: any = null;
  // --- Ende Mini-Cart ---

  constructor() { }

  // --- NEU: Methoden für Login-Overlay ---
  openLoginOverlay(): void {
    console.log('UiStateService: Opening Login Overlay');
    this._isLoginOverlayOpen.set(true);
    // Optional: Mini-Cart schließen, wenn Login geöffnet wird?
    // this._isMiniCartOpen.set(false);
  }

  closeLoginOverlay(): void {
    console.log('UiStateService: Closing Login Overlay');
    this._isLoginOverlayOpen.set(false);
  }

  toggleLoginOverlay(): void {
    console.log('UiStateService: Toggling Login Overlay');
    this._isLoginOverlayOpen.update(value => !value);
  }
  // --- ENDE NEU ---


  // --- Mini-Cart Methoden (Beispiele, angepasst an signal) ---
  cancelCloseTimeout(): void {
    // console.log('UiStateService: cancelCloseTimeout() called');
    // if (this.closeTimeoutId) {
    //   clearTimeout(this.closeTimeoutId);
    //   this.closeTimeoutId = null;
    // }
  }

  openMiniCart(): void {
    // console.log('UiStateService: openMiniCart() called');
    // this.cancelCloseTimeout();
    // this._isMiniCartOpen.set(true);
  }

  startCloseTimeout(delay: number = 500): void {
    // console.log('UiStateService: startCloseTimeout() called');
    // this.cancelCloseTimeout(); // Sicherstellen, dass kein alter Timeout läuft
    // this.closeTimeoutId = setTimeout(() => {
    //   this._isMiniCartOpen.set(false);
    //   console.log('UiStateService: Mini-Cart closed via timeout');
    //   this.closeTimeoutId = null;
    // }, delay);
  }

  closeMiniCart(): void {
     // console.log('UiStateService: Closing Mini Cart');
     // this.cancelCloseTimeout();
     // this._isMiniCartOpen.set(false);
  }
  // --- Ende Mini-Cart Methoden ---
}