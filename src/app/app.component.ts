// /src/app/app.component.ts
import { Component, inject, Signal } from '@angular/core'; // inject, Signal importiert
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { environment } from '../environments/environment';
import { MaintenanceComponent } from './maintenance/maintenance.component';
import { HeaderComponent } from './shared/components/header/header.component';
import { FooterComponent } from './shared/components/footer/footer.component';

// --- NEU: Imports für Overlay ---
import { LoginOverlayComponent } from './shared/components/login-overlay/login-overlay.component'; // Pfad prüfen!
import { UiStateService } from './shared/services/ui-state.service'; // Pfad prüfen!

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MaintenanceComponent,
    HeaderComponent,
    FooterComponent,
    LoginOverlayComponent // <<< Hinzugefügt
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  maintenanceMode = environment.maintenanceMode;
  currentYear = new Date().getFullYear(); // Bleibt für Footer

  // --- NEU: UiStateService injizieren und Signal verfügbar machen ---
  private uiStateService = inject(UiStateService);
  // Mache das Signal vom Service im Template unter diesem Namen verfügbar
  isLoginOverlayOpen$: Signal<boolean> = this.uiStateService.isLoginOverlayOpen$;

}