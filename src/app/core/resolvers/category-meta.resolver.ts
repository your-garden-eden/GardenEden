// src/app/core/resolvers/category-meta.resolver.ts
import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  ResolveFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { of } from 'rxjs';
import { navItems, NavItem, NavSubItem } from '../data/navigation.data';

/**
 * Ein Typ, der sowohl eine Haupt- als auch eine Unterkategorie repräsentieren kann.
 */
type CategoryMeta = NavItem | NavSubItem;

/**
 * Ein hocheffizienter Resolver, der Kategorie-Metadaten aus der statischen
 * `navigation.data.ts`-Datei liest.
 */
export const categoryMetaResolver: ResolveFn<CategoryMeta | null | UrlTree> = ( // KORREKTUR: UrlTree zum Typ hinzugefügt
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
) => {
  const router = inject(Router);
  const slug = route.paramMap.get('slug');

  if (!slug) {
    console.error('CategoryMetaResolver: Kein Kategorie-Slug in der Route gefunden.');
    return router.createUrlTree(['/']);
  }

  const isMainCategoryRoute = route.routeConfig?.path?.startsWith('category/');
  const isSubCategoryRoute = route.routeConfig?.path?.startsWith('product-list/');

  let foundItem: CategoryMeta | undefined;

  if (isSubCategoryRoute) {
    const linkToFind = `/product-list/${slug}`;
    for (const item of navItems) {
      foundItem = item.subItems?.find(
        (subItem) => subItem.link === linkToFind
      );
      if (foundItem) break;
    }
  } else if (isMainCategoryRoute) {
    const linkToFind = `/category/${slug}`;
    foundItem = navItems.find((item) => item.link === linkToFind);
  }

  if (foundItem) {
    return of(foundItem);
  } else {
    console.warn(
      `CategoryMetaResolver: Keine Kategorie-Metadaten für Slug "${slug}" gefunden.`
    );
    // Hier wäre eine 404-Seite ideal.
    // return router.createUrlTree(['/404-not-found']);
    return of(null);
  }
};