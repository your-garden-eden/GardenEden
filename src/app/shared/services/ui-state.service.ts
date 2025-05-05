// /src/app/shared/services/ui-state.service.ts
import { Injectable, signal, WritableSignal, computed, Signal, PLATFORM_ID, inject } from '@angular/core'; // PLATFORM_ID, inject hinzugefügt
import { isPlatformBrowser } from '@angular/common'; // isPlatformBrowser importieren

@Injectable({
  providedIn: 'root'
})
export class UiStateService {
  private platformId = inject(PLATFORM_ID); // Platform ID für Browser-Check

  // --- Zustand für Login-Overlay ---
  private _isLoginOverlayOpen: WritableSignal<boolean> = signal(false);
  public readonly isLoginOverlayOpen$: Signal<boolean> = this._isLoginOverlayOpen.asReadonly();

  // --- Zustand für Mini-Cart (Aktiviert) ---
  private _isMiniCartOpen: WritableSignal<boolean> = signal(false); // Signal für Mini-Cart
  public readonly isMiniCartOpen$: Signal<boolean> = this._isMiniCartOpen.asReadonly(); // Öffentliches Signal
  private closeTimeoutId: ReturnType<typeof setTimeout> | null = null; // Typ für Timeout-ID
  // --- Ende Mini-Cart ---

  constructor() { }

  // --- Methoden für Login-Overlay ---
  openLoginOverlay(): void {
    console.log('UiStateService: Opening Login Overlay');
    this._isLoginOverlayOpen.set(true);
    this.closeMiniCart(); // Schließe Mini-Cart, wenn Login geöffnet wird
  }

  closeLoginOverlay(): void {
    console.log('UiStateService: Closing Login Overlay');
    this._isLoginOverlayOpen.set(false);
  }

  toggleLoginOverlay(): void {
    console.log('UiStateService: Toggling Login Overlay');
    this._isLoginOverlayOpen.update(value => !value);
     if (this._isLoginOverlayOpen()) { // Wenn es geöffnet wird
         this.closeMiniCart(); // Schließe Mini-Cart
     }
  }
  // --- ENDE Methoden für Login-Overlay ---


  // --- Methoden für Mini-Cart (Implementiert) ---

  /** Öffnet den Mini-Warenkorb und bricht den Schließen-Timeout ab. */
  openMiniCart(): void {
    // Funktioniert nur im Browser sinnvoll wegen Timeout
    if (!isPlatformBrowser(this.platformId)) return;

    console.log('UiStateService: Opening Mini Cart');
    this.cancelCloseTimeout(); // Wichtig: Laufenden Timeout stoppen
    this._isMiniCartOpen.set(true);
    // Optional: Login-Overlay schließen, wenn Mini-Cart geöffnet wird?
    // this.closeLoginOverlay();
  }

  /** Schließt den Mini-Warenkorb und bricht den Schließen-Timeout ab. */
  closeMiniCart(): void {
     if (!isPlatformBrowser(this.platformId)) return;
     // Prüfen ob überhaupt offen, um unnötige Logs zu vermeiden
     if (!this._isMiniCartOpen()) return;

     console.log('UiStateService: Closing Mini Cart');
     this.cancelCloseTimeout(); // Sicherstellen, dass kein Timeout mehr läuft
     this._isMiniCartOpen.set(false);
  }

  /** Startet einen Timeout, nach dessen Ablauf der Mini-Warenkorb geschlossen wird. */
  startCloseTimeout(delay: number = 300): void { // Kürzere Verzögerung als Standard?
     if (!isPlatformBrowser(this.platformId)) return;

     this.cancelCloseTimeout(); // Alten Timeout löschen
     console.log(`UiStateService: Starting close timeout (${delay}ms)`);
     this.closeTimeoutId = setTimeout(() => {
       console.log('UiStateService: Closing Mini Cart via timeout');
       this._isMiniCartOpen.set(false);
       this.closeTimeoutId = null; // Timeout-ID zurücksetzen
     }, delay);
  }

  /** Bricht den laufenden Timeout zum Schließen des Mini-Warenkorbs ab. */
  cancelCloseTimeout(): void {
      if (this.closeTimeoutId) {
        console.log('UiStateService: Cancelling close timeout');
        clearTimeout(this.closeTimeoutId);
        this.closeTimeoutId = null;
      }
  }
  // --- Ende Mini-Cart Methoden ---
}