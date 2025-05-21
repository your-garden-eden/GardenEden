// /src/app/shared/services/auth.service.ts
import { Injectable, inject, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  Auth,
  authState,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup, // Behalten, falls du Popup-Login doch mal brauchst, sonst entfernen
  User,
  UserCredential,
  signInWithCredential,
  getAdditionalUserInfo,
  sendEmailVerification // +++ NEU +++
} from '@angular/fire/auth';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { Firestore, doc, setDoc, serverTimestamp, getDoc } from '@angular/fire/firestore';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthService implements OnDestroy {
  private auth: Auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  private authStateSubject = new BehaviorSubject<User | null>(null);
  public authState$: Observable<User | null> = this.authStateSubject.asObservable();
  private authSubscription: Subscription | undefined;

  // +++ NEU: ActionCodeSettings für E-Mail-Links (optional, aber gut für Weiterleitung) +++
  private actionCodeSettings = {
    // URL, zu der der Nutzer nach der Bestätigung weitergeleitet werden soll.
    // Hier könntest du z.B. auf die Login-Seite oder eine spezielle "E-Mail bestätigt"-Seite leiten.
    // Für den Anfang können wir es einfach auf die Homepage setzen.
    // WICHTIG: Diese URL muss in der Firebase Console unter "Authentication" -> "Sign-in method" -> "Authorized domains" freigegeben sein.
    // Deine Hauptdomain (your-garden-eden.de) sollte dort bereits stehen.
    url: 'https://www.your-garden-eden.de/login?emailVerified=true', // Beispiel: Weiterleitung zur Login-Seite mit Parameter
    handleCodeInApp: false // true, wenn du den Link in der App selbst verarbeiten willst (komplexer)
  };

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
        this.authSubscription = authState(this.auth).subscribe(user => {
        console.log('Auth State Changed:', user ? `Logged in as ${user?.email} (Verified: ${user?.emailVerified})` : 'Logged out'); // Info zur Verifizierung hinzugefügt
        this.authStateSubject.next(user);
        });
    } else {
        this.authStateSubject.next(null);
    }
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
    console.log('AuthService destroyed, auth subscription unsubscribed.' );
  }

  async login(email: string, password: string): Promise<UserCredential> {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      const user = userCredential.user;
      console.log('Login successful:', user.email);

      // +++ NEU: Hinweis, falls E-Mail nicht verifiziert ist beim Login +++
      if (user && !user.emailVerified) {
        console.warn(`User ${user.email} logged in, but email is not verified.`);
        // Hier könnte man eine Meldung an den Nutzer geben oder ihn auffordern, die E-Mail zu bestätigen.
        // Optional: Erneutes Senden der Verifizierungs-E-Mail anbieten.
        // this.sendVerificationEmail(user); // Beispielhaft
      }
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

      // +++ NEU: Bestätigungs-E-Mail senden +++
      if (user) { // Sicherstellen, dass user nicht null ist
        await this.sendVerificationEmail(user);
      }
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
         // +++ NEU: Bestätigungs-E-Mail senden, falls E-Mail von Google nicht als verifiziert gilt (selten, aber sicher ist sicher) +++
         // Google setzt emailVerified meist direkt auf true.
         if (user && !user.emailVerified) {
            await this.sendVerificationEmail(user);
         }
       }
       return userCredential;
    } catch (error) {
       console.error('Firebase Sign-In with Google Credential failed:', error);
       throw error;
    }
  }

  // +++ NEU: Methode zum Senden der Bestätigungs-E-Mail +++
  async sendVerificationEmail(user: User | null = this.getCurrentUser()): Promise<void> {
    if (user && !user.emailVerified) { // Nur senden, wenn User existiert und E-Mail nicht bereits verifiziert ist
      try {
        await sendEmailVerification(user, this.actionCodeSettings);
        console.log(`Verification email sent to ${user.email}. Please check your inbox.`);
        // Hier könntest du ein UI-Feedback geben (z.B. Toast-Nachricht)
        // "Bestätigungs-E-Mail wurde an Ihre Adresse gesendet."
      } catch (error) {
        console.error('Error sending verification email:', error);
        // Hier UI-Feedback für Fehler geben
        throw error; // Fehler weiterwerfen, damit aufrufende Komponente reagieren kann
      }
    } else if (user && user.emailVerified) {
      console.log(`Email ${user.email} is already verified.`);
    } else if (!user) {
      console.warn('No user logged in to send verification email.');
    }
  }


  private async _initializeFirestoreData(user: User, additionalData: any): Promise<void> {
      if (!user) return;
      const userDocRef = doc(this.firestore, `users/${user.uid}`);
       const docSnap = await getDoc(userDocRef);
       if (!docSnap.exists()) {
           const userData = {
               uid: user.uid,
               email: user.email || '',
               // +++ NEU: emailVerified Status in Firestore speichern (optional, aber nützlich für Queries/Rules) +++
               emailVerified: user.emailVerified, // Wird initial false sein, bis Nutzer Link klickt
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
            // +++ NEU: emailVerified Status in Firestore aktualisieren, falls sich geändert (z.B. bei Google Login) +++
            const existingData = docSnap.data();
            if (existingData && existingData['emailVerified'] !== user.emailVerified) {
                await setDoc(userDocRef, { emailVerified: user.emailVerified }, { merge: true });
            }
            console.warn(`Firestore Dokument für User ${user.uid} existiert bereits. emailVerified: ${user.emailVerified}`);
       }
  }
  private async _initializeFirestoreDataForNewGoogleUser(user: User): Promise<void> {
      // Google User haben oft schon emailVerified: true. Dies wird hier korrekt übernommen.
      await this._initializeFirestoreData(user, {});
  }

  getCurrentUser(): User | null {
    return this.authStateSubject.getValue();
  }
  isLoggedIn(): Observable<boolean> {
    return this.authState$.pipe(map((user: User | null) => !!user));
  }

  // +++ NEU: Hilfsmethode, um den emailVerified Status zu prüfen (bequemer Zugriff) +++
  isCurrentUserEmailVerified(): Observable<boolean> {
    return this.authState$.pipe(
      map(user => !!user && user.emailVerified)
    );
  }
}