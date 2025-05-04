// /src/app/features/category-overview/category-overview.component.ts
// Imports anpassen: computed, Signal entfernt
import { Component, OnInit, OnDestroy, inject, signal, WritableSignal, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Subscription, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

// Daten und Typen
import { navItems, NavSubItem } from '../../core/data/navigation.data';
import { ShopifyService, Product } from '../../core/services/shopify.service';

// Komponenten
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';

// Interface für gruppierte Produkte wird NICHT MEHR BENÖTIGT

@Component({
  selector: 'app-category-overview',
  standalone: true,
  imports: [CommonModule, RouterModule, ProductCardComponent],
  templateUrl: './category-overview.component.html',
  styleUrl: './category-overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CategoryOverviewComponent implements OnInit, OnDestroy {
  // Services und Signale für Kategorie-Info bleiben
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private titleService = inject(Title);
  private shopifyService = inject(ShopifyService);
  private routeSubscription: Subscription | undefined;

  categoryTitle: WritableSignal<string | null> = signal(null);
  subCategories: WritableSignal<NavSubItem[]> = signal([]);
  error: WritableSignal<string | null> = signal(null);

  // --- ZURÜCK ZU: Zustand für EINE Liste von Vorschau-Produkten ---
  productPreview: WritableSignal<Product[]> = signal([]); // Wieder productPreview
  isLoadingPreview: WritableSignal<boolean> = signal(false);
  previewError: WritableSignal<string | null> = signal(null);

  // --- ZURÜCK ZU: Konstanten für die Shuffle-Logik ---
  private readonly TARGET_PREVIEW_COUNT = 32;
  private readonly FETCH_PRODUCTS_PER_SUBCATEGORY = 4; // Wie viele pro Unterkat. holen?
  private readonly FETCH_BUFFER = 60; // Wie viele mind. sammeln für Shuffle?

  // Computed Signal wird NICHT MEHR BENÖTIGT

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.pipe(
      map(params => params.get('slug'))
    ).subscribe(slug => {
      this.resetState(); // Zustand zurücksetzen
      if (!slug) {
        this.handleCategoryNotFound('Kein Kategorie-Slug angegeben.');
        return;
      }
      this.loadCategoryData(slug);
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
  }

  private loadCategoryData(slug: string): void {
    const expectedLink = `/category/${slug}`;
    const currentCategory = navItems.find(item => item.link === expectedLink);

    if (currentCategory) {
      const title = currentCategory.label;
      this.categoryTitle.set(title);
      const subs = currentCategory.subItems || [];
      this.subCategories.set(subs);
      this.error.set(null);
      this.titleService.setTitle(`${title} - Your Garden Eden`);
      console.log(`Kategorie gefunden: ${title}`, subs);

      if (subs.length > 0) {
        this.loadProductPreview(subs); // Methode für Shuffle-Logik aufrufen
      } else {
        this.productPreview.set([]);
      }
    } else {
      this.handleCategoryNotFound(`Kategorie "${slug}" nicht gefunden.`);
    }
  }

   private resetState(): void {
     this.categoryTitle.set(null);
     this.subCategories.set([]);
     this.error.set(null);
     this.productPreview.set([]); // productPreview zurücksetzen
     this.isLoadingPreview.set(false);
     this.previewError.set(null);
  }

  private handleCategoryNotFound(errorMessage: string): void {
    console.error(errorMessage);
    this.error.set('Die gesuchte Kategorie konnte nicht gefunden werden.');
    this.titleService.setTitle('Kategorie nicht gefunden - Your Garden Eden');
    this.resetState();
  }

  getIconPath(filename: string | undefined): string | null {
    return filename ? `assets/icons/categories/${filename}` : null;
  }

  // --- ZURÜCK ZU: Methode zum Laden und Shuffeln der Produkte ---
  private async loadProductPreview(subItems: NavSubItem[]): Promise<void> {
    this.isLoadingPreview.set(true);
    this.previewError.set(null);
    this.productPreview.set([]); // Vorschau zurücksetzen
    const allFetchedProducts: Product[] = [];
    const uniqueProductIds = new Set<string>(); // Zum Vermeiden von Duplikaten
    const subCategoryHandles = subItems.map(sub => sub.link.split('/').pop()).filter(Boolean) as string[];

    if (subCategoryHandles.length === 0) {
        this.isLoadingPreview.set(false);
        return; // Nichts zu laden
    }

    console.log('Lade Produktvorschau (Shuffle-Modus) für Handles:', subCategoryHandles);

    try {
      for (const handle of subCategoryHandles) {
        // Breche ab, wenn genug Produkte für den Puffer gesammelt wurden
        if (allFetchedProducts.length >= this.FETCH_BUFFER) {
          console.log(`Genug Produkte (${allFetchedProducts.length}) für Vorschau-Puffer gesammelt.`);
          break;
        }
        console.log(`Versuche, ${this.FETCH_PRODUCTS_PER_SUBCATEGORY} Produkte für ${handle} zu laden...`);
        const result = await this.shopifyService.getProductsByCollectionHandle(handle, this.FETCH_PRODUCTS_PER_SUBCATEGORY).catch(err => {
            console.error(`Fehler beim Laden von Produkten für Handle ${handle}:`, err);
            return null;
        });

        if (result?.products?.edges) {
          const productsToAdd = result.products.edges.map(edge => edge.node);
          console.log(`  -> ${productsToAdd.length} Produkte von ${handle} erhalten.`);
          // Füge nur Produkte hinzu, die noch nicht in der Liste sind
          productsToAdd.forEach(p => {
              if (!uniqueProductIds.has(p.id)) {
                  allFetchedProducts.push(p);
                  uniqueProductIds.add(p.id);
              }
          });
        } else {
             console.log(`  -> Keine Produkte für ${handle} erhalten oder Fehler.`);
        }
      }

      console.log(`Insgesamt ${allFetchedProducts.length} eindeutige Produkte gesammelt.`);

      if (allFetchedProducts.length > 0) {
        // Produkte shuffeln
        const shuffledProducts = this.shuffleArray(allFetchedProducts);
        // Die gewünschte Anzahl auswählen
        const preview = shuffledProducts.slice(0, this.TARGET_PREVIEW_COUNT);
        this.productPreview.set(preview); // Ergebnis in productPreview speichern
        console.log('Zufällige Produktvorschau gesetzt:', preview.map(p => p.title));
      } else {
         this.productPreview.set([]); // Keine Produkte gefunden
         console.log('Keine Produkte für Vorschau gefunden.');
      }

    } catch (error) {
      console.error('Fehler beim Laden der Produktvorschau:', error);
      this.previewError.set('Produkte für die Vorschau konnten nicht geladen werden.');
    } finally {
      this.isLoadingPreview.set(false);
    }
  }

  // --- Methode zum Mischen eines Arrays (Fisher-Yates) - Bleibt gleich ---
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]; // Kopie erstellen, um Original nicht zu ändern
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // Elemente tauschen
    }
    return shuffled;
  }

  // --- trackBy Funktion für die Produkt-Schleife - Bleibt gleich ---
  trackPreviewProductById(index: number, product: Product): string {
    return product.id;
  }

  // trackGroupByHandle wird NICHT MEHR BENÖTIGT
}