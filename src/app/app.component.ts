// /src/app/app.component.ts
import { Component, inject, Signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { environment } from '../environments/environment';
import { MaintenanceComponent } from './maintenance/maintenance.component';
import { HeaderComponent } from './shared/components/header/header.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { LoginOverlayComponent } from './shared/components/login-overlay/login-overlay.component';
// --- NEU: Import für MiniCart ---
import { MiniCartComponent } from './shared/components/mini-cart/mini-cart.component'; // Pfad prüfen!
import { UiStateService } from './shared/services/ui-state.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MaintenanceComponent,
    HeaderComponent,
    FooterComponent,
    LoginOverlayComponent,
    MiniCartComponent // <<< Hinzugefügt
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  maintenanceMode = environment.maintenanceMode;
  currentYear = new Date().getFullYear();

  // --- UiStateService injizieren und Signale verfügbar machen ---
  private uiStateService = inject(UiStateService);
  isLoginOverlayOpen$: Signal<boolean> = this.uiStateService.isLoginOverlayOpen$;
  // --- NEU: Signal für MiniCart ---
  isMiniCartOpen$: Signal<boolean> = this.uiStateService.isMiniCartOpen$;

}