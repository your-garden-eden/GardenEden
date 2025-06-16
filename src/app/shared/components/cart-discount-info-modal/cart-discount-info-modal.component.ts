// /src/app/shared/components/cart-discount-info-modal/cart-discount-info-modal.component.ts
import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiStateService } from '../../services/ui-state.service';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
// KORREKTUR: LoadingSpinnerComponent entfernt, da nicht mehr im Template verwendet.
import { SafeHtmlPipe } from '../../pipes/safe-html.pipe';

@Component({
  selector: 'app-cart-discount-info-modal',
  standalone: true,
  imports: [
    CommonModule, 
    TranslocoModule,
    SafeHtmlPipe
  ],
  templateUrl: './cart-discount-info-modal.component.html',
  styleUrls: ['./cart-discount-info-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartDiscountInfoModalComponent {
  public uiStateService = inject(UiStateService);
  private translocoService = inject(TranslocoService);

  readonly couponCode = 'DeinGartenEden';
  public copyStatus = signal<'idle' | 'copied' | 'error' | 'unsupported'>('idle');

  public closeModal(): void {
    this.uiStateService.hideCartDiscountPopup();
  }

  public applyCouponAndClose(): void {
    this.closeModal();
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

  getCopyButtonAriaLabel(): string {
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