export const environment = {
  baseUrl: '',
  production: true,
  maintenanceMode: false,
  firebase: {
    apiKey: 'AIzaSyA2W0UsyZEPQA8_GbRYbftcDEtGCe6pDSc', // Dieser bleibt, wird für die Firebase-App-Initialisierung benötigt
    authDomain: 'your-garden-eden.firebaseapp.com',
    projectId: 'your-garden-eden',
    storageBucket: 'your-garden-eden.firebasestorage.app',
    messagingSenderId: '218586632439',
    appId: '1:218586632439:web:e8e7fbb09a7309e2be03f2',
    measurementId: 'G-15H8CCF2WT',
    functionsUrl: 'https://europe-west1-your-garden-eden.cloudfunctions.net',
  },
  woocommerce: {
    // Die 'apiUrl' und 'storeUrl' bleiben, da sie für die Konstruktion von API-Aufrufen benötigt werden.
    apiUrl: 'https://your-garden-eden-4ujzpfm5qt.live-website.com/wp-json/wc/v3/',
    storeUrl: 'https://your-garden-eden-4ujzpfm5qt.live-website.com', 
    // consumerKey und consumerSecret werden entfernt, da sie nicht mehr benötigt und ein Sicherheitsrisiko sind.
  },
  googleMaps: {
    apiKey: 'AIzaSyA2W0UsyZEPQA8_GbRYbftcDEtGCe6pDSc', 
  },
  googleClientId:
    '218586632439-dhapsmvqqmkc81luuu8r9g6ki4avc9kf.apps.googleusercontent.com',
};