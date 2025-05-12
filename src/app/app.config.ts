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

// --- TRANSLOCO IMPORTS ---
import { TranslocoHttpLoader } from './transloco-loader';
import { provideTransloco } from '@ngneat/transloco'; // TranslocoStorage Import entfernt
import { provideTranslocoPersistLang, TRANSLOCO_PERSIST_LANG_STORAGE } from '@ngneat/transloco-persist-lang';

registerLocaleData(localeDe, 'de-DE', localeDeExtra);
// --- ENDE LOCALE ---

// Dummy-Storage für Serverseite
// Muss die Methoden getItem, setItem, removeItem haben.
export class NoOpStorage {
  getItem(key: string): string | null {
    console.log(`SSR NoOpStorage: getItem called for key ${key}`);
    return null;
  }
  setItem(key: string, value: string): void {
    console.log(`SSR NoOpStorage: setItem called for key ${key} with value ${value}`);
  }
  removeItem(key: string): void {
    console.log(`SSR NoOpStorage: removeItem called for key ${key}`);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideClientHydration(),
    provideHttpClient(withFetch()),
    { provide: LOCALE_ID, useValue: 'de-DE' },
    CurrencyPipe,
    provideMarkdown(),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideFunctions(() => getFunctions(getApp(), 'europe-west3')),
    provideStorage(() => getStorage()),
    provideAnalytics(() => getAnalytics()),
    ScreenTrackingService,
    UserTrackingService,

    provideTransloco({
      config: {
        availableLangs: ['de', 'en', 'hr'],
        defaultLang: 'de',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader
    }),

    // --- PROVIDER FÜR SPRACHPERSISTENZ (SSR-SICHER) ---
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
        // storageKey: 'user-lang',
    }),
  ]
};