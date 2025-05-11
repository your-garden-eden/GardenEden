// /src/app/features/category-overview/category-overview.component.ts
import { Component, OnInit, OnDestroy, inject, signal, WritableSignal, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core'; // ChangeDetectorRef hinzugefügt
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

// Daten und Typen
import { navItems, NavSubItem, NavItem } from '../../core/data/navigation.data'; // NavItem importiert
import { ShopifyService, Product } from '../../core/services/shopify.service';

// Komponenten
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';

// Transloco
import { TranslocoModule, TranslocoService } from '@ngneat/transloco'; // Transloco importiert

@Component({
  selector: 'app-category-overview',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ProductCardComponent,
    TranslocoModule // TranslocoModule hinzugefügt
  ],
  templateUrl: './category-overview.component.html',
  styleUrl: './category-overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CategoryOverviewComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private titleService = inject(Title);
  private shopifyService = inject(ShopifyService);
  private translocoService = inject(TranslocoService); // TranslocoService injiziert
  private cdr = inject(ChangeDetectorRef); // ChangeDetectorRef injiziert
  private routeSubscription: Subscription | undefined;
  private langChangeSubscription: Subscription | undefined; // Für Sprachwechsel

  currentCategory: WritableSignal<NavItem | null> = signal(null); // Ganze Kategorie speichern
  categoryTitle: WritableSignal<string | null> = signal(null);
  subCategories: WritableSignal<NavSubItem[]> = signal([]);
  error: WritableSignal<string | null> = signal(null); // Wird im Template genutzt, ggf. übersetzen

  productPreview: WritableSignal<Product[]> = signal([]);
  isLoadingPreview: WritableSignal<boolean> = signal(false);
  previewError: WritableSignal<string | null> = signal(null); // Wird im Template genutzt, ggf. übersetzen

  private readonly TARGET_PREVIEW_COUNT = 32;
  private readonly FETCH_PRODUCTS_PER_SUBCATEGORY = 4;
  private readonly FETCH_BUFFER = 60;

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.pipe(
      map(params => params.get('slug'))
    ).subscribe(slug => {
      this.resetState();
      if (!slug) {
        this.handleCategoryNotFound('Kein Kategorie-Slug angegeben.'); // Interner Fehler
        return;
      }
      this.loadCategoryDataBySlug(slug);
    });

    // Auf Sprachänderungen hören, um Titel neu zu setzen
    this.langChangeSubscription = this.translocoService.langChanges$.subscribe(() => {
      const cat = this.currentCategory();
      if (cat && cat.i18nId) {
        const translatedTitle = this.translocoService.translate(cat.i18nId);
        this.categoryTitle.set(translatedTitle);
        this.titleService.setTitle(`${translatedTitle} - Your Garden Eden`);
        // Subkategorien müssen nicht neu übersetzt werden, da die Pipe das im Template macht
        this.cdr.detectChanges(); // UI aktualisieren
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.langChangeSubscription?.unsubscribe();
  }

  // Umbenannt, um Verwechslung mit der alten Methode zu vermeiden
  private loadCategoryDataBySlug(slug: string): void {
    const expectedLink = `/category/${slug}`;
    const foundCategory = navItems.find(item => item.link === expectedLink);

    if (foundCategory) {
      this.currentCategory.set(foundCategory); // Komplette Kategorie speichern
      const translatedTitle = this.translocoService.translate(foundCategory.i18nId); // Übersetzten Titel holen
      this.categoryTitle.set(translatedTitle);

      const subs = foundCategory.subItems || [];
      this.subCategories.set(subs);
      this.error.set(null);
      this.titleService.setTitle(`${translatedTitle} - Your Garden Eden`);
      console.log(`Kategorie gefunden: ${translatedTitle}`, subs);

      if (subs.length > 0) {
        this.loadProductPreview(subs);
      } else {
        this.productPreview.set([]);
      }
    } else {
      this.handleCategoryNotFound(`Kategorie "${slug}" nicht gefunden.`); // Interner Fehler
    }
  }

   private resetState(): void {
     this.currentCategory.set(null);
     this.categoryTitle.set(null);
     this.subCategories.set([]);
     this.error.set(null);
     this.productPreview.set([]);
     this.isLoadingPreview.set(false);
     this.previewError.set(null);
  }

  private handleCategoryNotFound(internalErrorMessage: string): void {
    console.error(internalErrorMessage);
    // Übersetzbare Fehlermeldung für den Benutzer
    const userErrorMessage = this.translocoService.translate('categoryOverview.notFoundError');
    this.error.set(userErrorMessage);
    this.titleService.setTitle(`${this.translocoService.translate('categoryOverview.notFoundTitle')} - Your Garden Eden`);
    this.resetState(); // resetState sollte NACH dem Setzen der Fehlermeldung erfolgen
    this.categoryTitle.set(null); // Sicherstellen, dass Titel auch null ist
    this.subCategories.set([]); // Sicherstellen, dass subCategories auch leer ist
  }

  getIconPath(filename: string | undefined): string | null {
    return filename ? `assets/icons/categories/${filename}` : null;
  }

  private async loadProductPreview(subItems: NavSubItem[]): Promise<void> {
    this.isLoadingPreview.set(true);
    this.previewError.set(null);
    this.productPreview.set([]);
    const allFetchedProducts: Product[] = [];
    const uniqueProductIds = new Set<string>();
    const subCategoryHandles = subItems.map(sub => sub.link.split('/').pop()).filter(Boolean) as string[];

    if (subCategoryHandles.length === 0) {
        this.isLoadingPreview.set(false);
        return;
    }

    console.log('Lade Produktvorschau (Shuffle-Modus) für Handles:', subCategoryHandles);

    try {
      for (const handle of subCategoryHandles) {
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
        const shuffledProducts = this.shuffleArray(allFetchedProducts);
        const preview = shuffledProducts.slice(0, this.TARGET_PREVIEW_COUNT);
        this.productPreview.set(preview);
        console.log('Zufällige Produktvorschau gesetzt:', preview.map(p => p.title));
      } else {
         this.productPreview.set([]);
         console.log('Keine Produkte für Vorschau gefunden.');
      }

    } catch (error) {
      console.error('Fehler beim Laden der Produktvorschau:', error);
      // Übersetzbare Fehlermeldung
      this.previewError.set(this.translocoService.translate('categoryOverview.previewLoadError'));
    } finally {
      this.isLoadingPreview.set(false);
    }
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  trackPreviewProductById(index: number, product: Product): string {
    return product.id;
  }
}