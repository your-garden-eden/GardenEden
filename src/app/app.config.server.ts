// /src/app/app.config.server.ts
import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering()
    // Der ServerStateInterceptor wird komplett entfernt.
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);