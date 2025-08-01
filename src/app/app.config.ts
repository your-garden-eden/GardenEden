// /src/app/app.config.ts

import { ApplicationConfig, LOCALE_ID, isDevMode, APP_INITIALIZER, makeStateKey, TransferState } from '@angular/core';
import { AuthService } from './shared/services/auth.service';
import {
  provideRouter,
  withComponentInputBinding,
  withViewTransitions,
  withInMemoryScrolling,
  RouteReuseStrategy,
  TitleStrategy
} from '@angular/router';
import { provideClientHydration, withHttpTransferCacheOptions } from '@angular/platform-browser';
import { provideHttpClient, HTTP_INTERCEPTORS, withInterceptorsFromDi, withFetch } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';

// Firebase-Imports
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { environment } from '../environments/environment';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';
import { getStorage, provideStorage } from '@angular/fire/storage';

// Andere Imports
import { provideMarkdown } from 'ngx-markdown';
import { routes } from './app.routes';
import { registerLocaleData, CurrencyPipe } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import localeDeExtra from '@angular/common/locales/extra/de';
import localeEs from '@angular/common/locales/es';
import localePl from '@angular/common/locales/pl';
import localeEn from '@angular/common/locales/en';
import localeHr from '@angular/common/locales/hr';

import { provideTransloco, TranslocoService } from '@ngneat/transloco';
import { TranslocoHttpLoader } from './transloco-loader';

import { AuthHttpInterceptor } from './core/interceptors/auth-http.interceptor';
import { CustomRouteReuseStrategy } from './core/strategies/custom-route-reuse.service';
import { SeoTitleStrategy } from './core/strategies/seo-title.strategy';

registerLocaleData(localeDe, 'de-DE', localeDeExtra);
registerLocaleData(localeEs, 'es');
registerLocaleData(localePl, 'pl');
registerLocaleData(localeEn, 'en');
registerLocaleData(localeHr, 'hr');

// Factory für den Auth-Service
export function appInitializerFactory(authService: AuthService): () => Observable<any> {
  // Diese Funktion sorgt dafür, dass Angular auf den Abschluss von initAuth() wartet.
  return () => authService.initAuth();
}

// Factory für Transloco
export function translocoInitializerFactory(
  transloco: TranslocoService,
  transferState: TransferState
): () => Promise<any> {
  return async () => {
    const lang = transloco.getActiveLang();
    const TRANSLATION_KEY = makeStateKey<any>(`translation-${lang}`);

    if (transferState.hasKey(TRANSLATION_KEY)) {
      const translation = transferState.get(TRANSLATION_KEY, {});
      transloco.setTranslation(translation, lang);
    } else {
      const translation = await firstValueFrom(transloco.load(lang));
      transferState.set(TRANSLATION_KEY, translation);
    }
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    // WICHTIG: Der APP_INITIALIZER für die Authentifizierung
    {
      provide: APP_INITIALIZER,
      useFactory: appInitializerFactory,
      deps: [AuthService],
      multi: true
    },
    // APP_INITIALIZER für Übersetzungen
    {
      provide: APP_INITIALIZER,
      useFactory: translocoInitializerFactory,
      deps: [TranslocoService, TransferState],
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
    
    provideClientHydration(
      withHttpTransferCacheOptions({
        includePostRequests: true,
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
    {
      provide: TitleStrategy,
      useClass: SeoTitleStrategy,
    },
    { provide: LOCALE_ID, useValue: 'de-DE' },
    CurrencyPipe,
    provideMarkdown(),

    // Firebase Core Services
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideFirestore(() => getFirestore()),
    provideFunctions(() => getFunctions()),
    provideStorage(() => getStorage()),

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