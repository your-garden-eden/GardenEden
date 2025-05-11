// /src/app/app.config.ts
import { ApplicationConfig, LOCALE_ID, isDevMode } from '@angular/core';
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
// CurrencyPipe importieren!
import { registerLocaleData, CurrencyPipe } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import localeDeExtra from '@angular/common/locales/extra/de';
import { TranslocoHttpLoader } from './transloco-loader';
import { provideTransloco } from '@ngneat/transloco';

registerLocaleData(localeDe, 'de-DE', localeDeExtra);
// --- ENDE LOCALE ---

export const appConfig: ApplicationConfig = {
  providers: [
    // --- Vorhandene Provider ---
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideClientHydration(),
    provideHttpClient(withFetch()), // Behalte diesen, er ist der korrekte mit withFetch()

    // --- STANDARD LOCALE SETZEN ---
    { provide: LOCALE_ID, useValue: 'de-DE' },

    // --- CurrencyPipe Provider hinzufügen ---
    CurrencyPipe,

    // --- Provider für ngx-markdown ---
    provideMarkdown(),

    // --- Firebase Provider ---
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideFunctions(() => getFunctions(getApp(), 'europe-west3')), // Region angepasst
    provideStorage(() => getStorage()),
    provideAnalytics(() => getAnalytics()),
    ScreenTrackingService,
    UserTrackingService,
    // Der doppelte provideHttpClient() wurde hier entfernt
    provideTransloco({
        config: {
          availableLangs: ['de', 'en', 'hr'], // 'de' hinzugefügt
          defaultLang: 'de',                // Auf 'de' geändert
          // Remove this option if your application doesn't support changing language in runtime.
          reRenderOnLangChange: true,
          prodMode: !isDevMode(),
        },
        loader: TranslocoHttpLoader
      })
    // --- Ende Firebase Provider ---
  ]
};