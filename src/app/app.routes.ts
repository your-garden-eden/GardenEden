// /src/app/app.routes.ts
import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { ProductListPageComponent } from './features/product-list/product-list.component';
import { ProductPageComponent } from './features/product-page/product-page.component';
import { CategoryOverviewComponent } from './features/category-overview/category-overview.component';
import { StaticPageComponent } from './features/static-page/static-page.component';
import { RegisterPageComponent } from './features/auth/register-page/register-page.component';
// ProfilePageComponent wird lazy geladen
import { authGuard } from './core/guards/auth.guard';

// Importiere deine CheckoutDetailsPageComponent
import { CheckoutDetailsPageComponent } from './features/checkout/checkout-details-page/checkout-details-page.component';

// +++ IMPORT FÜR ORDER CONFIRMATION EINKOMMENTIERT UND PFAD ÜBERPRÜFEN +++
import { OrderConfirmationComponent } from './features/checkout/order-confirmation/order-confirmation.component';
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


export const routes: Routes = [
  // --- Bestehende Routen ---
  { path: '', component: HomeComponent, data: { titleKey: 'home.title' }, title: 'Your Garden Eden - Startseite' },
  {
    path: 'product-list/:slug',
    component: ProductListPageComponent,
    // HIER DIE ERGÄNZUNG FÜR DIE ROUTE REUSE STRATEGY
    data: { reuseComponent: true, titleKey: 'productList.pageTitle' }, // titleKey optional, falls du es so nutzt
    title: 'Produkte' // Dieser Titel wird dynamisch in der Komponente gesetzt
  },
  { path: 'product/:handle', component: ProductPageComponent, title: 'Produkt' }, // Produktseite wird typischerweise nicht wiederverwendet
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

  // --- Geschützte Routen ---
  {
    path: 'mein-konto',
    loadComponent: () => import('./features/account/profile-page/profile-page.component').then(m => m.ProfilePageComponent),
    data: { titleKey: 'profilePage.title' },
    title: 'Mein Konto',
    canActivate: [authGuard]
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

  // --- WUNSCHLISTE-ROUTE ---
  {
    path: 'wunschliste',
    loadComponent: () => import('./features/wishlist/wishlist-page/wishlist-page.component').then(m => m.WishlistPageComponent),
    data: { titleKey: 'wishlistPage.title' },
    title: 'Meine Wunschliste',
    canActivate: [authGuard]
  },

  // Wildcard-Route am Ende (optional, falls du eine 404-Seite hast)
  // { path: '**', component: NotFoundComponent, data: { titleKey: 'notFound.title' }, title: 'Seite nicht gefunden' }
];