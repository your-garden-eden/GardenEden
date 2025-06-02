// /src/app/shared/services/auth.service.ts
import { Injectable, inject, signal, WritableSignal, PLATFORM_ID, OnDestroy } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, throwError, of, Subscription } from 'rxjs';
import { catchError, tap, map, switchMap, finalize } from 'rxjs/operators';
import { isPlatformBrowser } from '@angular/common';
// Kein Import von environment.ts, da URLs hartcodiert sind
import { TranslocoService } from '@ngneat/transloco';

// --- TYPSICHERE API RESPONSE INTERFACES ---
export interface WordPressAuthResponse<TData> {
  success: boolean;
  data?: TData;
  message?: string;
  statusCode?: number;
  error?: string;
  error_description?: string;
  errors?: { [key: string]: string[] };
  code?: string;
}

export interface WordPressUserFromAuth {
  ID?: string | number;
  id?: string | number;
  user_login?: string;
  user_nicename?: string;
  user_email?: string;
  email?: string;
  user_url?: string;
  user_registered?: string;
  user_activation_key?: string;
  user_status?: string;
  display_name?: string;
  roles?: string[];
  data?: {
    ID?: string | number;
    user_login?: string;
    user_email?: string;
    display_name?: string;
  };
  first_name?: string; // Hinzugefügt für Vollständigkeit
  last_name?: string;  // Hinzugefügt für Vollständigkeit
}

export interface WordPressLoginResponseData {
  jwt: string;
  user?: WordPressUserFromAuth;
  refresh_token?: string;
  id?: number;
  user_email?: string;
  user_nicename?: string;
  user_display_name?: string;
}

export interface WordPressRegisterSuccessData {
  message?: string;
  ID?: number;
  user_login?: string;
  user_email?: string;
  jwt?: string;
  refresh_token?: string;
}

export interface WordPressRefreshResponseData {
  jwt: string;
  refresh_token?: string;
  user?: WordPressUserFromAuth;
  id?: number;
  user_email?: string;
  user_nicename?: string;
  user_display_name?: string;
}

export interface WordPressTokenDetailsInValidate {
  token: string;
  header?: { typ?: string; alg?: string };
  payload?: {
    iat?: number; exp?: number; email?: string; id?: string | number;
    site?: string; username?: string; iss?: string;
  };
  expire_in?: number;
}

export interface WordPressValidateInnerData {
  user: WordPressUserFromAuth;
  jwt?: WordPressTokenDetailsInValidate | WordPressTokenDetailsInValidate[];
  roles?: string[];
  message?: string;
  code?: string;
}
// --- END: TYPSICHERE API RESPONSE INTERFACES ---

export interface WordPressUser {
  id: number;
  email: string;
  displayName: string;
  username?: string;
  roles: string[];
  jwt: string;
  refreshToken?: string;
  firstName?: string;
  lastName?: string;
}

