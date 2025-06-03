import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiStateService } from '../../services/ui-state.service';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco'; // TranslocoService importiert

@Component({
  selector: 'app-maintenance-info-modal',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  templateUrl: './maintenance-info-modal.component.html',
  styleUrls: ['./maintenance-info-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaintenanceInfoModalComponent {
  public uiStateService = inject(UiStateService);
  private translocoService = inject(TranslocoService); // TranslocoService injiziert
  
  readonly couponCode = 'DeinGartenEden'; // Bleibt hier, da es ein fester Wert ist
  public copyStatus = signal<'idle' | 'copied' | 'error' | 'unsupported'>('idle');

  public closeModal(): void {
    this.uiStateService.hideMaintenancePopup();
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
    const key = this.copyStatus() === 'copied' 
      ? 'modals.maintenance.copyCodeButton.ariaLabelCopied' 
      : 'modals.maintenance.copyCodeButton.ariaLabelIdle';
    return this.translocoService.translate(key, { code: this.couponCode });
  }

  getCopyButtonTitle(): string {
    const key = this.copyStatus() === 'copied' 
      ? 'modals.maintenance.copyCodeButton.titleCopied' 
      : 'modals.maintenance.copyCodeButton.titleIdle';
    return this.translocoService.translate(key);
  }
}