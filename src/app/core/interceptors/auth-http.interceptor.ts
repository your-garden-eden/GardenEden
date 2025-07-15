// /src/app/core/interceptors/auth-http.interceptor.ts

import { Injectable, inject } from '@angular/core';
import { HttpEvent, HttpInterceptor, HttpHandler, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../../shared/services/auth.service';
import { environment } from '../../../environments/environment';

@Injectable()
export class AuthHttpInterceptor implements HttpInterceptor {
  private authService = inject(AuthService);
  // Die Basis-URL deiner API, an die der Token gesendet werden soll
  private apiUrl = environment.woocommerce.apiUrl.split('/wc/v3/')[0];

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const activeToken = this.authService.activeJwt();

    // Füge den Header nur hinzu, wenn die Anfrage an deine API geht und ein Token existiert
    if (activeToken && req.url.startsWith(this.apiUrl)) {
      // Bestimmte Endpunkte, die explizit keinen Token benötigen (z.B. Login selbst)
      const excludedEndpoints = [
        '/jwt-auth/v1/token',
        '/your-garden-eden/v1/guest-token'
      ];

      // Prüfen, ob die URL einen der ausgeschlossenen Pfade enthält
      const isExcluded = excludedEndpoints.some(endpoint => req.url.includes(endpoint));

      if (!isExcluded) {
        const authReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${activeToken}`
          }
        });
        return next.handle(authReq);
      }
    }

    // Für alle anderen Anfragen die Originalanfrage weiterleiten
    return next.handle(req);
  }
}