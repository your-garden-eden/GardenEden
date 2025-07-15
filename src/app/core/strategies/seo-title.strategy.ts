// src/app/core/strategies/seo-title.strategy.ts
import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy, ActivatedRouteSnapshot } from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';

// Import der Datenmodelle, die von unseren zukünftigen Resolvers bereitgestellt werden
import { NavItem, NavSubItem } from '../data/navigation.data';
import { WooCommerceProduct } from '../services/woocommerce.service';

@Injectable({ providedIn: 'root' })
export class SeoTitleStrategy extends TitleStrategy {
  private readonly titleService = inject(Title);
  private readonly transloco = inject(TranslocoService);

  constructor() {
    super();
  }

  /**
   * Überschreibt die Standard-Titel-Aktualisierungslogik von Angular.
   * Diese Methode wird bei jeder erfolgreichen Navigation vom Router aufgerufen.
   * @param snapshot Der Zustand der Route zum Zeitpunkt der Navigation.
   */
  override updateTitle(snapshot: RouterStateSnapshot): void {
    // Versucht, einen SEO-optimierten Titel aus den Routendaten zu erstellen.
    const title = this.buildSeoTitle(snapshot); // KORREKTUR: Umbenannte Methode wird aufgerufen

    if (title) {
      // Setzt den erstellten, übersetzten Titel.
      this.titleService.setTitle(title);
    } else {
      // Fallback: Wenn kein spezifischer Titel erstellt werden konnte, wird ein Standardtitel verwendet.
      const defaultTitle = this.transloco.translate('seo.defaultPageTitle');
      this.titleService.setTitle(defaultTitle);
    }
  }

  /**
   * KORREKTUR: Umbenannt, um Konflikt mit der Basisklasse zu vermeiden.
   * Die Kernlogik zur Erstellung des Seitentitels.
   * Sie durchläuft den Routenbaum bis zur tiefsten aktivierten Route und prüft deren Daten.
   * @param snapshot Der Zustand der Route.
   * @returns Der konstruierte Titel als String oder undefined, wenn kein Titel erstellt werden konnte.
   */
  private buildSeoTitle(snapshot: RouterStateSnapshot): string | undefined {
    let route = snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }

    // Greift auf die Daten der tiefsten Route zu. Hier erwarten wir die von den Resolvers bereitgestellten Informationen.
    const routeData = route.data;

    // --- Priorität 1: Produktdetailseite ---
    // Prüft, ob ein 'product'-Objekt vom Resolver bereitgestellt wurde.
    const product: WooCommerceProduct | undefined = routeData['product'];
    if (product) {
      const categoryName = product.categories?.[0]?.name || '';
      // Verwendet einen dedizierten Übersetzungsschlüssel für das SEO-optimierte Titelformat.
      return this.transloco.translate('seo.productPageTitle', {
        productName: product.name,
        categoryName: categoryName,
      });
    }

    // --- Priorität 2: Produktlistenseite (Unterkategorie) ---
    // Prüft, ob ein 'categoryMeta'-Objekt (NavSubItem) vom Resolver bereitgestellt wurde.
    const categoryMeta: NavSubItem | undefined = routeData['categoryMeta'];
    if (categoryMeta) {
      const categoryName = this.transloco.translate(categoryMeta.i18nId);
      return this.transloco.translate('seo.productListTitle', {
        categoryName: categoryName,
      });
    }

    // --- Priorität 3: Kategorie-Übersichtsseite (Hauptkategorie) ---
    // Prüft, ob ein 'mainCategoryMeta'-Objekt (NavItem) vom Resolver bereitgestellt wurde.
    const mainCategoryMeta: NavItem | undefined = routeData['mainCategoryMeta'];
    if (mainCategoryMeta) {
      const categoryName = this.transloco.translate(mainCategoryMeta.i18nId);
      return this.transloco.translate('seo.categoryOverviewTitle', {
        categoryName: categoryName,
      });
    }

    // --- Priorität 4: Fallback für alle anderen Seiten (Statische Seiten, Home, etc.) ---
    // Prüft auf den existierenden 'titleKey', um Abwärtskompatibilität zu gewährleisten.
    const titleKey = routeData['titleKey'];
    if (titleKey) {
      return this.transloco.translate(titleKey);
    }

    // Sollte kein Titel gefunden werden, wird undefined zurückgegeben, was zum Fallback im `updateTitle` führt.
    return undefined;
  }
}