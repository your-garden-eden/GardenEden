export const environment = {
  baseUrl: '',
  production: false,
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
  // shopify: {
  //   storefrontEndpoint: 'https://stygej-6u.myshopify.com/api/2024-04/graphql.json',
  //   storefrontAccessToken: 'de4ef2d4b85379d8746fa07f77322638'
  // },
  woocommerce: {
    apiUrl: 'https://info4725f7bd88c.wpcomstaging.com/wp-json/wc/v3/',
    consumerKey: 'ck_5a48a6bf13cf63ac125919533bf5529f6bb4fa5e', // SPÄTER ÄNDERN!
    consumerSecret: 'cs_95721e41221089a17bd82e6fb6435b453c03b78f', // SPÄTER ÄNDERN!
    storeUrl: 'https://info4725f7bd88c.wpcomstaging.com',
  },
  googleMaps: {
    // Stelle sicher, dass dies ein separater, für Google Maps gedachter API Key ist,
    // der entsprechend für deine Domain(s) eingeschränkt ist.
    apiKey: 'AIzaSyA2W0UsyZEPQA8_GbRYbftcDEtGCe6pDSc', // Prüfen: Ist das wirklich der Maps Key oder der Firebase Key? Derselbe wie oben?
  },
  googleClientId:
    '218586632439-dhapsmvqqmkc81luuu8r9g6ki4avc9kf.apps.googleusercontent.com',
};