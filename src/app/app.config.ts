// /src/app/app.config.ts
import { ApplicationConfig, LOCALE_ID, isDevMode, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideClientHydration, withHttpTransferCacheOptions } from '@angular/platform-browser';
import { provideHttpClient /* HIER WIRD withFetch ENTFERNT */ } from '@angular/common/http'; // withFetch hier importiert lassen, aber unten nicht verwenden

// Firebase-Imports (Kern)
import { initializeApp, provideFirebaseApp, getApp } from '@angular/fire/app';
import { environment } from '../environments/environment';

// Firebase-Imports (Module/Features)
import { getAuth, provideAuth } from '@angular/fire/auth';
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
import { provideTranslocoPersistLang } from '@ngneat/transloco-persist-lang';

registerLocaleData(localeDe, 'de-DE', localeDeExtra);
registerLocaleData(localeEs, 'es');
registerLocaleData(localePl, 'pl');
// --- ENDE LOCALE ---

// Dummy-Storage für Serverseite (für Transloco Persist Lang)
export class NoOpStorage {
  getItem(key: string): string | null {
    return null;
  }
  setItem(key: string, value: string): void {
  }
  removeItem(key: string): void {
  }
}

// Funktion zur Bestimmung der Firebase Functions Region
function getFirebaseRegion(): string {
  if (environment.firebase.functionsUrl) {
    if (environment.firebase.functionsUrl.includes('europe-west1')) return 'europe-west1';
    if (environment.firebase.functionsUrl.includes('europe-west3')) return 'europe-west3';
    if (environment.firebase.functionsUrl.includes('us-central1')) return 'us-central1';
    // Füge weitere Regionen hinzu oder habe eine Standardregion
  }
  return 'europe-west1'; // Fallback-Region, passe dies ggf. an
}


export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    // provideClientHydration(  // TEMPORÄR GANZ AUSKOMMENTIERT FÜR DEN TEST (war schon auskommentiert)
    //   withHttpTransferCacheOptions({
    //     includeHeaders: [
    //       // 'Nonce',
    //       // 'X-WP-Nonce',
    //       // 'X-WC-Store-API-Nonce',
    //       'Cart-Token',
    //     ],
    //   })
    // ),
    provideHttpClient(), // GEÄNDERT: withFetch() entfernt, um XMLHttpRequest zu verwenden
    { provide: LOCALE_ID, useValue: 'de-DE' },
    CurrencyPipe,
    provideMarkdown(),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
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

    provideTranslocoPersistLang({
        storage: {
          useFactory: () => {
            const platformId = inject(PLATFORM_ID);
            if (isPlatformBrowser(platformId)) {
              return localStorage;
            }
            return new NoOpStorage();
          }
        },
    }),
  ]
};