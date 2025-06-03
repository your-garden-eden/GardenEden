import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiStateService } from '../../services/ui-state.service';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco'; // TranslocoService importiert

@Component({
  selector: 'app-cart-discount-info-modal',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  templateUrl: './cart-discount-info-modal.component.html',
  styleUrls: ['./cart-discount-info-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartDiscountInfoModalComponent {
  public uiStateService = inject(UiStateService);
  private translocoService = inject(TranslocoService); // TranslocoService injiziert

  readonly couponCode = 'DeinGartenEden'; // Bleibt hier
  public copyStatus = signal<'idle' | 'copied' | 'error' | 'unsupported'>('idle');

  public closeModal(): void {
    this.uiStateService.hideCartDiscountPopup();
  }

  public copyCouponCode(): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(this.couponCode).then(() => {
        this.copyStatus.set('copied');
        setTimeout(() => {
          this.copyStatus.set('idle');
        }, 2000);
      }).catch(err => {
        console.error('Fehler beim Kopieren des Gutscheincodes: ', err);
        this.copyStatus.set('error');
        setTimeout(() => {
          this.copyStatus.set('idle');
        }, 2000);
      });
    } else {
      console.warn('navigator.clipboard ist nicht verfügbar.');
      this.copyStatus.set('unsupported');
       setTimeout(() => {
          this.copyStatus.set('idle');
        }, 2000);
    }
  }

  // Helper für dynamische Aria-Labels und Titles mit Transloco
  getCopyButtonAriaLabel(): string {
    // Nimmt die Schlüssel von 'modals.cartDiscount', falls sie spezifisch sein sollen,
    // oder von 'modals.maintenance', wenn sie identisch sind.
    // Für dieses Beispiel nehme ich an, sie sind identisch in der Struktur.
    const key = this.copyStatus() === 'copied' 
      ? 'modals.cartDiscount.copyCodeButton.ariaLabelCopied' 
      : 'modals.cartDiscount.copyCodeButton.ariaLabelIdle';
    return this.translocoService.translate(key, { code: this.couponCode });
  }

  getCopyButtonTitle(): string {
    const key = this.copyStatus() === 'copied' 
      ? 'modals.cartDiscount.copyCodeButton.titleCopied' 
      : 'modals.cartDiscount.copyCodeButton.titleIdle';
    return this.translocoService.translate(key);
  }
}