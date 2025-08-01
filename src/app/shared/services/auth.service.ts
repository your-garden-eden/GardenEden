// /src/app/shared/services/auth.service.ts

import { Injectable, inject, signal, WritableSignal, PLATFORM_ID, OnDestroy, computed, Signal, Optional, Inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, throwError, of, Subscription, Subject } from 'rxjs';
import { catchError, tap, map, switchMap, finalize } from 'rxjs/operators';
import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { Request } from 'express';

// --- Interfaces ---
export interface JwtLoginResponse { token: string; user_email: string; user_nicename: string; user_display_name: string; }
export interface JwtValidateResponse { code: string; data: { status: number; }; }
export interface JwtErrorResponse { code: string; message: string; data: { status: number; }; }
export interface GuestTokenResponse { token: string; }
export interface CustomRegisterResponse { success: boolean; code: string; message: string; data: { status: number; user: { id: number; email: string; username: string; } } }
export interface WordPressUser { id: number; email: string; displayName: string; username: string; roles: string[]; jwt: string; firstName?: string; lastName?: string; }
export interface PasswordResetPayload { key: string; login: string; password:string; }
export interface WordPressRegisterData { username: string; email: string; password?: string; first_name?: string; last_name?: string; address_1?: string; postcode?: string; city?: string; billing_phone?: string; billing_country?: string; }

