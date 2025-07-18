// src/app/core/services/seo.service.ts
import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta } from '@angular/platform-browser';

/**
 * Definiert die Struktur für Daten, die zur Erstellung von
 * Social-Media-Vorschaukarten (Open Graph, Twitter Cards) benötigt werden.
 */
export interface SocialTags {
  title: string;
  description: string;
  imageUrl: string;
  pageUrl:string;
  type?: 'website' | 'article' | 'product';
  siteName?: string;
  twitterHandle?: string; // z.B. '@YourGardenEden'
}

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);

  /**
   * Aktualisiert den Canonical-Link-Tag im <head> des Dokuments.
   * @param url Die vollständige, absolute URL für den Canonical-Tag.
   */
  public updateCanonicalUrl(url: string): void {
    let link: HTMLLinkElement | null = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  /**
   * Setzt oder aktualisiert alle relevanten Open Graph und Twitter Card Meta-Tags.
   * @param tags Ein Objekt mit allen notwendigen Informationen.
   */
  public setSocialMediaTags(tags: SocialTags): void {
    const defaultSiteName = 'Your Garden Eden';
    const defaultType = 'website';

    // Open Graph Tags (für Facebook, WhatsApp, Instagram, LinkedIn, etc.)
    this.meta.updateTag({ property: 'og:title', content: tags.title });
    this.meta.updateTag({ property: 'og:description', content: tags.description });
    this.meta.updateTag({ property: 'og:url', content: tags.pageUrl });
    this.meta.updateTag({ property: 'og:image', content: tags.imageUrl });
    this.meta.updateTag({ property: 'og:type', content: tags.type || defaultType });
    this.meta.updateTag({ property: 'og:site_name', content: tags.siteName || defaultSiteName });

    // Twitter Card Tags (für eine optimierte Darstellung auf Twitter)
    // KORREKTUR: Geändert zu 'summary' für eine bessere Darstellung quadratischer Bilder.
    this.meta.updateTag({ name: 'twitter:card', content: 'summary' });
    this.meta.updateTag({ name: 'twitter:title', content: tags.title });
    this.meta.updateTag({ name: 'twitter:description', content: tags.description });
    this.meta.updateTag({ name: 'twitter:image', content: tags.imageUrl });

    if (tags.twitterHandle) {
      this.meta.updateTag({ name: 'twitter:site', content: tags.twitterHandle });
    }
  }

  /**
   * Entfernt alle Social Media Tags. Nützlich für den sauberen Zustandswechsel
   * zwischen Seiten, die unterschiedliche Tags benötigen.
   */
  public removeSocialMediaTags(): void {
    // Open Graph
    this.meta.removeTag('property="og:title"');
    this.meta.removeTag('property="og:description"');
    this.meta.removeTag('property="og:url"');
    this.meta.removeTag('property="og:image"');
    this.meta.removeTag('property="og:type"');
    this.meta.removeTag('property="og:site_name"');
    // Twitter
    this.meta.removeTag('name="twitter:card"');
    this.meta.removeTag('name="twitter:title"');
    this.meta.removeTag('name="twitter:description"');
    this.meta.removeTag('name="twitter:image"');
    this.meta.removeTag('name="twitter:site"');
  }

  /**
   * Generiert einen SEO-optimierten und barrierefreien Alternativtext für ein Bild.
   * Folgt dem Schema "Produktname - Kategorie - Your Garden Eden".
   * Bietet einen Fallback, falls keine Kategorie angegeben wird.
   * @param productName Der Name des Produkts.
   * @param categoryName Der Name der Hauptkategorie des Produkts (optional).
   * @returns Einen fertigen String für das alt-Attribut.
   */
  public generateImageAltText(productName?: string, categoryName?: string): string {
    const siteName = 'Your Garden Eden';
    if (!productName) {
      return siteName; // Fallback, falls kein Produktname vorhanden ist
    }

    if (categoryName && categoryName.trim() !== '') {
      return `${productName} - ${categoryName} - ${siteName}`;
    }

    return `${productName} - ${siteName}`;
  }
}