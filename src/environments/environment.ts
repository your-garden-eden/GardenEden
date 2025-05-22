export const environment = {
  baseUrl: '',
  production: true,
  maintenanceMode: false,
  firebase: {
    apiKey: 'AIzaSyA2W0UsyZEPQA8_GbRYbftcDEtGCe6pDSc', // Dein Firebase API Key
    authDomain: 'your-garden-eden.firebaseapp.com',
    projectId: 'your-garden-eden',
    storageBucket: 'your-garden-eden.firebasestorage.app',
    messagingSenderId: '218586632439',
    appId: '1:218586632439:web:e8e7fbb09a7309e2be03f2',
    measurementId: 'G-15H8CCF2WT',
    functionsUrl: 'https://europe-west1-your-garden-eden.cloudfunctions.net',
  },
  woocommerce: {
    // FÜR PRODUKTION: Ersetze diese mit deinen Live-WooCommerce-Daten, wenn du live gehst.
    // Fürs Erste kannst du hier dieselben Staging-Daten wie in environment.development.ts verwenden,
    // oder Platzhalter lassen, bis du eine Live-WC-Instanz hast.
    // Beispielhaft hier mit den Staging-Daten, passe dies für die echte Produktion an!
    apiUrl: 'https://your-garden-eden-4ujzpfm5qt.live-website.com/wp-json/wc/v3/',
    consumerKey: 'ck_764caa58c2fd1cc7a0ad705630b3f8f2ea397dad', // SPÄTER ÄNDERN!
    consumerSecret: 'cs_5ca3357f994013428fb5028baa3bfc8f33e4f969', // SPÄTER ÄNDERN!
    storeUrl: 'https://your-garden-eden-4ujzpfm5qt.live-website.com', // Dies sollte deine LIVE Shop URL sein, z.B. https://www.your-garden-eden.de
  },
  googleMaps: {
    // Stelle sicher, dass dies ein separater, für Google Maps gedachter API Key ist,
    // der entsprechend für deine Domain(s) eingeschränkt ist.
    apiKey: 'AIzaSyA2W0UsyZEPQA8_GbRYbftcDEtGCe6pDSc', // Prüfen: Ist das wirklich der Maps Key oder der Firebase Key? Derselbe wie oben?
  },
  googleClientId:
    '218586632439-dhapsmvqqmkc81luuu8r9g6ki4avc9kf.apps.googleusercontent.com',
};