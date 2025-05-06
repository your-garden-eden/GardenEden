// /src/app/app.routes.ts
import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { ProductListComponent } from './features/product-list/product-list.component';
import { ProductPageComponent } from './features/product-page/product-page.component';
import { CategoryOverviewComponent } from './features/category-overview/category-overview.component';
import { StaticPageComponent } from './features/static-page/static-page.component';
import { RegisterPageComponent } from './features/auth/register-page/register-page.component';
import { ProfilePageComponent } from './features/account/profile-page/profile-page.component'; // Pfad prüfen!
import { authGuard } from './core/guards/auth.guard'; // Pfad prüfen!

export const routes: Routes = [
  // --- Bestehende Routen ---
  { path: '', component: HomeComponent, title: 'Your Garden Eden - Startseite' },
  { path: 'product-list/:slug', component: ProductListComponent, title: 'Produkte' },
  { path: 'product/:handle', component: ProductPageComponent, title: 'Produkt' },
  { path: 'category/:slug', component: CategoryOverviewComponent, title: 'Kategorie' },

  // --- Statische Seiten Routen ---
  { path: 'impressum', component: StaticPageComponent, title: 'Impressum - Your Garden Eden', data: { contentFile: 'impressum.md' } },
  { path: 'datenschutz', component: StaticPageComponent, title: 'Datenschutz - Your Garden Eden', data: { contentFile: 'datenschutz.md' } },
  { path: 'agb', component: StaticPageComponent, title: 'AGB - Your Garden Eden', data: { contentFile: 'agb.md' } },
  { path: 'widerrufsrecht', component: StaticPageComponent, title: 'Widerrufsrecht - Your Garden Eden', data: { contentFile: 'widerruf.md' } },
  { path: 'kontakt', component: StaticPageComponent, title: 'Kontakt - Your Garden Eden', data: { contentFile: 'kontakt.md' } },
  { path: 'versand', component: StaticPageComponent, title: 'Versand & Lieferung - Your Garden Eden', data: { contentFile: 'versand.md' } },
  { path: 'faq', component: StaticPageComponent, title: 'FAQ - Your Garden Eden', data: { contentFile: 'faq.md' } },
  { path: 'ueber-uns', component: StaticPageComponent, title: 'Über Uns - Your Garden Eden', data: { contentFile: 'ueber-uns.md' } },

  // --- Auth Routen ---
  { path: 'register', component: RegisterPageComponent, title: 'Registrieren - Your Garden Eden' },
  // { path: 'login', ... } // Entfernt

  // --- Geschützte Routen ---
  {
    path: 'mein-konto',
    // Lazy Loading für Profilseite empfohlen
    loadComponent: () => import('./features/account/profile-page/profile-page.component').then(m => m.ProfilePageComponent),
    title: 'Mein Konto - Your Garden Eden',
    canActivate: [authGuard] // Schützt diese Route
  },

  // --- Warenkorb-Route ---
  {
    path: 'warenkorb',
    loadComponent: () => import('./features/cart/cart-page/cart-page.component').then(m => m.CartPageComponent),
    title: 'Warenkorb - Your Garden Eden'
    // Warenkorb ist nicht geschützt
  },

  // --- NEUE WUNSCHLISTE-ROUTE ---
  {
    path: 'wunschliste',
    // Lazy Loading für die neue Komponente (Pfad prüfen!)
    loadComponent: () => import('./features/wishlist/wishlist-page/wishlist-page.component').then(m => m.WishlistPageComponent),
    title: 'Meine Wunschliste - Your Garden Eden',
    canActivate: [authGuard] // Schützt die Wunschliste
  },
  // --- ENDE NEUE WUNSCHLISTE-ROUTE ---


  // Wildcard-Route am Ende (optional, falls du eine 404-Seite hast)
  // { path: '**', component: NotFoundComponent, title: 'Seite nicht gefunden' }
];