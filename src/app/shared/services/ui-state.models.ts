// /src/app/shared/services/ui-state.models.ts

// Definiert die Daten, die unser Bestätigungs-Modal benötigt
export interface ConfirmationModalData {
  titleKey: string; // z.B. 'wishlistPage.confirmClear.title'
  messageKey: string; // z.B. 'wishlistPage.confirmClear.message'
  confirmButtonKey?: string; // z.B. 'general.actions.delete', Standard ist 'general.actions.confirm'
  cancelButtonKey?: string; // z.B. 'general.actions.cancel', Standard ist 'general.actions.cancel'
  confirmButtonClass?: 'primary' | 'danger' | 'secondary'; // CSS-Klasse für den Bestätigen-Button
}