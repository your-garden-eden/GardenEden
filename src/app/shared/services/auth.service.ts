// /src/app/shared/services/auth.service.ts (Version 2.3 - Mit "Username vergessen"-Funktion)

import { Injectable, inject, signal, WritableSignal, PLATFORM_ID, OnDestroy, computed, Signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, throwError, of } from 'rxjs';
import { catchError, tap, map, switchMap, finalize } from 'rxjs/operators';
import { isPlatformBrowser } from '@angular/common';

// --- Interfaces ---
export interface JwtLoginResponse {
  token: string;
  user_email: string;
  user_nicename: string;
  user_display_name: string;
}

export interface JwtValidateResponse {
  code: string;
  data: {
    status: number;
  };
}

export interface JwtErrorResponse {
  code: string;
  message: string;
  data: {
    status: number;
  };
}

export interface GuestTokenResponse {
  token: string;
}

export interface CustomRegisterResponse {
    success: boolean;
    code: string;
    message: string;
    data: {
        status: number;
        user: {
            id: number;
            email: string;
            username: string;
        }
    }
}

export interface WordPressUser {
  id: number;
  email: string;
  displayName: string;
  username: string; // Wichtig: Dies ist der 'user_login', den wir für den Login brauchen
  roles: string[];
  jwt: string;
  firstName?: string;
  lastName?: string;
}

export interface PasswordResetPayload {
  key: string;
  login: string;
  password: string;
}

// GEÄNDERT: Schnittstelle um 'username' erweitert
export interface WordPressRegisterData {
  username: string; // Das ist der neue, separate Benutzername
  email: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  address_1?: string;
  postcode?: string;
  city?: string;
  billing_phone?: string;
  billing_country?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService implements OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  private wordpressApiUrl = 'https://your-garden-eden-4ujzpfm5qt.live-website.com/wp-json';
  private ygeApiNamespace = 'your-garden-eden/v1';
  private jwtPluginNamespace = 'jwt-auth/v1';
  private jwtBaseUrl = `${this.wordpressApiUrl}/${this.jwtPluginNamespace}`;
  private loginUrl = `${this.jwtBaseUrl}/token`;
  private validateTokenUrl = `${this.jwtBaseUrl}/token/validate`;
  
  private registerUrl = `${this.wordpressApiUrl}/${this.ygeApiNamespace}/register`;
  private ygeRequestPasswordResetUrl = `${this.wordpressApiUrl}/${this.ygeApiNamespace}/users/request-password-reset`;
  private ygeRequestUsernameUrl = `${this.wordpressApiUrl}/${this.ygeApiNamespace}/users/request-username`; // NEU
  private ygeSetNewPasswordUrl = `${this.wordpressApiUrl}/${this.ygeApiNamespace}/users/set-new-password`;
  private guestTokenUrl = `${this.wordpressApiUrl}/${this.ygeApiNamespace}/guest-token`;

  private wpTokenKey = 'wordpress_jwt_token';
  private wpUserKey = 'wordpress_user_data';
  private wpGuestTokenKey = 'wordpress_guest_jwt_token';

  private currentWordPressUserSubject = new BehaviorSubject<WordPressUser | null>(this.loadUserFromLocalStorage());
  public currentWordPressUser$: Observable<WordPressUser | null> = this.currentWordPressUserSubject.asObservable();
  public isLoggedIn$: Observable<boolean> = this.currentWordPressUser$.pipe(map(user => !!user && !!user.jwt));

  private guestJwt: WritableSignal<string | null> = signal(this.loadGuestTokenFromStorage());
  public activeJwt: Signal<string | null> = computed(() => this.getCurrentUserValue()?.jwt || this.guestJwt());

  public isLoading: WritableSignal<boolean> = signal(false);
  public authError: WritableSignal<string | null> = signal(null);
  public successMessage: WritableSignal<string | null> = signal(null);

  constructor() {}

  public init(): Observable<any> {
    if (!isPlatformBrowser(this.platformId)) {
      return of(null);
    }
    return this.loadUserAndValidate().pipe(
      switchMap((userIsValid) => {
        if (!userIsValid && !this.guestJwt()) {
          return this.fetchAndStoreGuestToken();
        }
        return of(null);
      })
    );
  }

  ngOnDestroy(): void {}

