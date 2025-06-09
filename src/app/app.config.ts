// /src/app/app.config.ts
import { ApplicationConfig, LOCALE_ID, isDevMode, PLATFORM_ID, inject } from '@angular/core';
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

// --- TRANSLOCO IMPORTS ---
import { TranslocoHttpLoader } from './transloco-loader';
import { provideTransloco } from '@ngneat/transloco';
// --- provideTranslocoPersistLang wird hier NICHT mehr importiert ---

// --- BENUTZERDEFINIERTER HTTP INTERCEPTOR ---
import { AuthHttpInterceptor } from './core/interceptors/auth-http.interceptor';

// --- BENUTZERDEFINIERTE ROUTE REUSE STRATEGY ---
import { CustomRouteReuseStrategy } from './core/strategies/custom-route-reuse.service'
registerLocaleData(localeDe, 'de-DE', localeDeExtra);
registerLocaleData(localeEs, 'es');
registerLocaleData(localePl, 'pl');
// --- ENDE LOCALE ---


function getFirebaseRegion(): string {
  if (environment.firebase.functionsUrl) {
    if (environment.firebase.functionsUrl.includes('europe-west1')) return 'europe-west1';
    if (environment.firebase.functionsUrl.includes('europe-west3')) return 'europe-west3';
    if (environment.firebase.functionsUrl.includes('us-central1')) return 'us-central1';
  }
  return 'europe-west1';
}


export const appConfig: ApplicationConfig = {
  providers: [
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
    provideFunctions(() => getFunctions(getApp(), getFirebaseRegion())),
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

    // +++ DER provideTranslocoPersistLang-BLOCK WURDE KOMPLETT ENTFERNT +++
    
  ]
};