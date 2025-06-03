// /src/app/app.component.ts
import { Component, inject, Signal, OnInit, PLATFORM_ID } from '@angular/core'; // OnInit und PLATFORM_ID importieren
import { RouterOutlet } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common'; // isPlatformBrowser importieren
import { environment } from '../environments/environment';
import { MaintenanceComponent } from './maintenance/maintenance.component';
import { HeaderComponent } from './shared/components/header/header.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { LoginOverlayComponent } from './shared/components/login-overlay/login-overlay.component';
import { UiStateService } from './shared/services/ui-state.service';
import { CookieConsentBannerComponent } from './shared/components/cookie-consent-banner/cookie-consent-banner.component';

// +++ NEU: Import für das MaintenanceInfoModalComponent +++
import { MaintenanceInfoModalComponent } from './shared/components/maintenance-info-modal/maintenance-info-modal.component';

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
    CookieConsentBannerComponent,
    MaintenanceInfoModalComponent // +++ NEU: Hier hinzufügen +++
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit { // OnInit implementieren
  maintenanceMode = environment.maintenanceMode;
  currentYear = new Date().getFullYear();

  private uiStateService = inject(UiStateService);
  private platformId = inject(PLATFORM_ID); // PLATFORM_ID injizieren

  isLoginOverlayOpen$: Signal<boolean> = this.uiStateService.isLoginOverlayOpen$;
  
  // +++ NEU: Signal für das Wartungs-Popup +++
  showMaintenancePopup$: Signal<boolean> = this.uiStateService.showMaintenancePopup$;


  // +++ NEU: OnInit Lifecycle Hook +++
  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId) && !this.maintenanceMode) {
      // Das Popup nur im Browser und nicht im Maintenance Mode triggern
      this.uiStateService.triggerMaintenancePopup();
    }
  }
}