// /src/app/app.config.ts
import { ApplicationConfig, LOCALE_ID, isDevMode, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { provideHttpClient, withFetch } from '@angular/common/http';

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
// Locale-Daten für Spanisch und Polnisch (optional, aber gut für Datums-/Zahlenformate)
import localeEs from '@angular/common/locales/es';
import localePl from '@angular/common/locales/pl';


// --- TRANSLOCO IMPORTS ---
import { TranslocoHttpLoader } from './transloco-loader';
import { provideTransloco } from '@ngneat/transloco';
import { provideTranslocoPersistLang } from '@ngneat/transloco-persist-lang'; // TRANSLOCO_PERSIST_LANG_STORAGE hier nicht mehr nötig, wird intern gehandhabt

registerLocaleData(localeDe, 'de-DE', localeDeExtra);
registerLocaleData(localeEs, 'es'); // Registriere Spanisch
registerLocaleData(localePl, 'pl'); // Registriere Polnisch
// --- ENDE LOCALE ---

// Dummy-Storage für Serverseite
export class NoOpStorage {
  getItem(key: string): string | null {
    // console.log(`SSR NoOpStorage: getItem called for key ${key}`);
    return null;
  }
  setItem(key: string, value: string): void {
    // console.log(`SSR NoOpStorage: setItem called for key ${key} with value ${value}`);
  }
  removeItem(key: string): void {
    // console.log(`SSR NoOpStorage: removeItem called for key ${key}`);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideClientHydration(),
    provideHttpClient(withFetch()),
    { provide: LOCALE_ID, useValue: 'de-DE' }, // Standard-Locale bleibt Deutsch
    CurrencyPipe,
    provideMarkdown(),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideFunctions(() => getFunctions(getApp(), 'europe-west3')), // Region ggf. anpassen
    provideStorage(() => getStorage()),
    provideAnalytics(() => getAnalytics()),
    ScreenTrackingService,
    UserTrackingService,

    provideTransloco({
      config: {
        // *** HIER ERWEITERT ***
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
        // storageKey: 'user-lang', // Standard-Key ist okay
    }),
  ]
};