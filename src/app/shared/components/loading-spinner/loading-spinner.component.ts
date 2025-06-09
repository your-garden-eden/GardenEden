// /src/app/shared/components/loading-spinner/loading-spinner.component.ts
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common'; // +++ NEU: CommonModule importieren

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule], // +++ NEU: CommonModule hier hinzufügen
  templateUrl: './loading-spinner.component.html',
  styleUrl: './loading-spinner.component.scss'
})
export class LoadingSpinnerComponent {
  /**
   * Steuert, ob der halb-transparente, seitenfüllende Overlay-Hintergrund angezeigt wird.
   * @default true - Das Overlay wird standardmäßig angezeigt.
   * Setze es auf `false`, wenn der Spinner "inline" ohne blockierenden Hintergrund erscheinen soll.
   */
  @Input() showOverlay: boolean = true;

  /**
   * Bestimmt den Durchmesser des Spinners in Pixeln.
   * @default 50
   */
  @Input() diameter: number = 50;
}