// /src/app/core/interceptors/auth-http.interceptor.ts
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor } from '@angular/common/http';
import { Observable } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';
// NEU START: AuthService wird benötigt, um an den aktiven Token zu kommen.
import { AuthService } from '../../shared/services/auth.service';
// NEU ENDE

@Injectable()
export class AuthHttpInterceptor implements HttpInterceptor {

  private platformId = inject(PLATFORM_ID);
  // NEU START: AuthService wird injiziert.
  private authService = inject(AuthService);
  // NEU ENDE
  
  // GEÄNDERT START: Basis-URL wird direkt aus der Environment bezogen und die Ausschlussliste angepasst.
  private backendApiUrl = environment.woocommerce.apiUrl.split('/wc/v3/')[0]; // Sollte https://.../wp-json sein

  // Endpunkte, die explizit KEINEN Authorization-Header benötigen, auch wenn ein Token vorhanden ist.
  private excludedFromAuthHeaderEndpoints: string[] = [
    `${this.backendApiUrl}/simple-jwt-login/v1/auth`,       // Login
    `${this.backendApiUrl}/your-garden-eden/v1/guest-token`, // Abrufen des Gast-Tokens
    `${this.backendApiUrl}/your-garden-eden/v1/users/request-password-reset`, // Passwort-Reset anfordern
    `${this.backendApiUrl}/your-garden-eden/v1/users/set-new-password`,       // Neues Passwort setzen
    // Die WooCommerce Store API (/wc/store/v1/) wird separat behandelt, da sie eine andere Basis-URL hat
    // und ihre eigene Header-Logik (z.B. Cart-Token) verwendet.
  ];
  // GEÄNDERT ENDE

  constructor() {
    // console.log('[AuthInterceptor] Initialized. Backend API URL:', this.backendApiUrl);
  }

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // console.log(`[AuthInterceptor] Intercepting: ${request.url} (${request.method})`);

    if (!isPlatformBrowser(this.platformId)) {
      return next.handle(request);
    }

    // GEÄNDERT START: Die Logik wird komplett überarbeitet, um den AuthService und das activeJwt Signal zu nutzen.
    
    // Prüfen, ob die Anfrage an unser Backend geht.
    const isRequestForOurBackend = request.url.startsWith(this.backendApiUrl);
    
    // Anfragen an die WooCommerce Store API werden ignoriert, da sie eine separate Authentifizierung haben.
    if (request.url.includes('/wc/store/v1/')) {
      // console.log('[AuthInterceptor] Request is for WC Store API, proceeding without modification.');
      return next.handle(request);
    }

    if (!isRequestForOurBackend) {
      // console.log('[AuthInterceptor] Request is not for our backend, proceeding without modification.');
      return next.handle(request);
    }
    
    // Prüfen, ob der spezifische Endpunkt von der Authentifizierung ausgenommen ist.
    const isSpecificallyExcluded = this.excludedFromAuthHeaderEndpoints.some(
      excludedUrl => request.url.startsWith(excludedUrl)
    );

    if (isSpecificallyExcluded) {
      // console.log('[AuthInterceptor] URL is specifically excluded from Auth Header, proceeding without modification.');
      return next.handle(request);
    }
    
    // Den aktiven Token (Benutzer oder Gast) vom AuthService holen.
    const activeToken = this.authService.activeJwt();

    let modifiedRequest = request;
    
    if (activeToken) {
      if (!request.headers.has('Authorization')) {
        // console.log('[AuthInterceptor] Adding JWT to request for:', request.url);
        modifiedRequest = request.clone({
          setHeaders: {
            Authorization: `Bearer ${activeToken}`
          }
        });
      } else {
        // console.log('[AuthInterceptor] Authorization header already present, not overwriting for:', request.url);
      }
    } else {
      // console.log('[AuthInterceptor] No active token available, proceeding without modification for:', request.url);
    }

    return next.handle(modifiedRequest);
    // GEÄNDERT ENDE
  }
}