import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getAnalytics, provideAnalytics, ScreenTrackingService, UserTrackingService } from '@angular/fire/analytics';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';
import { getStorage, provideStorage } from '@angular/fire/storage';

export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection({ eventCoalescing: true }), provideRouter(routes), provideClientHydration(withEventReplay()), provideFirebaseApp(() => initializeApp({ projectId: "your-garden-eden", appId: "1:218586632439:web:e8e7fbb09a7309e2be03f2", storageBucket: "your-garden-eden.firebasestorage.app", apiKey: "AIzaSyA2W0UsyZEPQA8_GbRYbftcDEtGCe6pDSc", authDomain: "your-garden-eden.firebaseapp.com", messagingSenderId: "218586632439", measurementId: "G-15H8CCF2WT" })), provideAuth(() => getAuth()), provideAnalytics(() => getAnalytics()), ScreenTrackingService, UserTrackingService, provideFirestore(() => getFirestore()), provideFunctions(() => getFunctions()), provideStorage(() => getStorage())]
};
