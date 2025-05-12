// /src/app/features/account/profile-page/profile-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, computed, Signal, OnDestroy, ChangeDetectorRef } from '@angular/core'; // OnDestroy, ChangeDetectorRef hinzugefügt
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../shared/services/auth.service';
import { Firestore, doc, getDoc, updateDoc, DocumentData, DocumentSnapshot } from '@angular/fire/firestore';
import { User } from '@angular/fire/auth';
import { Title } from '@angular/platform-browser'; // Title importieren
import { TranslocoModule, TranslocoService } from '@ngneat/transloco'; // Transloco importieren
import { Subscription } from 'rxjs'; // Subscription importieren
import { startWith, switchMap, tap } from 'rxjs/operators'; // RxJS Operatoren

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
  createdAt: Date | any;
  provider?: string;
  profileComplete: boolean;
}

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslocoModule], // TranslocoModule hinzugefügt
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.scss'
})
export class ProfilePageComponent implements OnInit, OnDestroy { // OnDestroy implementieren
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private titleService = inject(Title); // TitleService injizieren
  private translocoService = inject(TranslocoService); // TranslocoService injizieren
  private cdr = inject(ChangeDetectorRef); // ChangeDetectorRef injizieren

  currentUser: Signal<User | null> = signal(this.authService.getCurrentUser());
  userProfile: WritableSignal<UserProfile | null> = signal(null);
  isLoading: WritableSignal<boolean> = signal(true);
  isSaving: WritableSignal<boolean> = signal(false);
  errorMessage: WritableSignal<string | null> = signal(null);
  private errorMessageKey: WritableSignal<string | null> = signal(null); // Key für Fehlermeldung
  successMessage: WritableSignal<string | null> = signal(null);
  private successMessageKey: WritableSignal<string | null> = signal(null); // Key für Erfolgsmeldung
  isEditing: WritableSignal<boolean> = signal(false);
  formSubmitted: WritableSignal<boolean> = signal(false);

  profileForm!: FormGroup;
  private subscriptions = new Subscription(); // Für alle Subscriptions

  ngOnInit(): void {
    const user = this.currentUser();
    if (user?.uid) {
      this.loadUserProfile(user.uid);
    } else {
      this.errorMessageKey.set('profilePage.errorUserNotFound'); // Key verwenden
      this.errorMessage.set(this.translocoService.translate(this.errorMessageKey()!));
      this.isLoading.set(false);
      console.error('ProfilePage: No user UID found on init.');
    }

    // Titel und sprachabhängige UI-Texte (Fehler, Erfolg) reaktiv setzen
    const langChangeSub = this.translocoService.langChanges$.pipe(
      startWith(this.translocoService.getActiveLang()),
      switchMap(lang => 
        this.translocoService.selectTranslate('profilePage.title', {}, lang)
      ),
      tap(translatedPageTitle => {
        this.titleService.setTitle(translatedPageTitle);
        if (this.errorMessageKey()) {
          this.errorMessage.set(this.translocoService.translate(this.errorMessageKey()!));
        }
        if (this.successMessageKey()) {
          this.successMessage.set(this.translocoService.translate(this.successMessageKey()!));
        }
      })
    ).subscribe(() => {
      this.cdr.detectChanges();
    });
    this.subscriptions.add(langChangeSub);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private async loadUserProfile(userId: string): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.errorMessageKey.set(null);
    try {
      const userDocRef = doc(this.firestore, `users/${userId}`);
      const docSnap: DocumentSnapshot<DocumentData> = await getDoc(userDocRef);

      if (docSnap.exists()) {
        const profileData = docSnap.data() as UserProfile;
        if (profileData.createdAt?.toDate) {
           profileData.createdAt = profileData.createdAt.toDate();
        }
        this.userProfile.set(profileData);
        this.initializeForm();
      } else {
        console.error(`Kein Profildokument für Benutzer ${userId} gefunden.`);
        this.errorMessageKey.set('profilePage.errorProfileLoad');
        this.errorMessage.set(this.translocoService.translate(this.errorMessageKey()!));
      }
    } catch (error) {
      console.error('Fehler beim Laden des Benutzerprofils:', error);
      this.errorMessageKey.set('profilePage.errorProfileLoadGeneral');
      this.errorMessage.set(this.translocoService.translate(this.errorMessageKey()!));
    } finally {
      this.isLoading.set(false);
    }
  }

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
      newsletter: [profile.newsletterSubscribed]
      // Passwort-Platzhalter entfernt, da es einen Button gibt
    });
  }

  toggleEditMode(): void {
    if (this.isEditing()) {
      this.initializeForm();
      this.formSubmitted.set(false);
      this.errorMessage.set(null);
      this.errorMessageKey.set(null);
      this.successMessage.set(null);
      this.successMessageKey.set(null);
      this.isEditing.set(false);
    } else {
      if (!this.profileForm) { this.initializeForm(); } // Sicherstellen, dass Form existiert
      this.isEditing.set(true);
    }
  }

  async onSubmit(): Promise<void> {
    this.formSubmitted.set(true);
    this.errorMessage.set(null);
    this.errorMessageKey.set(null);
    this.successMessage.set(null);
    this.successMessageKey.set(null);

    if (!this.profileForm || this.profileForm.invalid) {
      console.log('Profilformular ungültig');
      return;
    }

    const user = this.currentUser();
    if (!user?.uid) {
      this.errorMessageKey.set('profilePage.errorUserNotFoundSave');
      this.errorMessage.set(this.translocoService.translate(this.errorMessageKey()!));
      return;
    }

    this.isSaving.set(true);
    const formValue = this.profileForm.getRawValue(); // getRawValue() um auch disabled Felder zu bekommen (obwohl email hier nicht gespeichert wird)
    const updateData = {
      firstName: formValue.firstName,
      lastName: formValue.lastName,
      address: {
        street: formValue.addressStreet,
        zip: formValue.addressZip,
        city: formValue.addressCity
      },
      newsletterSubscribed: formValue.newsletter
    };

    try {
      const userDocRef = doc(this.firestore, `users/${user.uid}`);
      await updateDoc(userDocRef, updateData);
      
      this.userProfile.update(currentProfile => {
        if (!currentProfile) { return null; }
        return {
           ...currentProfile,
           firstName: updateData.firstName,
           lastName: updateData.lastName,
           address: updateData.address,
           newsletterSubscribed: updateData.newsletterSubscribed
        };
      });

      this.successMessageKey.set('profilePage.successProfileUpdate');
      this.successMessage.set(this.translocoService.translate(this.successMessageKey()!));
      this.isEditing.set(false);
      this.formSubmitted.set(false);
      setTimeout(() => {
        this.successMessage.set(null);
        this.successMessageKey.set(null);
      }, 3000);

    } catch (error) {
      console.error('Fehler beim Aktualisieren des Profils:', error);
      this.errorMessageKey.set('profilePage.errorProfileSave');
      this.errorMessage.set(this.translocoService.translate(this.errorMessageKey()!));
    } finally {
      this.isSaving.set(false);
    }
  }

  get firstName() { return this.profileForm?.get('firstName'); }
  get lastName() { return this.profileForm?.get('lastName'); }
  get addressStreet() { return this.profileForm?.get('addressStreet'); }
  get addressZip() { return this.profileForm?.get('addressZip'); }
  get addressCity() { return this.profileForm?.get('addressCity'); }
  get email() { return this.profileForm?.get('email'); }
  get newsletter() { return this.profileForm?.get('newsletter'); }
}