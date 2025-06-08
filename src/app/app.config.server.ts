// /src/app/app.config.server.ts
import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';
import { HTTP_INTERCEPTORS } from '@angular/common/http'; // <-- Importieren
import { ServerStateInterceptor } from './core/interceptors/server-state.interceptor'; // <-- Importieren

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    // NEU: Registriere den neuen Interceptor hier für die Server-Umgebung
    { 
      provide: HTTP_INTERCEPTORS, 
      useClass: ServerStateInterceptor, 
      multi: true 
    },
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);