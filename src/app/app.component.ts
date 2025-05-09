// /src/app/app.component.ts
import { Component, inject, Signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { environment } from '../environments/environment';
import { MaintenanceComponent } from './maintenance/maintenance.component';
import { HeaderComponent } from './shared/components/header/header.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { LoginOverlayComponent } from './shared/components/login-overlay/login-overlay.component';
import { MiniCartComponent } from './shared/components/mini-cart/mini-cart.component';
import { UiStateService } from './shared/services/ui-state.service';

// +++ NEU: Import für CookieConsentBannerComponent +++
import { CookieConsentBannerComponent } from './shared/components/cookie-consent-banner/cookie-consent-banner.component';

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
    MiniCartComponent,
    CookieConsentBannerComponent // +++ NEU: Hinzugefügt +++
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  maintenanceMode = environment.maintenanceMode;
  currentYear = new Date().getFullYear();

  private uiStateService = inject(UiStateService);
  isLoginOverlayOpen$: Signal<boolean> = this.uiStateService.isLoginOverlayOpen$;
  isMiniCartOpen$: Signal<boolean> = this.uiStateService.isMiniCartOpen$;

  // Es ist nicht nötig, den CookieConsentService hier zu injizieren,
  // da die Logik komplett in der CookieConsentBannerComponent gekapselt ist,
  // die ihren eigenen Service injiziert.
}