@Injectable({
  providedIn: 'root',
})
export class AuthService implements OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);

  // --- URLs ---
  private wordpressApiUrl = 'https://your-garden-eden-4ujzpfm5qt.live-website.com/wp-json';
  private ygeApiNamespace = 'your-garden-eden/v1';
  private jwtPluginNamespace = 'jwt-auth/v1';
  private jwtBaseUrl = `${this.wordpressApiUrl}/${this.jwtPluginNamespace}`;
  private loginUrl = `${this.jwtBaseUrl}/token`;
  private validateTokenUrl = `${this.jwtBaseUrl}/token/validate`;
  private registerUrl = `${this.wordpressApiUrl}/${this.ygeApiNamespace}/register`;
  private ygeRequestPasswordResetUrl = `${this.wordpressApiUrl}/${this.ygeApiNamespace}/users/request-password-reset`;
  private ygeRequestUsernameUrl = `${this.wordpressApiUrl}/${this.ygeApiNamespace}/users/request-username`;
  private ygeSetNewPasswordUrl = `${this.wordpressApiUrl}/${this.ygeApiNamespace}/users/set-new-password`;
  private guestTokenUrl = `${this.wordpressApiUrl}/${this.ygeApiNamespace}/guest-token`;

  // --- Storage Keys ---
  private wpTokenKey = 'wordpress_jwt_token';
  private wpUserKey = 'wordpress_user_data';
  private wpGuestTokenKey = 'wordpress_guest_jwt_token';

  // --- State Management ---
  private currentWordPressUserSubject = new BehaviorSubject<WordPressUser | null>(null);
  public currentWordPressUser$: Observable<WordPressUser | null> = this.currentWordPressUserSubject.asObservable();
  public isLoggedIn$: Observable<boolean> = this.currentWordPressUser$.pipe(map(user => !!user && !!user.jwt));

  private guestJwt: WritableSignal<string | null> = signal(null);
  public activeJwt: Signal<string | null> = computed(() => this.getCurrentUserValue()?.jwt || this.guestJwt());

  public isLoading: WritableSignal<boolean> = signal(false);
  public authError: WritableSignal<string | null> = signal(null);
  public successMessage: WritableSignal<string | null> = signal(null);

  private guestTokenRefreshedSource = new Subject<void>();
  public guestTokenRefreshed$ = this.guestTokenRefreshedSource.asObservable();
  
  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    @Optional() @Inject('REQUEST') private request: Request | null
  ) {
    this.loadInitialStateFromStorage();
  }

  ngOnDestroy(): void {
    // ggf. Subscriptions hier beenden
  }
  
  // ==================================================================================
  // --- KORRIGIERTE, ROBUSTERE INITIALISIERUNGSLOGIK ---
  // ==================================================================================
  public initAuth(): Observable<boolean> {
    console.log('[AuthService.init] Starting Auth Initialization for APP_INITIALIZER...');
    this.isLoading.set(true);

    const currentUser = this.getCurrentUserValue();
    if (currentUser && !this.isTokenExpired(currentUser.jwt)) {
        console.log('[AuthService.init] Found potentially valid user session. Validating with server...');
        return this.validateToken(currentUser.jwt).pipe(
            switchMap(isValid => {
                if (isValid) {
                    console.log('[AuthService.init] User token is valid. Initialization successful.');
                    return of(true);
                }
                console.warn('[AuthService.init] User token is invalid on server. Clearing data and fetching guest token.');
                this.clearLocalUserData();
                return this.ensureGuestTokenIsPresent();
            }),
            finalize(() => this.isLoading.set(false))
        );
    }

    return this.ensureGuestTokenIsPresent().pipe(
        finalize(() => this.isLoading.set(false))
    );
  }

  private ensureGuestTokenIsPresent(): Observable<boolean> {
    const guestToken = this.guestJwt();
    if (guestToken && !this.isTokenExpired(guestToken)) {
        console.log('[AuthService.init] Found valid guest token. Initialization successful.');
        return of(true);
    }

    console.log('[AuthService.init] No valid token found. Fetching new guest token...');
    return this.fetchAndStoreGuestToken().pipe(
        map(token => {
            const success = !!token;
            if (success) {
                console.log('[AuthService.init] New guest token fetched. Initialization successful.');
            } else {
                console.error('[AuthService.init] FAILED to fetch guest token. App might not work correctly.');
            }
            return success;
        }),
        catchError(err => {
            console.error('[AuthService.init] CRITICAL error while fetching guest token.', err);
            this.authError.set('Sitzung konnte nicht initialisiert werden.');
            return of(false);
        })
    );
  }
  // ==================================================================================
  // --- ENDE DER NEUEN LOGIK ---
  // ==================================================================================

  private loadInitialStateFromStorage(): void {
    if (isPlatformBrowser(this.platformId)) {
      const user = this.loadUserFromLocalStorage();
      if (user) this.currentWordPressUserSubject.next(user);
      const guestToken = this.loadGuestTokenFromStorage();
      if (guestToken) this.guestJwt.set(guestToken);
    } else if (isPlatformServer(this.platformId) && this.request) {
      const guestTokenFromCookie = this.request.cookies['wordpress_guest_jwt_token'];
      if (guestTokenFromCookie) this.guestJwt.set(guestTokenFromCookie);
    }
  }

  private isTokenExpired(token: string): boolean {
    if (!token || token.split('.').length < 2) return true;
    const payload = this.decodeJwtPayload(token);
    if (!payload || !payload.exp) return true;
    const expiryDate = new Date(0);
    expiryDate.setUTCSeconds(payload.exp);
    return expiryDate.valueOf() <= Date.now();
  }
  
  private validateUserToken(): Observable<boolean> {
    const currentUser = this.getCurrentUserValue();
    if (!currentUser || !currentUser.jwt) return of(false);
    if (this.isTokenExpired(currentUser.jwt)) {
        this.clearLocalUserData();
        return of(false);
    }
    this.isLoading.set(true);
    return this.validateToken(currentUser.jwt).pipe(
      tap(isValid => { if (!isValid) this.clearLocalUserData(); }),
      catchError(() => { this.clearLocalUserData(); return of(false); }),
      finalize(() => this.isLoading.set(false))
    );
  }

  private loadUserFromLocalStorage(): WordPressUser | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    try {
      const token = localStorage.getItem(this.wpTokenKey);
      const userJson = localStorage.getItem(this.wpUserKey);
      if (token && userJson) {
        if (this.isTokenExpired(token)) {
            this.clearLocalUserData();
            return null;
        }
        const user = JSON.parse(userJson) as WordPressUser;
        user.jwt = token;
        return user;
      }
    } catch (e) { 
        this.clearLocalUserData(); 
    }
    return null;
  }

  private loadGuestTokenFromStorage(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    try {
        const token = localStorage.getItem(this.wpGuestTokenKey);
        if (token && !this.isTokenExpired(token)) return token;
        if (token) localStorage.removeItem(this.wpGuestTokenKey);
    } catch (e) {
        localStorage.removeItem(this.wpGuestTokenKey);
    }
    return null;
  }

  public getStoredToken(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    return localStorage.getItem(this.wpTokenKey);
  }

  private storeAuthData(user: WordPressUser): void {
    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.setItem(this.wpTokenKey, user.jwt);
        localStorage.setItem(this.wpUserKey, JSON.stringify(user));
        localStorage.removeItem(this.wpGuestTokenKey);
        this.guestJwt.set(null);
      } catch (e) {
          this.authError.set("Sitzung konnte nicht gespeichert werden. Ist der Speicher voll?");
      }
    }
    this.currentWordPressUserSubject.next(user);
    this.authError.set(null);
  }
  
  public updateLocalUserData(updatedFields: Partial<Omit<WordPressUser, 'jwt' | 'id'>>): void {
    const currentUser = this.getCurrentUserValue();
    if (!currentUser) return;
    const updatedUser: WordPressUser = { ...currentUser, ...updatedFields };
    this.storeAuthData(updatedUser);
  }

  private clearLocalUserData(): void {
    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.removeItem(this.wpTokenKey);
        localStorage.removeItem(this.wpUserKey);
      } catch (e) {
          console.error("Fehler beim Löschen der User-Daten aus dem localStorage.", e);
      }
    }
    if (this.currentWordPressUserSubject.value !== null) {
        this.currentWordPressUserSubject.next(null);
    }
    this.authError.set(null);
  }

  private fetchAndStoreGuestToken(): Observable<string | null> {
    if (this.getCurrentUserValue()) return of(null);
    this.isLoading.set(true);
    return this.http.get<GuestTokenResponse>(this.guestTokenUrl).pipe(
      map(response => {
        if (response && response.token) {
          if (isPlatformBrowser(this.platformId)) {
            localStorage.setItem(this.wpGuestTokenKey, response.token);
          }
          this.guestJwt.set(response.token);
          this.guestTokenRefreshedSource.next();
          return response.token;
        }
        return null;
      }),
      catchError(err => {
        this.authError.set('Keine Gast-Sitzung möglich.');
        return of(null);
      }),
      finalize(() => this.isLoading.set(false))
    );
  }

  private decodeJwtPayload(token: string): any | null {
    if (isPlatformServer(this.platformId)) {
        try {
            const payloadBase64 = token.split('.')[1];
            if (!payloadBase64) return null;
            return JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
        } catch (e) { return null; }
    }
    try {
      const payloadBase64 = token.split('.')[1];
      if (!payloadBase64) return null;
      return JSON.parse(atob(payloadBase64));
    } catch (e) { return null; }
  }

  login(credentials: { emailOrUsername: string; password: string }): Observable<WordPressUser> {
    this.isLoading.set(true);
    this.authError.set(null);
    const payload = { username: credentials.emailOrUsername, password: credentials.password };
    return this.http.post<JwtLoginResponse>(this.loginUrl, payload).pipe(
      map(response => {
        const decodedPayload = this.decodeJwtPayload(response.token);
        if (!decodedPayload?.data?.user?.id) throw new Error('Ungültiger Token vom Server erhalten.');
        const user: WordPressUser = {
          jwt: response.token,
          email: response.user_email,
          displayName: response.user_display_name,
          username: response.user_nicename,
          id: parseInt(decodedPayload.data.user.id, 10),
          roles: decodedPayload.data.user.roles || []
        };
        this.storeAuthData(user);
        return user;
      }),
      catchError(err => this.handleError(err, 'Login')),
      finalize(() => this.isLoading.set(false))
    );
  }

  register(data: WordPressRegisterData): Observable<CustomRegisterResponse> {
    this.isLoading.set(true);
    this.authError.set(null);
    return this.http.post<CustomRegisterResponse>(this.registerUrl, data).pipe(
      tap(response => {
        if (response.success && response.message) {
            this.setSuccessMessage(response.message);
        } else {
            throw new HttpErrorResponse({ error: response, status: 400 });
        }
      }),
      catchError(err => this.handleError(err, 'Register')),
      finalize(() => this.isLoading.set(false))
    );
  }
  
  validateToken(token: string): Observable<boolean> {
    if (!token) return of(false);
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${token}` });
    return this.http.post<JwtValidateResponse>(this.validateTokenUrl, {}, { headers }).pipe(
      map(response => response.code === 'jwt_auth_valid_token'),
      catchError(() => of(false))
    );
  }

  logout(): Observable<void> {
    this.isLoading.set(true);
    const wasLoggedIn = !!this.getCurrentUserValue();
    this.clearLocalUserData();
    if (wasLoggedIn) this.setSuccessMessage('Du wurdest erfolgreich abgemeldet.');
    // Nach dem Logout neu initialisieren, um einen Gast-Token zu bekommen
    return this.initAuth().pipe(
        finalize(() => {
            this.router.navigate(['/']);
            this.isLoading.set(false);
        }),
        map(() => undefined)
    );
  }

  public handleInvalidTokenAndRetry(failedRequest: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    console.warn('[AuthService] Serverseitig ungültiger Token erkannt. Starte Self-Healing-Prozess.');
    if (this.getCurrentUserValue()) this.clearLocalUserData();

    return this.fetchAndStoreGuestToken().pipe(
      switchMap(newToken => {
        if (newToken) {
          console.log('[AuthService] Self-Healing: Neuer Gast-Token erhalten. Wiederhole ursprüngliche Anfrage.');
          const newAuthReq = failedRequest.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } });
          return next.handle(newAuthReq);
        }
        return throwError(() => new Error('Konnte die Sitzung nach einem ungültigen Token nicht wiederherstellen.'));
      })
    );
  }

  public getCurrentUserValue(): WordPressUser | null {
    return this.currentWordPressUserSubject.value;
  }

  requestPasswordReset(email: string): Observable<any> {
    this.isLoading.set(true); 
    this.authError.set(null);
    this.successMessage.set(null);
    return this.http.post<any>(this.ygeRequestPasswordResetUrl, { email: email }).pipe(
      tap(response => {
        if (response.success) {
          this.setSuccessMessage(response.message || 'Anfrage erfolgreich. Bitte prüfe dein E-Mail-Postfach.');
        } else {
          throw new HttpErrorResponse({ error: response, status: 400 });
        }
      }),
      catchError(err => this.handleError(err, 'RequestPasswordReset')),
      finalize(() => this.isLoading.set(false))
    );
  }

  requestUsername(email: string): Observable<any> {
    this.isLoading.set(true);
    this.authError.set(null);
    this.successMessage.set(null);
    return this.http.post<any>(this.ygeRequestUsernameUrl, { email: email }).pipe(
      tap(response => {
        if (response.success && response.message) {
          this.setSuccessMessage(response.message);
        } else {
          throw new HttpErrorResponse({ error: response, status: 400 });
        }
      }),
      catchError(err => this.handleError(err, 'RequestUsername')),
      finalize(() => this.isLoading.set(false))
    );
  }
  
  confirmPasswordReset(payload: PasswordResetPayload): Observable<any> {
    this.isLoading.set(true);
    this.authError.set(null);
    this.successMessage.set(null);
    return this.http.post<any>(this.ygeSetNewPasswordUrl, payload).pipe(
      tap(response => {
        if (response.success && response.message) {
          this.setSuccessMessage(response.message);
        } else {
            throw new HttpErrorResponse({ error: response, status: 400 });
        }
      }),
      catchError(err => this.handleError(err, 'ConfirmPasswordReset')),
      finalize(() => this.isLoading.set(false))
    );
  }

  public setSuccessMessage(message: string) {
    this.successMessage.set(message);
    setTimeout(() => { this.successMessage.set(null); }, 5000);
  }
  
  private handleError(error: HttpErrorResponse | Error, operation: string): Observable<never> {
    this.isLoading.set(false);
    let displayMessage = `Ein unbekannter Fehler ist aufgetreten: ${operation}`;

    if (error instanceof HttpErrorResponse) {
      const errData = error.error;
      let serverMessage = errData?.message || (typeof errData === 'string' ? errData : '');
      
      if (isPlatformBrowser(this.platformId) && serverMessage && typeof serverMessage === 'string' && serverMessage.includes('<')) {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = serverMessage;
          serverMessage = tempDiv.textContent || tempDiv.innerText || '';
      }

      if (operation === 'Login' && error.status === 403) {
         if (serverMessage.includes('Ungültiger Benutzername') || serverMessage.includes('Invalid username')) {
            serverMessage = 'Der angegebene Benutzername oder die E-Mail-Adresse ist ungültig.';
         } else if (serverMessage.includes('Das Passwort, das du für den Benutzernamen')) {
            serverMessage = 'Das eingegebene Passwort ist nicht korrekt.';
         } else {
            serverMessage = 'Benutzername oder Passwort ist ungültig.';
         }
      }

      if (serverMessage) {
        displayMessage = serverMessage.trim();
      } else if (error.status === 0 || error.status === 503 || error.status === 504) {
        displayMessage = 'Netzwerkfehler: Es konnte keine Verbindung zum Server hergestellt werden.';
      } else {
        displayMessage = `Serverfehler (Status: ${error.status})`;
      }

    } else if (error instanceof Error) {
      displayMessage = error.message;
    }

    this.authError.set(displayMessage);
    
    if (['Login', 'Register'].includes(operation)) {
      this.clearLocalUserData();
    }
    
    return throwError(() => new Error(displayMessage));
  }
}