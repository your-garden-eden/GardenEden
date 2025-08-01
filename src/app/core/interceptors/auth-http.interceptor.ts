// In src/app/core/interceptors/auth-http.interceptor.ts

import { Injectable, inject } from '@angular/core';
import { HttpEvent, HttpInterceptor, HttpHandler, HttpRequest, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators'; // WICHTIG: Imports hinzufügen
import { AuthService } from '../../shared/services/auth.service';
import { environment } from '../../../environments/environment';

@Injectable()
export class AuthHttpInterceptor implements HttpInterceptor {
  private authService = inject(AuthService);
  private apiUrl = environment.woocommerce.apiUrl.split('/wc/v3/')[0];

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const activeToken = this.authService.activeJwt();

    if (activeToken && req.url.startsWith(this.apiUrl)) {
      const excludedEndpoints = [
        '/jwt-auth/v1/token',
        '/your-garden-eden/v1/guest-token'
      ];
      const isExcluded = excludedEndpoints.some(endpoint => req.url.includes(endpoint));

      if (!isExcluded) {
        const authReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${activeToken}`
          }
        });
        // ERWEITERUNG: Fehlerbehandlung hinzufügen
        return this.handleRequest(authReq, next);
      }
    }

    return next.handle(req);
  }

  // NEUE HELPER-METHODE FÜR FEHLERBEHANDLUNG
  private handleRequest(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        // Prüfen, ob es sich um den spezifischen "Ungültige Signatur"-Fehler handelt
        const isInvalidTokenError = error.status === 403 && 
                                    error.error?.code?.includes('jwt_auth_invalid_token');

        if (isInvalidTokenError) {
          // Wenn ja, starte den Self-Healing-Prozess
          return this.authService.handleInvalidTokenAndRetry(req, next);
        }

        // Für alle anderen Fehler, den Fehler einfach weiterwerfen
        return throwError(() => error);
      })
    );
  }
}