  private loadUserFromLocalStorage(): WordPressUser | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    const token = localStorage.getItem(this.wpTokenKey);
    const userJson = localStorage.getItem(this.wpUserKey);
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson) as WordPressUser;
        user.jwt = token;
        return user;
      } catch (e) { this.clearLocalUserData(); }
    }
    return null;
  }

  private loadGuestTokenFromStorage(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    return localStorage.getItem(this.wpGuestTokenKey);
  }

  public getStoredToken(): string | null {
    return isPlatformBrowser(this.platformId) ? localStorage.getItem(this.wpTokenKey) : null;
  }

  private storeAuthData(user: WordPressUser): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.wpTokenKey, user.jwt);
      localStorage.setItem(this.wpUserKey, JSON.stringify(user));
      localStorage.removeItem(this.wpGuestTokenKey);
      this.guestJwt.set(null);
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
      localStorage.removeItem(this.wpTokenKey);
      localStorage.removeItem(this.wpUserKey);
    }
    this.currentWordPressUserSubject.next(null);
    this.authError.set(null);
  }

  private loadUserAndValidate(): Observable<boolean> {
    const storedUser = this.loadUserFromLocalStorage();
    if (!storedUser || !storedUser.jwt) {
      this.clearLocalUserData();
      return of(false);
    }

    this.isLoading.set(true);
    return this.validateToken(storedUser.jwt).pipe(
      map(isValid => {
        if (isValid) {
          this.currentWordPressUserSubject.next(storedUser);
          return true;
        } else {
          this.clearLocalUserData();
          return false;
        }
      }),
      catchError(() => {
        this.clearLocalUserData();
        return of(false);
      }),
      finalize(() => this.isLoading.set(false))
    );
  }
  
  private fetchAndStoreGuestToken(): Observable<string | null> {
    if (this.getCurrentUserValue()) {
      return of(null);
    }
    this.isLoading.set(true);
    return this.http.get<GuestTokenResponse>(this.guestTokenUrl).pipe(
      map(response => {
        if (response && response.token) {
          if (isPlatformBrowser(this.platformId)) {
            localStorage.setItem(this.wpGuestTokenKey, response.token);
          }
          this.guestJwt.set(response.token);
          return response.token;
        }
        return null;
      }),
      catchError(err => {
        console.error('Failed to fetch guest token:', err);
        this.authError.set('Could not establish a guest session.');
        return of(null);
      }),
      finalize(() => this.isLoading.set(false))
    );
  }

  private decodeJwtPayload(token: string): any | null {
    try {
      const payloadBase64 = token.split('.')[1];
      if (!payloadBase64) return null;
      return JSON.parse(atob(payloadBase64));
    } catch (e) {
      console.error('Error decoding JWT', e);
      return null;
    }
  }

  login(credentials: { emailOrUsername: string; password: string }): Observable<WordPressUser> {
    this.isLoading.set(true);
    this.authError.set(null);
    
    const payload = {
      username: credentials.emailOrUsername,
      password: credentials.password
    };
    
    return this.http.post<JwtLoginResponse>(this.loginUrl, payload).pipe(
      map(response => {
        const decodedPayload = this.decodeJwtPayload(response.token);
        if (!decodedPayload?.data?.user?.id) {
          throw new Error('Invalid token received from server.');
        }

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
    if (!token) {
      return of(false);
    }
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    return this.http.post<JwtValidateResponse>(this.validateTokenUrl, {}, { headers }).pipe(
      map(response => {
        return response.code === 'jwt_auth_valid_token';
      }),
      catchError(err => {
        return of(false);
      })
    );
  }

  logout(): Observable<void> {
    this.isLoading.set(true);
    this.clearLocalUserData();
    
    return this.fetchAndStoreGuestToken().pipe(
        tap(() => {
            this.router.navigate(['/']);
            this.isLoading.set(false);
        }),
        map(() => undefined),
        catchError(() => {
            this.router.navigate(['/']);
            this.isLoading.set(false);
            return of(undefined);
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
          this.setSuccessMessage(response.message || 'Anfrage erfolgreich.');
        } else {
          this.authError.set(response.message || 'Fehler bei Passwort-Reset-Anfrage.');
        }
      }),
      catchError(err => this.handleError(err, 'RequestPasswordReset')),
      finalize(() => this.isLoading.set(false))
    );
  }

  // NEU: Methode zur Anforderung des Benutzernamens
  requestUsername(email: string): Observable<any> {
    this.isLoading.set(true);
    this.authError.set(null);
    this.successMessage.set(null);

    return this.http.post<any>(this.ygeRequestUsernameUrl, { email: email }).pipe(
      tap(response => {
        // Unser neuer Endpunkt gibt immer eine Erfolgsmeldung zurück, um User-Enumeration zu verhindern.
        if (response.success && response.message) {
          this.setSuccessMessage(response.message);
        } else {
          // Fallback, sollte mit unserem Backend-Code nicht eintreten
          this.authError.set(response.message || 'Fehler bei der Anforderung des Benutzernamens.');
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
      const errData = error.error as JwtErrorResponse;
      let serverMessage = errData?.message;
      
      if (operation === 'Login' && error.status === 403) {
         if (serverMessage && serverMessage.includes('**Fehler**: Ungültiger Benutzername.')) {
            serverMessage = 'Der angegebene Benutzername oder die E-Mail-Adresse ist ungültig.';
         } else if (serverMessage && serverMessage.includes('Das Passwort, das du für den Benutzernamen')) {
            serverMessage = 'Das eingegebene Passwort ist nicht korrekt.';
         } else {
            serverMessage = 'Benutzername oder Passwort ist ungültig.';
         }
      }

      if (serverMessage && typeof serverMessage === 'string') {
        displayMessage = serverMessage;
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