// /src/app/app.config.ts
import { ApplicationConfig, LOCALE_ID, isDevMode, PLATFORM_ID, inject, APP_INITIALIZER } from '@angular/core';
import { AuthService } from './shared/services/auth.service';
import { isPlatformBrowser } from '@angular/common';
import {
  provideRouter,
  withComponentInputBinding,
  withViewTransitions,
  withInMemoryScrolling,
  RouteReuseStrategy
} from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { provideHttpClient, HTTP_INTERCEPTORS, withInterceptorsFromDi, withFetch } from '@angular/common/http';
import { Observable } from 'rxjs';

// Firebase-Imports (Kern)
import { initializeApp, provideFirebaseApp, getApp } from '@angular/fire/app';
import { environment } from '../environments/environment';

// Firebase-Imports (Module/Features)
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';
import { getStorage, provideStorage } from '@angular/fire/storage';
import { provideAnalytics, getAnalytics, ScreenTrackingService, UserTrackingService } from '@angular/fire/analytics';

// Import für ngx-markdown
import { provideMarkdown } from 'ngx-markdown';

// Routen importieren
import { routes } from './app.routes';

// --- LOCALE DATEN IMPORTIEREN UND REGISTRIEREN ---
import { registerLocaleData, CurrencyPipe } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import localeDeExtra from '@angular/common/locales/extra/de';
import localeEs from '@angular/common/locales/es';
import localePl from '@angular/common/locales/pl';
// KORREKTUR START: Fehlende Locales für en und hr hinzufügen
import localeEn from '@angular/common/locales/en';
import localeHr from '@angular/common/locales/hr';
// KORREKTUR ENDE

// --- TRANSLOCO IMPORTS ---
import { TranslocoHttpLoader } from './transloco-loader';
import { provideTransloco } from '@ngneat/transloco';

// --- BENUTZERDEFINIERTER HTTP INTERCEPTOR ---
import { AuthHttpInterceptor } from './core/interceptors/auth-http.interceptor';

// --- BENUTZERDEFINIERTE ROUTE REUSE STRATEGY ---
import { CustomRouteReuseStrategy } from './core/strategies/custom-route-reuse.service'

// KORREKTUR START: Alle verfügbaren Locales registrieren
registerLocaleData(localeDe, 'de-DE', localeDeExtra);
registerLocaleData(localeEs, 'es');
registerLocaleData(localePl, 'pl');
registerLocaleData(localeEn, 'en');
registerLocaleData(localeHr, 'hr');
// KORREKTUR ENDE
// --- ENDE LOCALE ---


export function appInitializerFactory(authService: AuthService): () => Observable<any> {
  return () => authService.init();
}


export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: appInitializerFactory,
      deps: [AuthService],
      multi: true
    },
    provideRouter(
      routes,
      withComponentInputBinding(),
      withViewTransitions(),
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      })
    ),
    
    provideHttpClient(
      withInterceptorsFromDi(),
      withFetch()
    ),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthHttpInterceptor,
      multi: true,
    },

    {
      provide: RouteReuseStrategy,
      useClass: CustomRouteReuseStrategy
    },

    { provide: LOCALE_ID, useValue: 'de-DE' },
    CurrencyPipe,
    provideMarkdown(),

    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideFirestore(() => getFirestore()),
    provideFunctions(() => getFunctions(getApp(), 'europe-west1')),
    provideStorage(() => getStorage()),
    provideAnalytics(() => getAnalytics()),
    ScreenTrackingService,
    UserTrackingService,

    provideTransloco({
      config: {
        availableLangs: ['de', 'en', 'hr', 'es', 'pl'],
        defaultLang: 'de',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader
    }),
  ]
};