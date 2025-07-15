// src/app/core/strategies/seo-title.strategy.ts
import { Injectable, inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';

import { NavItem, NavSubItem } from '../data/navigation.data';
import { WooCommerceProduct } from '../services/woocommerce.service';
import { SeoService, SocialTags } from '../services/seo.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SeoTitleStrategy extends TitleStrategy {
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);
  private readonly transloco = inject(TranslocoService);
  private readonly seoService = inject(SeoService);

  constructor() {
    super();
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    // 1. Generiere Canonical URL
    const cleanUrlPath = snapshot.url.split('?')[0];
    const canonicalUrl = `${environment.baseUrl}${cleanUrlPath}`;
    this.seoService.updateCanonicalUrl(canonicalUrl);

    // 2. FINALE KORREKTUR: Explizite Typsicherheit
    // Deklariere die Variable, die garantiert ein String sein wird.
    let finalTitle: string; 
    
    // Hole den potenziell undefinierten Titel.
    const customTitle = this.buildSeoTitle(snapshot);

    // Prüfe explizit, ob ein Titel generiert wurde.
    if (customTitle) {
      // Wenn ja, ist er hier garantiert ein String.
      finalTitle = customTitle;
    } else {
      // Wenn nein, weise den Fallback-String zu.
      finalTitle = this.transloco.translate('seo.defaultPageTitle');
    }

    // Ab hier ist 'finalTitle' garantiert ein String. Der Fehler ist behoben.
    this.titleService.setTitle(finalTitle);
    this.updateSocialMediaTags(snapshot, finalTitle, canonicalUrl);
  }
  
  private updateSocialMediaTags(snapshot: RouterStateSnapshot, pageTitle: string, pageUrl: string): void {
    let route = snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    
    const product: WooCommerceProduct | undefined = route.data['product'];
    const defaultDescription = this.transloco.translate('general.defaultMetaDescription');
    const defaultImageUrl = `${environment.baseUrl}/assets/icons/Logo.png`;

    let socialTags: SocialTags;

    if (product) {
      const description = this._stripHtml(product.short_description || product.description || defaultDescription).substring(0, 155);
      const imageUrl = product.images?.[0]?.src || defaultImageUrl;
      socialTags = {
        title: pageTitle,
        description: description,
        imageUrl: imageUrl,
        pageUrl: pageUrl,
        type: 'product',
        twitterHandle: '@YourGardenEden'
      };
    } else {
      const metaDescriptionTag = this.metaService.getTag('name=description');
      const description = metaDescriptionTag?.content || defaultDescription;
      socialTags = {
        title: pageTitle,
        description: description,
        imageUrl: defaultImageUrl,
        pageUrl: pageUrl,
        type: 'website',
        twitterHandle: '@YourGardenEden'
      };
    }
    this.seoService.setSocialMediaTags(socialTags);
  }

  private _stripHtml(html: string): string {
    if (!html) return '';
    return html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
  }
  
  private buildSeoTitle(snapshot: RouterStateSnapshot): string | undefined {
    let route = snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }

    const routeData = route.data;
    const product: WooCommerceProduct | undefined = routeData['product'];
    if (product) {
      const categoryName = product.categories?.[0]?.name || '';
      return this.transloco.translate('seo.productPageTitle', {
        productName: product.name,
        categoryName: categoryName,
      });
    }

    const categoryMeta: NavSubItem | undefined = routeData['categoryMeta'];
    if (categoryMeta) {
      const categoryName = this.transloco.translate(categoryMeta.i18nId);
      return this.transloco.translate('seo.productListTitle', {
        categoryName: categoryName,
      });
    }

    const mainCategoryMeta: NavItem | undefined = routeData['mainCategoryMeta'];
    if (mainCategoryMeta) {
      const categoryName = this.transloco.translate(mainCategoryMeta.i18nId);
      return this.transloco.translate('seo.categoryOverviewTitle', {
        categoryName: categoryName,
      });
    }

    const titleKey = routeData['titleKey'];
    if (titleKey) {
      return this.transloco.translate(titleKey);
    }

    return undefined;
  }
}