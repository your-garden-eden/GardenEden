// /src/app/shared/services/auth.service.ts
import { Injectable, inject, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Auth, authState, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, User, UserCredential, signInWithCredential, getAdditionalUserInfo } from '@angular/fire/auth';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { Firestore, doc, setDoc, serverTimestamp, getDoc } from '@angular/fire/firestore';
import { Router } from '@angular/router';
// import { CartService } from './cart.service'; // <-- IMPORT ENTFERNT

@Injectable({
  providedIn: 'root'
})
export class AuthService implements OnDestroy {
  private auth: Auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);
  // private cartService = inject(CartService); // <-- INJEKTION ENTFERNT
  private platformId = inject(PLATFORM_ID);

  private authStateSubject = new BehaviorSubject<User | null>(null);
  public authState$: Observable<User | null> = this.authStateSubject.asObservable();
  private authSubscription: Subscription | undefined;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
        this.authSubscription = authState(this.auth).subscribe(user => {
        console.log('Auth State Changed:', user ? `Logged in as ${user?.email}` : 'Logged out');
        this.authStateSubject.next(user);
        // Logout wird jetzt im CartService über das authState$ Abo behandelt
        // if (!user) {
        //     if (typeof this.cartService.handleLogout === 'function') { // <-- Nicht mehr nötig
        //          this.cartService.handleLogout();
        //     } else {
        //          console.warn("CartService.handleLogout() not found!");
        //     }
        // }
        });
    } else {
        this.authStateSubject.next(null);
    }
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
    console.log('AuthService destroyed, auth subscription unsubscribed.');
  }

  // --- AUTHENTIFIZIERUNGSMETHODEN ---
  // Login, Register, Logout, signInWithGoogleCredential bleiben
  // wie im VORHERIGEN Post, aber OHNE die cartService.handleLogin Aufrufe!
  // Diese Aufrufe werden jetzt vom CartService selbst initiiert,
  // wenn er die Änderung im authState$ bemerkt.

  async login(email: string, password: string): Promise<UserCredential> {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      console.log('Login successful:', userCredential.user.email);
      // KEIN cartService Aufruf mehr hier
      return userCredential;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  async register(email: string, password: string, profileData?: any): Promise<UserCredential> {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      const user = userCredential.user;
      console.log('Registration successful:', user.email);
      await this._initializeFirestoreData(user, profileData || {});
      // KEIN cartService Aufruf mehr hier
      return userCredential;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      console.log('Logout successful');
      // CartService wird durch authState$ Abo benachrichtigt
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }

  async signInWithGoogleCredential(idToken: string): Promise<UserCredential> {
    console.log('Attempting Firebase sign in with Google ID Token...');
    try {
       const credential = GoogleAuthProvider.credential(idToken);
       const userCredential = await signInWithCredential(this.auth, credential);
       const user = userCredential.user;
       console.log('Firebase Sign-In with Google Credential successful:', user.email);

       const additionalUserInfo = getAdditionalUserInfo(userCredential);
       if (additionalUserInfo?.isNewUser) {
         console.log("Neuer Benutzer via Google registriert. Initialisiere Firestore-Daten...");
         await this._initializeFirestoreDataForNewGoogleUser(user);
         console.log("Firestore-Daten für neuen Google-Nutzer initialisiert.");
       }
       // KEIN cartService Aufruf mehr hier
       return userCredential;
    } catch (error) {
       console.error('Firebase Sign-In with Google Credential failed:', error);
       throw error;
    }
  }


  // --- Firestore Initialisierung (bleibt gleich) ---
  private async _initializeFirestoreData(user: User, additionalData: any): Promise<void> {
      if (!user) return;
      const userDocRef = doc(this.firestore, `users/${user.uid}`);
       const docSnap = await getDoc(userDocRef);
       if (!docSnap.exists()) {
           const userData = {
               uid: user.uid,
               email: user.email || '',
               firstName: additionalData.firstName || user.displayName?.split(' ')[0] || '',
               lastName: additionalData.lastName || user.displayName?.split(' ').slice(1).join(' ') || '',
               address: additionalData.address || { street: '', zip: '', city: '' },
               newsletterSubscribed: additionalData.newsletterSubscribed || false,
               createdAt: serverTimestamp(),
               provider: user.providerData[0]?.providerId || 'password',
               profileComplete: additionalData.profileComplete ?? false
           };
           await setDoc(userDocRef, userData).catch(err => {
               console.error("Fehler beim initialen Schreiben der User Daten in Firestore:", err);
           });
       } else {
            console.warn(`Firestore Dokument für User ${user.uid} existiert bereits.`);
       }
  }
  private async _initializeFirestoreDataForNewGoogleUser(user: User): Promise<void> {
      await this._initializeFirestoreData(user, {});
  }

  // --- Helper (bleiben gleich) ---
  getCurrentUser(): User | null {
    return this.authStateSubject.getValue();
  }
  isLoggedIn(): Observable<boolean> {
    return this.authState$.pipe(map((user: User | null) => !!user));
  }
}