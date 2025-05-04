// /src/app/app.config.ts
import { ApplicationConfig, LOCALE_ID } from '@angular/core'; // LOCALE_ID importiert
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router'; // with... hinzugefügt (waren in meinem vorherigen Beispiel)
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

// --- NEU: Import für ngx-markdown ---
import { provideMarkdown } from 'ngx-markdown';

// Routen importieren
import { routes } from './app.routes';

// --- LOCALE DATEN IMPORTIEREN UND REGISTRIEREN ---
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import localeDeExtra from '@angular/common/locales/extra/de';

registerLocaleData(localeDe, 'de-DE', localeDeExtra); // Registrierung bleibt
// --- ENDE LOCALE ---

export const appConfig: ApplicationConfig = {
  providers: [
    // --- Vorhandene Provider ---
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()), // Routing mit Optionen
    provideClientHydration(),
    provideHttpClient(withFetch()), // HttpClient bleibt

    // --- STANDARD LOCALE SETZEN ---
    { provide: LOCALE_ID, useValue: 'de-DE' }, // Locale bleibt

    // --- NEU: Provider für ngx-markdown ---
    provideMarkdown(), // Stellt MarkdownService etc. global bereit

    // --- Firebase Provider ---
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideFunctions(() => getFunctions(getApp(), 'europe-west3')),
    provideStorage(() => getStorage()),
    provideAnalytics(() => getAnalytics()),
    ScreenTrackingService,
    UserTrackingService
    // --- Ende Firebase Provider ---
  ]
};