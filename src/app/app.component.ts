// /src/app/app.component.ts
import { Component, inject, OnInit, PLATFORM_ID, Inject } from '@angular/core';
import { Router, RouterOutlet, NavigationStart, NavigationEnd, NavigationCancel, NavigationError, ActivatedRoute, ActivatedRouteSnapshot } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { environment } from '../environments/environment';
import { MaintenanceComponent } from './maintenance/maintenance.component';
import { HeaderComponent } from './shared/components/header/header.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { LoginOverlayComponent } from './shared/components/login-overlay/login-overlay.component';
import { UiStateService } from './shared/services/ui-state.service';
import { CookieConsentBannerComponent } from './shared/components/cookie-consent-banner/cookie-consent-banner.component';
import { MaintenanceInfoModalComponent } from './shared/components/maintenance-info-modal/maintenance-info-modal.component';
import { ConfirmationModalComponent } from './shared/components/confirmation-modal/confirmation-modal.component';
import { CartDiscountInfoModalComponent } from './shared/components/cart-discount-info-modal/cart-discount-info-modal.component';
import { TranslocoService } from '@ngneat/transloco';
import { TrackingService } from './core/services/tracking.service';
import { filter } from 'rxjs';
import { LoadingSpinnerComponent } from './shared/components/loading-spinner/loading-spinner.component';
// NEUE IMPORTE für JSON-LD
import { JsonLdService, Schema } from './core/services/json-ld.service';

interface Breadcrumb {
  label: string;
  url: string;
}

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
    MaintenanceInfoModalComponent,
    ConfirmationModalComponent,
    CartDiscountInfoModalComponent,
    LoadingSpinnerComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  maintenanceMode = environment.maintenanceMode;
  currentYear = new Date().getFullYear();

  public uiStateService = inject(UiStateService);
  private translocoService = inject(TranslocoService);
  private trackingService = inject(TrackingService);
  private router = inject(Router);
  // NEUE INJEKTIONEN
  private activatedRoute = inject(ActivatedRoute);
  private jsonLdService = inject(JsonLdService);

  public readonly isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    
    this.subscribeToRouterEvents();
  }

  ngOnInit(): void {
    if (this.isBrowser) {
      this.initializeLanguage();
      if (!this.maintenanceMode) {
        this.uiStateService.triggerMaintenancePopup();
      }
    }
  }

  private subscribeToRouterEvents(): void {
    this.router.events.pipe(
      filter(event => 
        event instanceof NavigationStart || 
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      )
    ).subscribe(event => {
      if (event instanceof NavigationStart) {
        this.uiStateService.isRouting.set(true);
      } else {
        this.uiStateService.isRouting.set(false);
      }

      // Bei erfolgreicher Navigation die JSON-LD-Schemata aktualisieren.
      if (event instanceof NavigationEnd) {
        this.updateJsonLdSchemas(event);
      }
    });
  }

  private initializeLanguage(): void {
    const LANG_KEY = 'transloco-lang';
    const savedLang = localStorage.getItem(LANG_KEY);

    if (savedLang) {
      this.translocoService.setActiveLang(savedLang);
      return;
    }

    const browserLang = navigator.language.split('-')[0];
    const availableLangs = this.translocoService.getAvailableLangs() as string[];

    if (availableLangs.includes(browserLang)) {
      this.translocoService.setActiveLang(browserLang);
    }
  }

  // --- NEUE METHODEN FÜR JSON-LD ---

  /**
   * Orchestriert die Aktualisierung aller globalen JSON-LD-Schemata.
   */
  private updateJsonLdSchemas(event: NavigationEnd): void {
    this.buildAndSetWebsiteSchema(event.urlAfterRedirects);
    this.buildAndSetBreadcrumbSchema(this.activatedRoute.snapshot);
  }

  /**
   * Erstellt und setzt das WebSite-Schema, nur für die Homepage.
   */
  private buildAndSetWebsiteSchema(currentUrl: string): void {
    if (currentUrl === '/') {
      const schema: Schema = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        'url': environment.baseUrl,
        'name': 'Your Garden Eden',
        'potentialAction': {
          '@type': 'SearchAction',
          'target': `${environment.baseUrl}/suche?q={search_term_string}`,
          'query-input': 'required name=search_term_string'
        }
      };
      this.jsonLdService.setSchema('website', schema);
    } else {
      this.jsonLdService.removeSchema('website');
    }
  }

  /**
   * Erstellt und setzt das BreadcrumbList-Schema für die aktuelle Route.
   */
  private buildAndSetBreadcrumbSchema(route: ActivatedRouteSnapshot): void {
    const breadcrumbs = this.createBreadcrumbs(route);

    if (breadcrumbs.length > 1) { // Nur anzeigen, wenn mehr als nur "Home" da ist.
      const itemListElement = breadcrumbs.map((breadcrumb, index) => ({
        '@type': 'ListItem',
        'position': index + 1,
        'name': breadcrumb.label,
        'item': `${environment.baseUrl}${breadcrumb.url}`
      }));

      const schema: Schema = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': itemListElement
      };
      this.jsonLdService.setSchema('breadcrumb', schema);
    } else {
      this.jsonLdService.removeSchema('breadcrumb');
    }
  }

  /**
   * Rekursive Funktion zum Erstellen der Breadcrumb-Hierarchie aus der Route.
   */
  private createBreadcrumbs(route: ActivatedRouteSnapshot | null, url: string = '', breadcrumbs: Breadcrumb[] = []): Breadcrumb[] {
    if (!route) {
      return breadcrumbs;
    }

    // Start mit "Home"
    if (breadcrumbs.length === 0) {
      breadcrumbs.push({ label: this.translocoService.translate('breadcrumbs.home'), url: '/' });
    }
    
    const routeUrl: string = route.url.map(segment => segment.path).join('/');
    if (routeUrl) {
      url += `/${routeUrl}`;

      // Label aus Route-Daten oder Resolver-Daten extrahieren
      let label = '';
      if (route.data['breadcrumb']) {
        label = this.translocoService.translate(route.data['breadcrumb']);
      } else if (route.data['product']) {
        label = route.data['product'].name;
      } else if (route.data['category']) {
        label = route.data['category'].name;
      }

      if (label) {
        breadcrumbs.push({ label, url });
      }
    }

    return this.createBreadcrumbs(route.firstChild, url, breadcrumbs);
  }
}