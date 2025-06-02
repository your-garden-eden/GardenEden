// /src/app/core/interceptors/auth-http.interceptor.ts
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment'; // Import environment

@Injectable()
export class AuthHttpInterceptor implements HttpInterceptor {

  private platformId = inject(PLATFORM_ID);
  private backendBaseUrl: string;

  // Endpunkte, die explizit KEINEN Authorization-Header benötigen
  private excludedFromAuthHeaderEndpoints: string[] = [
    '/simple-jwt-login/v1/auth',          // Login
    '/simple-jwt-login/v1/users',         // Register (POST), Reset Password (POST), New Password (POST)
    // Pfade, bei denen Token via URL kommt (optional, aber kann Klarheit schaffen):
    // '/simple-jwt-login/v1/auth/validate',
    // '/simple-jwt-login/v1/auth/refresh',
    // '/simple-jwt-login/v1/auth/revoke',
    '/wc/store/v1/',                      // WooCommerce Store API
  ];

  constructor() {
    let tempBaseUrl = environment.woocommerce.apiUrl; // z.B. https://.../wp-json/wc/v3/
    const wcApiSuffix = '/wc/v3/';

    // Stellt sicher, dass die Basis-URL für WP REST API (z.B. /wp-json) korrekt ist
    if (tempBaseUrl.endsWith(wcApiSuffix)) {
      tempBaseUrl = tempBaseUrl.substring(0, tempBaseUrl.length - wcApiSuffix.length);
    }
    // tempBaseUrl sollte jetzt 'https://your-garden-eden-4ujzpfm5qt.live-website.com/wp-json' sein
    this.backendBaseUrl = tempBaseUrl;
    // console.log('[AuthInterceptor] Initialized. Determined backendBaseUrl for WP REST API:', this.backendBaseUrl);
    // console.log('[AuthInterceptor] WooCommerce Store URL for exclusions:', environment.woocommerce.storeUrl);
  }

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // console.log(`[AuthInterceptor] Intercepting: ${request.url} (${request.method})`);

    if (!isPlatformBrowser(this.platformId)) {
      return next.handle(request);
    }

    const isRequestForOurWpApi = request.url.startsWith(this.backendBaseUrl);
    // WooCommerce Store API Anfragen beginnen mit der storeUrl, die KEIN /wp-json enthält
    // z.B. https://your-garden-eden-4ujzpfm5qt.live-website.com/wc/store/v1/cart
    const isRequestForWcStoreApi = request.url.startsWith(environment.woocommerce.storeUrl + '/wc/store/v1/');


    if (!isRequestForOurWpApi && !isRequestForWcStoreApi) {
      // console.log('[AuthInterceptor] Request is not for our backend or WC Store, proceeding without modification.');
      return next.handle(request);
    }

    const wordpressJwt = localStorage.getItem('wordpressJwt');
    let modifiedRequest = request;
    let requestPathForExclusionCheck = '';

    if (isRequestForOurWpApi) {
        requestPathForExclusionCheck = request.url.substring(this.backendBaseUrl.length);
    } else if (isRequestForWcStoreApi) {
        // Der Pfad für den Ausschluss-Check der Store API beginnt mit /wc/store/v1/
        // z.B. request.url = https://.../wc/store/v1/cart
        // environment.woocommerce.storeUrl = https://...
        // Wir brauchen den Teil ab /wc/store/v1/
        const storeApiBasePath = environment.woocommerce.storeUrl;
        if (request.url.startsWith(storeApiBasePath)) {
            requestPathForExclusionCheck = request.url.substring(storeApiBasePath.length);
        }
    }

    const pathOnly = requestPathForExclusionCheck.split('?')[0];
    // console.log('[AuthInterceptor] Relative path for exclusion check:', pathOnly);

    const isSpecificallyExcluded = this.excludedFromAuthHeaderEndpoints.some(
      excludedPath => pathOnly.startsWith(excludedPath)
    );

    // console.log('[AuthInterceptor] Token available:', !!wordpressJwt);
    // console.log('[AuthInterceptor] URL is specifically excluded from Auth Header:', isSpecificallyExcluded);

    if (wordpressJwt && !isSpecificallyExcluded) {
      if (!request.headers.has('Authorization')) {
        // console.log('[AuthInterceptor] Adding JWT to request for:', request.url);
        modifiedRequest = request.clone({
          setHeaders: {
            Authorization: `Bearer ${wordpressJwt}`
          }
        });
      } else {
        // console.log('[AuthInterceptor] Authorization header already present, not overwriting for:', request.url);
      }
    } else {
      // console.log('[AuthInterceptor] Proceeding without adding/modifying Authorization header for:', request.url);
    }

    return next.handle(modifiedRequest);
  }
}