export interface ConfirmPasswordResetPayload { key: string; login: string; new_password: string; }
export interface WordPressRegisterData {
  email: string;
  password?: string;
  user_login?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService implements OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);
  private translocoService = inject(TranslocoService);

  private wordpressApiUrl = 'https://your-garden-eden-4ujzpfm5qt.live-website.com/wp-json';
  private jwtPluginNamespace = 'simple-jwt-login';
  private simpleJwtLoginBase = `${this.wordpressApiUrl}/${this.jwtPluginNamespace}/v1`;

  private loginUrl = `${this.simpleJwtLoginBase}/auth`;
  private registerUrl = `${this.simpleJwtLoginBase}/users`;
  private validateTokenUrl = `${this.simpleJwtLoginBase}/auth/validate`;
  private refreshTokenUrl = `${this.simpleJwtLoginBase}/auth/refresh`;
  private revokeTokenUrl = `${this.simpleJwtLoginBase}/auth/revoke`;
  private requestPasswordResetUrl = `${this.simpleJwtLoginBase}/users/reset_password`;
  private confirmPasswordResetUrl = `${this.simpleJwtLoginBase}/users/new_password`;

  private wpTokenKey = 'wordpress_jwt_token';
  private wpRefreshTokenKey = 'wordpress_refresh_token';
  private wpUserKey = 'wordpress_user_data';

  private currentWordPressUserSubject = new BehaviorSubject<WordPressUser | null>(this.loadUserFromLocalStorage());
  public currentWordPressUser$: Observable<WordPressUser | null> = this.currentWordPressUserSubject.asObservable();
  public isLoggedIn$: Observable<boolean> = this.currentWordPressUser$.pipe(map(user => !!user && !!user.jwt));

  public isLoading: WritableSignal<boolean> = signal(false);
  public authError: WritableSignal<string | null> = signal(null);
  public successMessage: WritableSignal<string | null> = signal(null);
  private successMessageKey: WritableSignal<string | null> = signal(null);

  private initSubscription: Subscription | undefined;
  private refreshTimer: any;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      console.log('[AuthService] Constructor: Loading user and attempting validation/refresh.');
      this.initSubscription = this.loadUserFromStorageAndValidateOrRefresh().subscribe();
    }
  }

  ngOnDestroy(): void {
    this.initSubscription?.unsubscribe();
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); }
  }

  private loadUserFromLocalStorage(): WordPressUser | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    const token = localStorage.getItem(this.wpTokenKey);
    const refreshToken = localStorage.getItem(this.wpRefreshTokenKey);
    const userJson = localStorage.getItem(this.wpUserKey);
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson) as WordPressUser;
        user.jwt = token; user.refreshToken = refreshToken ?? undefined;
        return user;
      } catch (e) { console.error('[AuthService] Error parsing user from localStorage', e); this.clearLocalUserData(); }
    }
    return null;
  }

  public getStoredToken(): string | null {
    return isPlatformBrowser(this.platformId) ? localStorage.getItem(this.wpTokenKey) : null;
  }

  private getStoredRefreshToken(): string | null {
    return isPlatformBrowser(this.platformId) ? localStorage.getItem(this.wpRefreshTokenKey) : null;
  }

  private storeAuthData(user: WordPressUser, token: string, refreshToken?: string): void {
    const userToStore: WordPressUser = { ...user, jwt: token, refreshToken: refreshToken ?? user.refreshToken ?? undefined };
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.wpTokenKey, token);
      if (userToStore.refreshToken) localStorage.setItem(this.wpRefreshTokenKey, userToStore.refreshToken);
      else localStorage.removeItem(this.wpRefreshTokenKey);
      localStorage.setItem(this.wpUserKey, JSON.stringify(userToStore));
    }
    this.currentWordPressUserSubject.next(userToStore);
    this.authError.set(null);
    this.scheduleTokenRefresh(token);
    console.log('[AuthService] Auth Data Stored. User:', userToStore.email, 'JWT set.');
  }

  private clearLocalUserData(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(this.wpTokenKey); localStorage.removeItem(this.wpRefreshTokenKey); localStorage.removeItem(this.wpUserKey);
    }
    this.currentWordPressUserSubject.next(null); this.authError.set(null);
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); this.refreshTimer = null; }
    console.log('[AuthService] Cleared all local auth data.');
  }

  private loadUserFromStorageAndValidateOrRefresh(): Observable<WordPressUser | null> {
    console.log('[AuthService] loadUserFromStorageAndValidateOrRefresh CALLED');
    this.isLoading.set(true); const storedUser = this.loadUserFromLocalStorage();
    if (storedUser?.jwt) {
      return this.validateToken(storedUser.jwt).pipe(
        switchMap(validUserDetails => {
          if (validUserDetails) {
            console.log('[AuthService] Token validation successful from storage.');
            const finalUser: WordPressUser = { ...validUserDetails, jwt: storedUser.jwt!, refreshToken: storedUser.refreshToken };
            this.storeAuthData(finalUser, finalUser.jwt, finalUser.refreshToken); return of(finalUser);
          } else if (storedUser.refreshToken) {
            console.warn('[AuthService] Token validation FAILED, attempting refresh.');
            return this.refreshTokenInternal(storedUser.refreshToken);
          } else {
            console.warn('[AuthService] Token validation FAILED, no refresh token. Clearing local data.');
            this.clearLocalUserData(); return of(null);
          }
        }),
        catchError((err) => { this.clearLocalUserData(); return of(null); }),
        finalize(() => this.isLoading.set(false))
      );
    } else {
      this.clearLocalUserData(); this.isLoading.set(false); return of(null);
    }
  }

  private handleAuthSuccess(responseData: WordPressLoginResponseData | WordPressRefreshResponseData, operation: 'Login' | 'Refresh'): Observable<WordPressUser> {
    console.log(`[AuthService] handleAuthSuccess for '${operation}'.`);
    this.isLoading.set(true); const newJwt = responseData.jwt; const newRefreshToken = responseData.refresh_token;
    const directUserPayload = (responseData as WordPressLoginResponseData).user || responseData as WordPressLoginResponseData;
    const userIdFromPayload = Number((directUserPayload as any).ID || (directUserPayload as any).id);
    const userEmailFromPayload = (directUserPayload as any).user_email || (directUserPayload as any).email;

    if (userIdFromPayload && userEmailFromPayload) {
      const user: WordPressUser = {
        id: userIdFromPayload, email: userEmailFromPayload,
        displayName: (directUserPayload as any).display_name || (directUserPayload as any).user_display_name || (directUserPayload as any).user_login || userEmailFromPayload.split('@')[0],
        username: (directUserPayload as any).user_login, roles: (directUserPayload as WordPressUserFromAuth).roles || [],
        firstName: (directUserPayload as WordPressUserFromAuth).first_name,
        lastName: (directUserPayload as WordPressUserFromAuth).last_name,
        jwt: newJwt, refreshToken: newRefreshToken || this.getStoredRefreshToken() || undefined
      };
      this.storeAuthData(user, newJwt, user.refreshToken); this.isLoading.set(false); return of(user);
    } else {
      return this.validateToken(newJwt).pipe(
        map(userDetails => {
          if (userDetails) {
            const userToStore: WordPressUser = { ...userDetails, jwt: newJwt, refreshToken: newRefreshToken || this.getStoredRefreshToken() || undefined };
            this.storeAuthData(userToStore, newJwt, userToStore.refreshToken); return userToStore;
          } else {
            this.clearLocalUserData(); const errorMsg = `Konnte Benutzerdetails nach ${operation} nicht validieren.`;
            this.authError.set(errorMsg); throw new Error(errorMsg);
          }
        }),
        catchError(valErr => {
          this.clearLocalUserData(); const errorMsg = `Benutzerverifizierung nach ${operation} fehlgeschlagen: ${valErr.message||valErr}`;
          this.authError.set(errorMsg); return throwError(() => new Error(errorMsg));
        }),
        finalize(() => this.isLoading.set(false))
      );
    }
  }

  login(credentials: { emailOrUsername: string; password: string }): Observable<WordPressUser> {
    this.isLoading.set(true); this.authError.set(null);
    const payload = { email: credentials.emailOrUsername, password: credentials.password };
    return this.http.post<WordPressAuthResponse<WordPressLoginResponseData>>(this.loginUrl, payload).pipe(
      switchMap(response => {
        if (response.success && response.data?.jwt) { return this.handleAuthSuccess(response.data, 'Login'); }
        else {
          const errorMsg = response.message || (response.data as any)?.message || response.error_description || 'Login fehlgeschlagen.';
          throw new HttpErrorResponse({ error: { message: errorMsg, ...response.data, code: response.code }, status: response.statusCode || 400 });
        }
      }),
      catchError(err => this.handleError(err, 'Login')),
      finalize(() => this.isLoading.set(false))
    );
  }

  register(data: WordPressRegisterData): Observable<WordPressUser | null> {
    this.isLoading.set(true); this.authError.set(null);
    const payload: any = {
      email: data.email, password: data.password, user_login: data.user_login || data.email.split('@')[0] + Math.floor(Math.random() * 10000),
      first_name: data.first_name, last_name: data.last_name, display_name: data.display_name || `${data.first_name || ''} ${data.last_name || ''}`.trim()
    };
    if (!payload.display_name && payload.user_login) { payload.display_name = payload.user_login; }
    if (!data.password) { delete payload.password; }
    Object.keys(payload).forEach(key => { if (payload[key] === undefined || payload[key] === '') { delete payload[key]; } });
    return this.http.post<WordPressAuthResponse<WordPressRegisterSuccessData>>(this.registerUrl, payload).pipe(
      switchMap(response => {
        if (response.success) {
          if (response.data?.jwt && response.data?.ID) {
            const partialUser: WordPressUserFromAuth = { ID: response.data.ID, user_email: data.email, display_name: payload.display_name, user_login: payload.user_login, first_name: data.first_name, last_name: data.last_name };
            const loginData: WordPressLoginResponseData = { jwt: response.data.jwt, user: partialUser, refresh_token: response.data.refresh_token };
            return this.handleAuthSuccess(loginData, 'Login');
          }
          this.setSuccessMessageKey('registerPage.successMessage', { email: data.email }); return of(null);
        } else {
          const errorMsg = response.message || (response.data as any)?.message || response.error_description || 'Registrierung fehlgeschlagen.';
          throw new HttpErrorResponse({ error: { message: errorMsg, ...response.data, code: response.code }, status: response.statusCode || 400 });
        }
      }),
      catchError(err => this.handleError(err, 'Register')),
      finalize(() => this.isLoading.set(false))
    );
  }

  validateToken(token: string): Observable<Omit<WordPressUser, 'jwt' | 'refreshToken'> | null> {
    console.log('[AuthService] validateToken CALLED (URL Param Test) with token:', token ? '******' : 'null/undefined');
    if (!token) { this.authError.set(this.translocoService.translate('errors.auth.missingToken')); return of(null); }

    const validateUrlWithTokenParam = `${this.validateTokenUrl}?JWT=${encodeURIComponent(token)}`;
    console.log('[AuthService] Validating token via URL param:', validateUrlWithTokenParam);
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

    return this.http.post<WordPressAuthResponse<WordPressValidateInnerData>>(validateUrlWithTokenParam, {}, { headers }).pipe(
      map(response => {
        console.log('[AuthService] WP Validate Token Raw Response (URL Param Test):', response);
        const pluginResponseCode = response.code || response.data?.code; // Prüfe Code auf beiden Ebenen
        console.log(`[AuthService] Validate Codes: response.data.code = ${response.data?.code}, response.code = ${response.code}`);
        const isValidByCode = pluginResponseCode === 'jwt_auth_valid_token';
        const userDataFromResponse = response.data?.user;
        const rolesFromResponse = response.data?.roles || [];
        const userId = userDataFromResponse?.ID || (userDataFromResponse as any)?.id;
        const userEmail = userDataFromResponse?.user_email || (userDataFromResponse as any)?.email;
        const displayName = userDataFromResponse?.display_name || userDataFromResponse?.user_login;

        console.log(`[AuthService] isValidByCode = ${isValidByCode}`);
        console.log('[AuthService] Validate userDataFromResponse:', userDataFromResponse);
        console.log(`[AuthService] Validate Extracted: userId=${userId}, userEmail=${userEmail}, displayName=${displayName}`);

        if (response.success && userDataFromResponse && userId && userEmail && displayName) {
           // Der Code 'jwt_auth_valid_token' ist eine zusätzliche Bestätigung, aber success und User-Daten sind primär.
           // Wenn der Code fehlt, aber success true ist und User-Daten da sind, ist es wahrscheinlich trotzdem okay.
           console.log('[AuthService] Token validation successful (URL), user data found:', userDataFromResponse);
          return {
            id: parseInt(String(userId), 10),
            email: userEmail,
            displayName: displayName,
            username: userDataFromResponse.user_login,
            roles: rolesFromResponse,
            firstName: (userDataFromResponse as any).first_name || displayName.split(' ')[0] || '',
            lastName: (userDataFromResponse as any).last_name || displayName.split(' ').slice(1).join(' ') || '',
          };
        }
        const errorMessage = response.message || response.data?.message || this.translocoService.translate('errors.auth.jwtSpecific.jwt_auth_invalid_token');
        console.warn('[AuthService] Token validation (URL) API failed or data incomplete:', errorMessage, response);
        this.authError.set(this.translocoService.translate('errors.auth.tokenValidationFailed', { details: errorMessage }));
        return null;
      }),
      catchError(err => {
        const httpError = err instanceof HttpErrorResponse ? err : null;
        const errMessage = httpError?.error?.message || (httpError?.error as any)?.data?.message || (httpError?.error as any)?.code || httpError?.message || this.translocoService.translate('errors.unknownError');
        this.authError.set(this.translocoService.translate('errors.auth.tokenValidationApiError', { details: errMessage }));
        console.error('[AuthService] Error in validateToken HTTP call (URL):', errMessage, err);
        return of(null);
      })
    );
  }

  private refreshTokenInternal(refreshToken: string): Observable<WordPressUser | null> {
    console.log('[AuthService] refreshTokenInternal CALLED.');
    this.isLoading.set(true); this.authError.set(null);
    const payload = { refresh_token: refreshToken };
    return this.http.post<WordPressAuthResponse<WordPressRefreshResponseData>>(this.refreshTokenUrl, payload).pipe(
      switchMap(response => {
        const responseData = response.data; // response.data ist hier vom Typ WordPressRefreshResponseData
        if (response.success && responseData?.jwt) {
          return this.handleAuthSuccess(responseData, 'Refresh');
        } else {
          this.clearLocalUserData();
          const errorMsg = response.message || 'Token Refresh fehlgeschlagen.';
          throw new HttpErrorResponse({ error: { message: errorMsg, ...response.data }, status: 401 });
        }
      }),
      catchError(err => { this.clearLocalUserData(); return this.handleError(err, 'Refresh Token'); }),
      finalize(() => this.isLoading.set(false))
    );
  }

  public tryRefreshToken(): Observable<WordPressUser | null> {
    const rToken = this.getStoredRefreshToken();
    if (rToken) return this.refreshTokenInternal(rToken);
    this.clearLocalUserData(); return of(null);
  }

  logout(): Observable<void> {
    console.log('[AuthService] logout CALLED');
    this.isLoading.set(true); const currentToken = this.getStoredToken();
    const performClientLogout = () => {
      this.clearLocalUserData(); this.router.navigate(['/']); this.isLoading.set(false);
    };
    if (currentToken) {
      const revokeUrlWithToken = `${this.revokeTokenUrl}?JWT=${encodeURIComponent(currentToken)}`;
      return this.http.post<WordPressAuthResponse<null>>(revokeUrlWithToken, {}).pipe(
        tap(() => console.log('[AuthService] Token revoke serverseitig (via URL) erfolgreich.')),
        map(() => performClientLogout()),
        catchError(err => {
          console.warn('[AuthService] Fehler beim Revoken des Tokens (via URL), Logout nur clientseitig.', err);
          performClientLogout(); return of(undefined);
        }),
        finalize(() => this.isLoading.set(false))
      );
    } else { performClientLogout(); return of(undefined); }
  }

  public getCurrentUserValue(): WordPressUser | null { return this.currentWordPressUserSubject.value; }

  requestPasswordReset(email: string): Observable<WordPressAuthResponse<any>> {
    this.isLoading.set(true); this.authError.set(null);
    return this.http.post<WordPressAuthResponse<any>>(this.requestPasswordResetUrl, { email: email }).pipe(
      tap(response => {
        if (response.success) this.setSuccessMessageKey('profilePage.passwordResetRequested', { email });
        else this.authError.set(response.message || 'Fehler bei Passwort-Reset-Anfrage.');
      }),
      catchError(err => this.handleError(err, 'RequestPasswordReset')),
      finalize(() => this.isLoading.set(false))
    );
  }

  confirmPasswordReset(data: ConfirmPasswordResetPayload): Observable<WordPressAuthResponse<any>> {
    this.isLoading.set(true); this.authError.set(null);
    return this.http.post<WordPressAuthResponse<any>>(this.confirmPasswordResetUrl, data).pipe(
      tap(response => {
        if (response.success) this.setSuccessMessageKey('profilePage.successPasswordChange');
        else this.authError.set(response.message || 'Fehler beim Setzen des neuen Passworts.');
      }),
      catchError(err => this.handleError(err, 'ConfirmPasswordReset')),
      finalize(() => this.isLoading.set(false))
    );
  }

  private setSuccessMessageKey(key: string, params?: object) {
    this.successMessageKey.set(key);
    this.successMessage.set(this.translocoService.translate(key, params));
    setTimeout(() => { this.successMessage.set(null); this.successMessageKey.set(null); }, 5000);
  }
   private updateSuccessMessage(): void {
     if (this.successMessageKey()) this.successMessage.set(this.translocoService.translate(this.successMessageKey()!));
   }

  private handleError(error: HttpErrorResponse | Error, operation: string): Observable<never> {
    this.isLoading.set(false);
    let displayMessage = this.translocoService.translate('errors.unknownError', { operation });
    if (error instanceof HttpErrorResponse) {
      console.error(`[AuthService] ${operation} HttpError:`, error.status, error.message, error.error);
      const errData = error.error as WordPressAuthResponse<any>;
      let serverMessage = errData?.message || errData?.data?.message || errData?.error_description || errData?.error;
      if (errData?.errors && typeof errData.errors === 'object' && Object.keys(errData.errors).length > 0) {
        const firstErrorKey = Object.keys(errData.errors)[0];
        serverMessage = `${serverMessage || ''} (${firstErrorKey}: ${errData.errors[firstErrorKey].join(', ')})`;
      }
      if (serverMessage && typeof serverMessage === 'string') displayMessage = serverMessage;
      else if (error.status === 0 || error.status === 503 || error.status === 504) {
        displayMessage = this.translocoService.translate('errors.networkError');
      } else {
        displayMessage = this.translocoService.translate('errors.serverError', { status: error.status });
      }
    } else if (error instanceof Error) {
      console.error(`[AuthService] ${operation} Error:`, error.message, error);
      displayMessage = error.message;
    }
    this.authError.set(displayMessage);
    if (['Login', 'Register', 'Refresh Token', 'Validate Token on Load'].includes(operation)) {
      this.clearLocalUserData();
    }
    return throwError(() => new Error(displayMessage));
  }

  private scheduleTokenRefresh(token: string): void {
    if (isPlatformBrowser(this.platformId) && token) {
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
      try {
        const payloadBase64 = token.split('.')[1];
        if (!payloadBase64) { console.error('[AuthService] Invalid JWT: Missing payload.'); return; }
        const decodedPayload = JSON.parse(atob(payloadBase64));
        if (typeof decodedPayload.exp !== 'number') { console.error('[AuthService] Invalid JWT: "exp" claim is missing or not a number.'); return; }
        const expiresAt = decodedPayload.exp * 1000;
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        let refreshIn = expiresAt - now - fiveMinutes;
        if (refreshIn < 0) refreshIn = Math.max(0, expiresAt - now - (60 * 1000));
        if (refreshIn <= 0) {
          const currentRefreshToken = this.getStoredRefreshToken();
          if (currentRefreshToken) {
            console.log('[AuthService] Token is about to expire or expired, attempting refresh immediately.');
            this.tryRefreshToken().subscribe();
          } else {
            console.warn('[AuthService] Token expired or about to, no refresh token. Logging out.');
            this.logout().subscribe();
          }
          return;
        }
        console.log(`[AuthService] Token expires at: ${new Date(expiresAt).toLocaleString()}. Scheduling refresh in approx. ${Math.round(refreshIn / 60000)} min.`);
        this.refreshTimer = setTimeout(() => {
          console.log('[AuthService] Scheduled token refresh initiated.');
          this.tryRefreshToken().subscribe({ error: () => { console.error('[AuthService] Scheduled token refresh failed. User might need to re-login.'); this.logout().subscribe(); }});
        }, refreshIn);
      } catch (error) { console.error('[AuthService] Could not decode JWT for scheduling refresh:', error); }
    }
  }
}