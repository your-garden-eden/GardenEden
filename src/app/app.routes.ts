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
import { ResetPasswordPageComponent } from './features/auth/reset-password-page/reset-password-page.component';

// NEUE IMPORTE für die Resolver
import { productResolver } from './core/resolvers/product.resolver';
import { categoryMetaResolver } from './core/resolvers/category-meta.resolver';

export const routes: Routes = [
  // Die titleKey-Eigenschaft wird von unserer SeoTitleStrategy für statische Titel weiterverwendet.
  { path: '', component: HomeComponent, data: { titleKey: 'home.title' } },
  {
    path: 'product-list/:slug',
    component: ProductListPageComponent,
    data: {
      reuseComponent: true,
      // HINWEIS: titleKey wird durch den Resolver überflüssig und entfernt.
    },
    // NEU: Der Resolver wird hier registriert.
    resolve: {
      categoryMeta: categoryMetaResolver,
    },
    // ENTFERNT: Der statische Titel ist nun obsolet.
    // title: 'Produkte'
  },
  {
    path: 'product/:handle',
    component: ProductPageComponent,
    // NEU: Der Resolver wird hier registriert.
    resolve: {
      product: productResolver,
    },
    // ENTFERNT: Der statische Titel ist nun obsolet.
    // title: 'Produkt'
  },
  {
    path: 'category/:slug',
    component: CategoryOverviewComponent,
    // NEU: Der Resolver wird hier registriert.
    resolve: {
      // HINWEIS: Wir benennen den Schlüssel hier 'mainCategoryMeta', um in der
      // SeoTitleStrategy klar zwischen Haupt- und Unterkategorien unterscheiden zu können.
      mainCategoryMeta: categoryMetaResolver,
    },
    // ENTFERNT: Der statische Titel ist nun obsolet.
    // title: 'Kategorie'
  },

  // --- Statische Seiten Routen (unverändert) ---
  {
    path: 'impressum',
    component: StaticPageComponent,
    data: { contentFile: 'impressum', titleKey: 'staticPage.impressum.title' },
  },
  {
    path: 'datenschutz',
    component: StaticPageComponent,
    data: { contentFile: 'datenschutz', titleKey: 'staticPage.datenschutz.title' },
  },
  {
    path: 'agb',
    component: StaticPageComponent,
    data: { contentFile: 'agb', titleKey: 'staticPage.agb.title' },
  },
  {
    path: 'widerrufsrecht',
    component: StaticPageComponent,
    data: { contentFile: 'widerruf', titleKey: 'staticPage.widerrufsrecht.title' },
  },
  {
    path: 'kontakt',
    component: StaticPageComponent,
    data: { contentFile: 'kontakt', titleKey: 'staticPage.kontakt.title' },
  },
  {
    path: 'versand',
    component: StaticPageComponent,
    data: { contentFile: 'versand', titleKey: 'staticPage.versand.title' },
  },
  {
    path: 'faq',
    component: StaticPageComponent,
    data: { contentFile: 'faq', titleKey: 'staticPage.faq.title' },
  },
  {
    path: 'ueber-uns',
    component: StaticPageComponent,
    data: { contentFile: 'ueber-uns', titleKey: 'staticPage.ueberUns.title' },
  },

  // --- Auth Routen (unverändert) ---
  {
    path: 'register',
    component: RegisterPageComponent,
    data: { titleKey: 'registerPage.title' },
  },
  {
    path: 'reset-password',
    component: ResetPasswordPageComponent,
    data: { titleKey: 'resetPasswordPage.title' },
  },

  // --- Geschützte "Mein Konto" Sektion (unverändert) ---
  {
    path: 'mein-konto',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/account/profile-page/profile-page.component').then(m => m.ProfilePageComponent),
        data: { titleKey: 'profilePage.title' },
        pathMatch: 'full'
      },
      {
        path: 'wunschliste',
        loadComponent: () => import('./features/wishlist/wishlist-page/wishlist-page.component').then(m => m.WishlistPageComponent),
        data: { titleKey: 'wishlistPage.title' },
      }
    ]
  },

  // --- Warenkorb-Route (unverändert) ---
  {
    path: 'warenkorb',
    loadComponent: () => import('./features/cart/cart-page/cart-page.component').then(m => m.CartPageComponent),
    data: { titleKey: 'cartPage.title' },
  },

  // --- Checkout-Routen (unverändert) ---
  {
    path: 'checkout-details',
    component: CheckoutDetailsPageComponent,
    data: { titleKey: 'checkoutDetailsPage.title' },
  },
  {
    path: 'order-confirmation',
    component: OrderConfirmationComponent,
    data: { titleKey: 'orderConfirmationPage.title' },
  },
];