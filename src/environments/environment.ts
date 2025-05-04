// /src/environments/environment.ts

export const environment = {
  production: true, // Korrekt für Produktions-Build
  maintenanceMode: false, // Sollte in Produktion normalerweise false sein
  firebase: {
    apiKey: "AIzaSyA2W0UsyZEPQA8_GbRYbftcDEtGCe6pDSc", // Dein Firebase API Key (Produktion?)
    authDomain: "your-garden-eden.firebaseapp.com",
    projectId: "your-garden-eden",
    storageBucket: "your-garden-eden.firebasestorage.app",
    messagingSenderId: "218586632439",
    appId: "1:218586632439:web:e8e7fbb09a7309e2be03f2",
    measurementId: "G-15H8CCF2WT"
  },
  shopify: {
    storefrontEndpoint: 'https://stygej-6u.myshopify.com/api/2024-04/graphql.json',
    storefrontAccessToken: 'de4ef2d4b85379d8746fa07f77322638' // Dein Storefront Access Token (Produktion?)
  },
  googleMaps: {
    apiKey: 'AIzaSyA2W0UsyZEPQA8_GbRYbftcDEtGCe6pDSc' // Dein Google Maps API Key (Produktion?) - WARUM GLEICH WIE FIREBASE? Prüfen!
  },
  // --- NEU: Google OAuth Client ID für GSI ---
  googleClientId: '218586632439-dhapsmvqqmkc81luuu8r9g6ki4avc9kf.apps.googleusercontent.com' // Dein Web Client ID (Produktion?)
  // --- ENDE ---
};