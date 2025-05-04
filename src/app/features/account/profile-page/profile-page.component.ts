// /src/app/features/account/profile-page/profile-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, computed, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth.service';
import { Firestore, doc, getDoc, updateDoc, DocumentData, DocumentSnapshot } from '@angular/fire/firestore';
import { User } from '@angular/fire/auth';

// Interface für die Benutzerprofildaten in Firestore (ANGEPASST)
interface UserProfile extends DocumentData {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  address: {
    street: string;
    zip: string;
    city: string;
  };
  newsletterSubscribed: boolean;
  createdAt: Date | any; // Firestore Timestamp könnte auch ein Objekt sein
  provider?: string; // Optional: 'google.com', 'apple.com', 'password'
  // --- NEU ---
  profileComplete: boolean; // Ist das Profil vollständig (Adresse etc.)?
  // --- ENDE NEU ---
}

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.scss'
})
export class ProfilePageComponent implements OnInit {
  // Services injizieren
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private router = inject(Router);

  // Signale für Zustand
  currentUser: Signal<User | null> = signal(this.authService.getCurrentUser());
  userProfile: WritableSignal<UserProfile | null> = signal(null);
  isLoading: WritableSignal<boolean> = signal(true);
  isSaving: WritableSignal<boolean> = signal(false);
  errorMessage: WritableSignal<string | null> = signal(null);
  successMessage: WritableSignal<string | null> = signal(null);
  isEditing: WritableSignal<boolean> = signal(false);
  formSubmitted: WritableSignal<boolean> = signal(false);

  // Formular-Gruppe
  profileForm!: FormGroup;

  ngOnInit(): void {
    const user = this.currentUser();
    if (user?.uid) {
      this.loadUserProfile(user.uid);
    } else {
      this.errorMessage.set('Benutzer nicht gefunden. Bitte neu anmelden.');
      this.isLoading.set(false);
      console.error('ProfilePage: No user UID found on init.');
    }
  }

  /** Lädt das Benutzerprofil aus Firestore */
  private async loadUserProfile(userId: string): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const userDocRef = doc(this.firestore, `users/${userId}`);
      const docSnap: DocumentSnapshot<DocumentData> = await getDoc(userDocRef);

      if (docSnap.exists()) {
        const profileData = docSnap.data() as UserProfile;
        if (profileData.createdAt?.toDate) { // Prüfen ob es ein Timestamp ist
           profileData.createdAt = profileData.createdAt.toDate();
        }
        this.userProfile.set(profileData);
        console.log('User profile loaded:', profileData);
        this.initializeForm(); // Formular initialisieren
      } else {
        console.error(`Kein Profildokument für Benutzer ${userId} gefunden.`);
        this.errorMessage.set('Benutzerprofil konnte nicht geladen werden.');
      }
    } catch (error) {
      console.error('Fehler beim Laden des Benutzerprofils:', error);
      this.errorMessage.set('Fehler beim Laden des Profils.');
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Initialisiert das Formular mit den Profildaten */
  private initializeForm(): void {
    const profile = this.userProfile();
    if (!profile) return;

    this.profileForm = this.fb.group({
      email: [{ value: profile.email, disabled: true }],
      firstName: [profile.firstName, Validators.required],
      lastName: [profile.lastName, Validators.required],
      addressStreet: [profile.address?.street || '', Validators.required],
      addressZip: [profile.address?.zip || '', [Validators.required, Validators.pattern(/^\d{5}$/)]],
      addressCity: [profile.address?.city || '', Validators.required],
      newsletter: [profile.newsletterSubscribed],
      passwordPlaceholder: [{ value: '', disabled: true }]
    });
  }

  /** Wechselt zwischen Anzeige- und Bearbeitungsmodus */
  toggleEditMode(): void {
    if (this.isEditing()) {
      this.initializeForm(); // Mit Originaldaten neu initialisieren
      this.formSubmitted.set(false);
      this.errorMessage.set(null);
      this.isEditing.set(false);
    } else {
      if (!this.profileForm) { this.initializeForm(); }
      this.isEditing.set(true);
    }
  }

  /** Speichert die geänderten Profildaten */
  async onSubmit(): Promise<void> {
    this.formSubmitted.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    if (!this.profileForm || this.profileForm.invalid) {
      console.log('Profilformular ungültig');
      return;
    }

    const user = this.currentUser();
    if (!user?.uid) {
      this.errorMessage.set('Benutzer nicht gefunden. Speichern fehlgeschlagen.');
      return;
    }

    this.isSaving.set(true);
    const formValue = this.profileForm.value;
    const updateData = {
      firstName: formValue.firstName,
      lastName: formValue.lastName,
      address: {
        street: formValue.addressStreet,
        zip: formValue.addressZip,
        city: formValue.addressCity
      },
      newsletterSubscribed: formValue.newsletter
      // profileComplete wird hier NICHT geändert, das passiert nur auf der /complete-profile Seite
    };

    try {
      const userDocRef = doc(this.firestore, `users/${user.uid}`);
      await updateDoc(userDocRef, updateData);
      console.log('Profil erfolgreich aktualisiert.');

      // Korrigierte Aktualisierung des Signals
      this.userProfile.update(currentProfile => {
        if (!currentProfile) { return null; }
        const updatedProfile: UserProfile = {
           ...currentProfile,
           firstName: updateData.firstName,
           lastName: updateData.lastName,
           address: updateData.address,
           newsletterSubscribed: updateData.newsletterSubscribed
        };
        return updatedProfile;
      });

      this.successMessage.set('Profil erfolgreich aktualisiert!');
      this.isEditing.set(false);
      this.formSubmitted.set(false);
      setTimeout(() => this.successMessage.set(null), 3000);

    } catch (error) {
      console.error('Fehler beim Aktualisieren des Profils:', error);
      this.errorMessage.set('Fehler beim Speichern des Profils.');
    } finally {
      this.isSaving.set(false);
    }
  }

  // --- Formular-Getter ---
  get firstName() { return this.profileForm?.get('firstName'); }
  get lastName() { return this.profileForm?.get('lastName'); }
  get addressStreet() { return this.profileForm?.get('addressStreet'); }
  get addressZip() { return this.profileForm?.get('addressZip'); }
  get addressCity() { return this.profileForm?.get('addressCity'); }
  get email() { return this.profileForm?.get('email'); }
  get newsletter() { return this.profileForm?.get('newsletter'); }

}