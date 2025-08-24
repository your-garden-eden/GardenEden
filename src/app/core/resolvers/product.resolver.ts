// src/app/core/resolvers/product.resolver.ts
import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  ResolveFn,
  Router,
  UrlTree,
} from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, first, map } from 'rxjs/operators';
import {
  WoocommerceService,
  WooCommerceProduct,
} from '../services/woocommerce.service';

export const productResolver: ResolveFn<WooCommerceProduct | null | UrlTree> = (
  route: ActivatedRouteSnapshot
) => {
  const wooCommerceService = inject(WoocommerceService);
  const router = inject(Router);
  const productSlug = route.paramMap.get('handle');

  if (!productSlug) {
    console.error('ProductResolver: Kein Produkt-Handle in der Route gefunden.');
    return router.createUrlTree(['/']);
  }

  // Der AuthInterceptor erledigt die Authentifizierung automatisch im Hintergrund.
  return wooCommerceService.getProductBySlug(productSlug).pipe(
    first(),
    map(product => product || null), // Stelle sicher, dass wir null statt undefined zurückgeben
    catchError((error) => {
      console.error(
        `ProductResolver: Fehler beim Abrufen des Produkts mit Slug "${productSlug}".`,
        error
      );
      // Let the interceptor handle auth errors. For other errors, navigate away.
      // The interceptor will retry, and if it fails again, this will trigger.
      return of(router.createUrlTree(['/']));
    })
  );
};