import { Injectable, Renderer2, RendererFactory2, Inject, OnDestroy, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformServer } from '@angular/common';

// Definiert eine generische Struktur für Schema.org-Typen.
export interface Schema {
  '@context': 'https://schema.org';
  '@type': string;
  [key: string]: any;
}

/**
 * Service zur Verwaltung und Injektion von JSON-LD-Strukturierten Daten in den <head> der Anwendung.
 * Ist als Singleton konzipiert ('providedIn: "root"'), um eine zentrale Kontrolle zu gewährleisten.
 * Dieser Service kann mehrere Schemata gleichzeitig verwalten und gibt sie als Array in einem
 * einzigen <script>-Tag aus, was der Google Best Practice entspricht.
 */
@Injectable({
  providedIn: 'root',
})
export class JsonLdService implements OnDestroy {
  private readonly head: HTMLElement;
  private scriptElement: HTMLScriptElement | null = null;
  private schemas: Map<string, Schema> = new Map();
  private renderer: Renderer2;

  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    private readonly rendererFactory: RendererFactory2,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {
    this.head = this.document.head;
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  public setSchema(key: string, schema: Schema): void {
    this.schemas.set(key, schema);
    this._updateScript();
  }

  public removeSchema(key: string): void {
    if (this.schemas.has(key)) {
      this.schemas.delete(key);
      this._updateScript();
    }
  }
  
  private _updateScript(): void {
    // Altes Skript entfernen, falls vorhanden.
    if (this.scriptElement) {
      this.renderer.removeChild(this.head, this.scriptElement);
      this.scriptElement = null;
    }

    if (this.schemas.size === 0) {
      return;
    }

    const schemaArray = Array.from(this.schemas.values());
    const scriptContent = JSON.stringify(schemaArray.length > 1 ? schemaArray : schemaArray[0], null, 2);

    if (isPlatformServer(this.platformId)) {
      // Auf dem Server: Direkte DOM-Manipulation ist sicher und oft zuverlässiger.
      const script = this.document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = scriptContent;
      this.document.head.appendChild(script);
      this.scriptElement = script;
    } else {
      // Auf dem Client: Renderer2 ist der bevorzugte Weg.
      const script = this.renderer.createElement('script');
      script.type = 'application/ld+json';
      script.text = scriptContent;
      this.renderer.appendChild(this.head, script);
      this.scriptElement = script;
    }
  }

  ngOnDestroy(): void {
    if (this.scriptElement && this.scriptElement.parentNode) {
      this.renderer.removeChild(this.head, this.scriptElement);
    }
    this.schemas.clear();
  }
}