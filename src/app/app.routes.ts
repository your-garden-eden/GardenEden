// /src/app/app.routes.ts
import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { ProductListPageComponent } from './features/product-list/product-list.component';
import { ProductPageComponent } from './features/product-page/product-page.component';
import { CategoryOverviewComponent } from './features/category-overview/category-overview.component';
import { StaticPageComponent } from './features/static-page/static-page.component';
import { RegisterPageComponent } from './features/auth/register-page/register-page.component';
import { authGuard } from './core/guards/auth.guard';
import { CheckoutDetailsPageComponent } from './features/checkout/checkout-details-page/checkout-details-page.component';
import { OrderConfirmationComponent } from './features/checkout/order-confirmation/order-confirmation.component';
// NEUER IMPORT
import { ResetPasswordPageComponent } from './features/auth/reset-password-page/reset-password-page.component';


export const routes: Routes = [
  { path: '', component: HomeComponent, data: { titleKey: 'home.title' }, title: 'Your Garden Eden - Startseite' },
  {
    path: 'product-list/:slug',
    component: ProductListPageComponent,
    data: { reuseComponent: true, titleKey: 'productList.pageTitle' },
    title: 'Produkte'
  },
  { path: 'product/:handle', component: ProductPageComponent, title: 'Produkt' },
  { path: 'category/:slug', component: CategoryOverviewComponent, title: 'Kategorie' },

  // --- Statische Seiten Routen ---
  {
    path: 'impressum',
    component: StaticPageComponent,
    data: { contentFile: 'impressum', titleKey: 'staticPage.impressum.title' },
    title: 'Impressum'
  },
  {
    path: 'datenschutz',
    component: StaticPageComponent,
    data: { contentFile: 'datenschutz', titleKey: 'staticPage.datenschutz.title' },
    title: 'Datenschutz'
  },
  {
    path: 'agb',
    component: StaticPageComponent,
    data: { contentFile: 'agb', titleKey: 'staticPage.agb.title' },
    title: 'AGB'
  },
  {
    path: 'widerrufsrecht',
    component: StaticPageComponent,
    data: { contentFile: 'widerruf', titleKey: 'staticPage.widerrufsrecht.title' },
    title: 'Widerrufsrecht'
  },
  {
    path: 'kontakt',
    component: StaticPageComponent,
    data: { contentFile: 'kontakt', titleKey: 'staticPage.kontakt.title' },
    title: 'Kontakt'
  },
  {
    path: 'versand',
    component: StaticPageComponent,
    data: { contentFile: 'versand', titleKey: 'staticPage.versand.title' },
    title: 'Versand & Lieferung'
  },
  {
    path: 'faq',
    component: StaticPageComponent,
    data: { contentFile: 'faq', titleKey: 'staticPage.faq.title' },
    title: 'FAQ'
  },
  {
    path: 'ueber-uns',
    component: StaticPageComponent,
    data: { contentFile: 'ueber-uns', titleKey: 'staticPage.ueberUns.title' },
    title: 'Über Uns'
  },

  // --- Auth Routen ---
  {
    path: 'register',
    component: RegisterPageComponent,
    data: { titleKey: 'registerPage.title' },
    title: 'Registrieren'
  },
  // NEUE ROUTE FÜR PASSWORT-RESET
  {
    path: 'reset-password',
    component: ResetPasswordPageComponent,
    data: { titleKey: 'resetPasswordPage.title' },
    title: 'Passwort zurücksetzen'
  },

  // --- Geschützte "Mein Konto" Sektion ---
  {
    path: 'mein-konto',
    canActivate: [authGuard], // Der Guard schützt alle Kind-Routen
    children: [
      {
        path: '', // Die leere Route /mein-konto
        loadComponent: () => import('./features/account/profile-page/profile-page.component').then(m => m.ProfilePageComponent),
        data: { titleKey: 'profilePage.title' },
        title: 'Mein Konto',
        pathMatch: 'full' // Wichtig für leere Kind-Routen
      },
      {
        path: 'wunschliste', // Die Kind-Route /mein-konto/wunschliste
        loadComponent: () => import('./features/wishlist/wishlist-page/wishlist-page.component').then(m => m.WishlistPageComponent),
        data: { titleKey: 'wishlistPage.title' },
        title: 'Meine Wunschliste'
      }
      // Hier könnten zukünftig weitere Kind-Routen hinzukommen, z.B. 'bestellungen'
    ]
  },


  // --- Warenkorb-Route ---
  {
    path: 'warenkorb',
    loadComponent: () => import('./features/cart/cart-page/cart-page.component').then(m => m.CartPageComponent),
    data: { titleKey: 'cartPage.title' },
    title: 'Warenkorb'
  },

  // --- Checkout-Routen ---
  {
    path: 'checkout-details',
    component: CheckoutDetailsPageComponent,
    data: { titleKey: 'checkoutDetailsPage.title' },
    title: 'Bestelldetails',
  },
  {
    path: 'order-confirmation',
    component: OrderConfirmationComponent,
    data: { titleKey: 'orderConfirmationPage.title' },
    title: 'Bestellbestätigung'
  },

  // HINWEIS: Die alte 'wunschliste'-Route wurde entfernt
];