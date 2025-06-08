// /src/app/core/interceptors/server-state.interceptor.ts
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpResponse } from '@angular/common/http';
import { Injectable, PLATFORM_ID, Inject, TransferState, makeStateKey } from '@angular/core'; // KORREKTUR: Import aus @angular/core
import { isPlatformServer } from '@angular/common';
import { Observable, of } from 'rxjs';
import { join } from 'path';
import * as fs from 'fs';

@Injectable()
export class ServerStateInterceptor implements HttpInterceptor {

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    private transferState: TransferState
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Führe diesen Interceptor nur auf dem Server aus
    if (!isPlatformServer(this.platformId)) {
      return next.handle(req);
    }

    const url = req.url;

    // Fange nur Anfragen für lokale Assets ab (.json und .md)
    if (url.startsWith('/assets/') && (url.endsWith('.json') || url.endsWith('.md'))) {
      const stateKey = makeStateKey<string>(url);

      // Prüfen, ob die Daten bereits im TransferState sind
      if (this.transferState.hasKey(stateKey)) {
        const storedData = this.transferState.get(stateKey, null);
        return of(new HttpResponse({ body: storedData, status: 200 }));
      }

      // Finde den Root-Pfad des Projekts. 'process.cwd()' zeigt auf das Verzeichnis,
      // in dem der Build-Befehl ausgeführt wird.
      const projectRoot = process.cwd();
      // Der Pfad, in dem die kompilierten Browser-Assets liegen
      const browserDistFolder = join(projectRoot, 'dist/your-garden-eden/browser');
      const filePath = join(browserDistFolder, url);

      try {
        // Lese die Datei synchron aus dem Dateisystem
        const fileContent = fs.readFileSync(filePath, 'utf-8');

        // Speichere den Inhalt im TransferState, damit der Browser ihn nicht erneut laden muss
        this.transferState.set(stateKey, fileContent);
        
        // Erstelle eine gefälschte HttpResponse mit dem Dateiinhalt
        const response = new HttpResponse({ body: fileContent, status: 200 });
        
        // Gib die gefälschte Antwort als Observable zurück
        return of(response);
      } catch (error) {
        console.error(`[ServerStateInterceptor] Fehler beim Lesen der Datei: ${filePath}`, error);
        // Wenn die Datei nicht gefunden wird, die Anfrage trotzdem an den nächsten Handler weiterleiten.
        return next.handle(req);
      }
    }

    // Für alle anderen Anfragen (z.B. an die WooCommerce-API), fahre normal fort
    return next.handle(req);
  }
}