// /src/app/shared/components/confirmation-modal/confirmation-modal.component.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@ngneat/transloco';

import { UiStateService } from '../../services/ui-state.service';
import { ConfirmationModalData } from '../../services/ui-state.models';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-confirmation-modal',
  standalone: true,
  imports: [CommonModule, TranslocoModule],
  templateUrl: './confirmation-modal.component.html',
  styleUrl: './confirmation-modal.component.scss'
})
export class ConfirmationModalComponent {
  private uiStateService = inject(UiStateService);

  // Holt die Daten für das Modal (Titel, Text, etc.) aus dem Service
  public modalData$: Observable<ConfirmationModalData | null> = this.uiStateService.confirmationModalData$;
  public isVisible$: Observable<boolean> = this.uiStateService.isConfirmationModalVisible$;

  // Diese Methoden werden von den Buttons im Modal aufgerufen
  confirm(): void {
    this.uiStateService.closeConfirmationModal(true);
  }

  cancel(): void {
    this.uiStateService.closeConfirmationModal(false);
  }
}