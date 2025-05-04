// /src/app/shared/services/auth.service.ts
import { Injectable, inject, OnDestroy } from '@angular/core';
import { Auth, authState, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, User, UserCredential, signInWithCredential, getAdditionalUserInfo } from '@angular/fire/auth';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { Firestore, doc, setDoc, serverTimestamp } from '@angular/fire/firestore'; // Firestore Imports

@Injectable({
  providedIn: 'root'
})
export class AuthService implements OnDestroy {
  private auth: Auth = inject(Auth);
  private firestore = inject(Firestore); // Firestore injiziert
  private authStateSubject = new BehaviorSubject<User | null>(null);
  public authState$: Observable<User | null> = this.authStateSubject.asObservable();
  private authSubscription: Subscription | undefined;

  constructor() {
    this.authSubscription = authState(this.auth).subscribe(user => {
      console.log('Auth State Changed:', user ? `Logged in as ${user?.email}` : 'Logged out');
      this.authStateSubject.next(user);
    });
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
    console.log('AuthService destroyed, auth subscription unsubscribed.');
  }

  // --- AUTHENTIFIZIERUNGSMETHODEN ---

  async login(email: string, password: string): Promise<UserCredential> {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      console.log('Login successful:', userCredential.user.email);
      return userCredential;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  async register(email: string, password: string): Promise<UserCredential> {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      console.log('Registration successful:', userCredential.user.email);
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
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }

  /** @deprecated */
  async loginWithGooglePopup(): Promise<UserCredential> {
    console.warn("loginWithGooglePopup wird aufgerufen (veraltet).");
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(this.auth, provider);
      console.log('Google Sign-In (Popup) successful:', userCredential.user.email);
      return userCredential;
    } catch (error) {
      console.error('Google Sign-In (Popup) failed:', error);
      throw error;
    }
  }

  // --- GSI Login ERWEITERT ---
  async signInWithGoogleCredential(idToken: string): Promise<UserCredential> {
    console.log('Attempting Firebase sign in with Google ID Token...');
    try {
       const credential = GoogleAuthProvider.credential(idToken);
       const userCredential = await signInWithCredential(this.auth, credential);
       console.log('Firebase Sign-In with Google Credential successful:', userCredential.user.email);

       const additionalUserInfo = getAdditionalUserInfo(userCredential);
       if (additionalUserInfo?.isNewUser) {
         console.log("Neuer Benutzer via Google registriert. Initialisiere Firestore-Daten...");
         try {
           await this._initializeFirestoreDataForNewGoogleUser(userCredential.user);
           console.log("Firestore-Daten für neuen Google-Nutzer initialisiert.");
         } catch (firestoreError) {
           console.error("Fehler beim Initialisieren der Firestore-Daten für neuen Google-Nutzer:", firestoreError);
         }
       }
       return userCredential;
    } catch (error) {
       console.error('Firebase Sign-In with Google Credential failed:', error);
       throw error;
    }
  }

  // --- Firestore Initialisierung für Google User ANGEPASST ---
  private async _initializeFirestoreDataForNewGoogleUser(user: User): Promise<void> {
      if (!user) return;
      const userDocRef = doc(this.firestore, `users/${user.uid}`);
      const userData = {
        uid: user.uid,
        email: user.email || '',
        firstName: user.displayName?.split(' ')[0] || '',
        lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
        address: { street: '', zip: '', city: '' }, // Adresse leer
        newsletterSubscribed: false, // Standardmäßig false
        createdAt: serverTimestamp(), // Firestore Timestamp
        provider: 'google.com', // Provider setzen
        profileComplete: false // <<< Profil ist NICHT vollständig
      };
      await setDoc(userDocRef, userData).catch(err => {
          console.error("Fehler beim initialen Schreiben der Google User Daten in Firestore:", err);
      });
  }
  // --- ENDE ---


  getCurrentUser(): User | null {
    return this.authStateSubject.getValue();
  }

  isLoggedIn(): Observable<boolean> {
    return this.authState$.pipe(map((user: User | null) => !!user));
  }
}