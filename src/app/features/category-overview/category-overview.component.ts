// /src/app/features/category-overview/category-overview.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  WritableSignal,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject, // DestroyRef hier nicht direkt verwendet, aber gut für takeUntilDestroyed
  DestroyRef
} from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Subscription, forkJoin, of, Observable } from 'rxjs';
import {
  map,
  catchError,
  switchMap,
  take,
  tap,
  finalize,
} from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'; // Import für takeUntilDestroyed

// Daten und Typen
import {
  navItems,
  NavSubItem,
  NavItem,
} from '../../core/data/navigation.data';
import {
  WoocommerceService,
  WooCommerceProduct,
  WooCommerceProductsResponse,
  WooCommerceMetaData, // Importiert, aber in dieser Datei nicht direkt verwendet
} from '../../core/services/woocommerce.service';

// Komponenten
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';

// Transloco
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';

@Component({
  selector: 'app-category-overview',
  standalone: true,
  imports: [CommonModule, RouterModule, ProductCardComponent, TranslocoModule],
  templateUrl: './category-overview.component.html',
  styleUrl: './category-overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryOverviewComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private titleService = inject(Title);
  private woocommerceService = inject(WoocommerceService);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef); // DestroyRef für takeUntilDestroyed injizieren

  // subscriptions wird beibehalten, falls es noch Subscriptions gibt, die nicht mit takeUntilDestroyed verwaltet werden können
  // Für die routeSub und langSub wäre takeUntilDestroyed aber besser.
  private subscriptions = new Subscription(); 

  currentParentCategory: WritableSignal<NavItem | null> = signal(null);
  categoryTitle: WritableSignal<string | null> = signal(null);
  subCategoriesToDisplay: WritableSignal<NavSubItem[]> = signal([]);
  error: WritableSignal<string | null> = signal(null);

  productPreview: WritableSignal<WooCommerceProduct[]> = signal([]);
  isLoadingPreview: WritableSignal<boolean> = signal(false);
  previewError: WritableSignal<string | null> = signal(null);

  
  private readonly TARGET_PREVIEW_COUNT = 100;
  private readonly FETCH_PRODUCTS_PER_SUBCATEGORY = 5;

  ngOnInit(): void {
    // Verwendung von takeUntilDestroyed für routeSub
    this.route.paramMap
      .pipe(
        takeUntilDestroyed(this.destroyRef), // Automatische Abmeldung
        map(params => params.get('slug')),
        tap(() => this.resetState()),
        switchMap(slug => {
          if (!slug) {
            this.handleCategoryNotFound(
              this.translocoService.translate(
                'categoryOverview.errorNoParentSlug'
              )
            );
            return of(null);
          }
          const expectedLink = `/category/${slug}`;
          const foundParentCategory = navItems.find(
            item => item.link === expectedLink
          );

          if (foundParentCategory) {
            this.currentParentCategory.set(foundParentCategory);
            this.subCategoriesToDisplay.set(foundParentCategory.subItems || []);
            this.updateTitles(foundParentCategory);

            if (foundParentCategory.subItems && foundParentCategory.subItems.length > 0) {
              this.loadProductPreviewForParent(foundParentCategory.subItems);
            } else {
              this.productPreview.set([]);
            }
            return of(foundParentCategory); // of(null) hier nicht nötig, da switchMap das Ergebnis weitergibt
          } else {
            this.handleCategoryNotFound(
              this.translocoService.translate(
                'categoryOverview.notFoundError',
                { categorySlug: slug }
              )
            );
            return of(null); // Wichtig, um den Stream hier abzuschließen oder einen Nullwert weiterzugeben
          }
        }),
        catchError(err => {
          console.error('Error in CategoryOverview OnInit route subscription:', err);
          this.handleCategoryNotFound(
            this.translocoService.translate('categoryOverview.genericError')
          );
          return of(null); // Fehler behandeln und Observable abschließen
        })
      )
      .subscribe(foundParentCategory => {
        // Optionale Logik hier, wenn foundParentCategory nicht null ist.
        // Da die Hauptlogik im switchMap passiert, ist hier oft nichts weiter nötig.
      });
    // this.subscriptions.add(routeSub); // Nicht mehr nötig, wenn takeUntilDestroyed verwendet wird

    // Verwendung von takeUntilDestroyed für langSub
    this.translocoService.langChanges$.pipe(
      takeUntilDestroyed(this.destroyRef) // Automatische Abmeldung
    ).subscribe(() => {
      const cat = this.currentParentCategory();
      if (cat) {
        this.updateTitles(cat);
      }
      // Fehlertexte nur aktualisieren, wenn ein Fehler-Key gesetzt ist
      const currentErrorKey = this.error();
      if (currentErrorKey && currentErrorKey === this.translocoService.translate('categoryOverview.genericError')) { // Prüfen ob es der generische Fehler war
         this.error.set(this.translocoService.translate('categoryOverview.genericError'));
      }
      const currentPreviewErrorKey = this.previewError();
      if (currentPreviewErrorKey && currentPreviewErrorKey === this.translocoService.translate('categoryOverview.previewLoadError')) {
         this.previewError.set(this.translocoService.translate('categoryOverview.previewLoadError'));
      }
      this.cdr.markForCheck();
    });
    // this.subscriptions.add(langSub); // Nicht mehr nötig
  }

  private updateTitles(parentCategory: NavItem): void {
    const translatedTitle = this.translocoService.translate(parentCategory.i18nId);
    this.categoryTitle.set(translatedTitle);
    this.titleService.setTitle(`${translatedTitle} - Your Garden Eden`);
  }

  ngOnDestroy(): void {
    // this.subscriptions.unsubscribe(); // Nicht mehr nötig, da takeUntilDestroyed verwendet wird
    // Wenn es noch andere manuelle Subscriptions gäbe, müssten sie hier oder über takeUntilDestroyed verwaltet werden.
  }

  private resetState(): void {
    this.currentParentCategory.set(null);
    this.categoryTitle.set(null);
    this.subCategoriesToDisplay.set([]);
    this.error.set(null);
    this.productPreview.set([]);
    this.isLoadingPreview.set(false);
    this.previewError.set(null);
    this.cdr.detectChanges(); // Hier kann detectChanges sinnvoll sein, um die UI sofort zu aktualisieren
  }

  private handleCategoryNotFound(errorMessage: string): void {
    this.error.set(errorMessage);
    this.titleService.setTitle(
      `${this.translocoService.translate(
        'categoryOverview.notFoundTitle'
      )} - Your Garden Eden`
    );
    this.currentParentCategory.set(null);
    this.categoryTitle.set(null);
    this.subCategoriesToDisplay.set([]);
    this.productPreview.set([]);
    this.isLoadingPreview.set(false);
    this.previewError.set(null);
    this.cdr.detectChanges(); // Auch hier kann detectChanges sinnvoll sein
  }

  getIconPath(filename: string | undefined): string | null {
    return filename ? `assets/icons/categories/${filename}` : null;
  }

  private loadProductPreviewForParent(subItems: NavSubItem[]): void {
    if (subItems.length === 0) {
      this.productPreview.set([]);
      return;
    }

    this.isLoadingPreview.set(true);
    this.previewError.set(null);
    this.productPreview.set([]);

    const subCategorySlugs = subItems
      .map(sub => sub.link.split('/').pop()) // Extrahiert den letzten Teil des Links als Slug
      .filter((slug): slug is string => !!slug); // Stellt sicher, dass nur gültige Strings weitergegeben werden

    if (subCategorySlugs.length === 0) {
      this.isLoadingPreview.set(false);
      // this.cdr.detectChanges(); // Nicht unbedingt hier nötig, da isLoadingPreview das Template triggert
      return;
    }

    // Observables, um Kategorie-IDs für jeden Slug zu holen
    const categoryObservables: Observable<number | undefined>[] = subCategorySlugs.map(slug =>
      this.woocommerceService.getCategoryBySlug(slug).pipe(
        map(wcCategory => wcCategory?.id), // Nur die ID extrahieren
        catchError(() => {
          console.warn(`Kategorie mit Slug "${slug}" nicht gefunden oder Fehler beim Abrufen.`);
          return of(undefined); // Bei Fehler undefined zurückgeben, damit forkJoin nicht abbricht
        })
      )
    );

    // forkJoin ausführen, wenn categoryObservables nicht leer ist
    if (categoryObservables.length > 0) {
      forkJoin(categoryObservables).pipe(
        takeUntilDestroyed(this.destroyRef), // Automatische Abmeldung
        switchMap((categoryIds: (number | undefined)[]) => {
          const validCategoryIds = categoryIds.filter((id): id is number => id !== undefined);
          if (validCategoryIds.length === 0) {
            console.log('Keine gültigen WooCommerce Kategorie-IDs für Produktvorschau gefunden.');
            return of([] as WooCommerceProductsResponse[]); // Leeres Array von Responses zurückgeben
          }

          const productObservables: Observable<WooCommerceProductsResponse>[] = validCategoryIds.map(catId =>
            this.woocommerceService.getProducts(catId, this.FETCH_PRODUCTS_PER_SUBCATEGORY, 1).pipe(
              catchError(err => {
                console.error(`Fehler beim Laden von Produkten für Kategorie-ID ${catId}:`, err);
                return of({ products: [], totalPages: 0, totalCount: 0 } as WooCommerceProductsResponse); // Leere Response bei Fehler
              })
            )
          );
          return productObservables.length > 0 ? forkJoin(productObservables) : of([] as WooCommerceProductsResponse[]);
        }),
        map((responsesArray: WooCommerceProductsResponse[]) => {
          const allFetchedProducts: WooCommerceProduct[] = [];
          const uniqueProductIds = new Set<string | number>();
          responsesArray.forEach(response => { // response kann hier WooCommerceProductsResponse sein
            if (response && response.products) {
              response.products.forEach(p => {
                if (p && !uniqueProductIds.has(p.id)) { // Zusätzliche Prüfung für p
                  allFetchedProducts.push(p);
                  uniqueProductIds.add(p.id);
                }
              });
            }
          });
          return allFetchedProducts;
        }),
        // take(1) ist nicht mehr nötig, da takeUntilDestroyed den Stream bei Zerstörung beendet.
        // Wenn du nur den ersten Emissionswert von forkJoin willst, kannst du es aber drin lassen.
        // Für Produktvorschau ist es meistens nur eine Emission.
        catchError((err: any) => {
          console.error('Fehler beim Laden der Produktvorschau (im äußeren catchError):', err);
          this.previewError.set(this.translocoService.translate('categoryOverview.previewLoadError'));
          return of([] as WooCommerceProduct[]); // Leeres Array bei Fehler
        }),
        finalize(() => {
          this.isLoadingPreview.set(false);
          this.cdr.markForCheck(); // Sicherstellen, dass UI nach dem Laden aktualisiert wird
        })
      ).subscribe({
        next: (allProducts: WooCommerceProduct[]) => {
          if (allProducts.length > 0) {
            const shuffledProducts = this.shuffleArray(allProducts);
            this.productPreview.set(shuffledProducts.slice(0, this.TARGET_PREVIEW_COUNT));
          } else {
            this.productPreview.set([]);
            console.log('Keine Produkte für Vorschau gefunden nach API-Abfragen.');
          }
        },
        // error-Callback ist hier nicht mehr zwingend nötig, da catchError in der Pipe den Fehler abfängt
        // und ein leeres Array zurückgibt. Der finalize Block wird immer ausgeführt.
      });
      // previewSub muss nicht mehr zu this.subscriptions hinzugefügt werden, wenn takeUntilDestroyed verwendet wird.
    } else {
        this.isLoadingPreview.set(false); // Falls keine categoryObservables erstellt wurden
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

  getProductLink(product: WooCommerceProduct): string {
    return `/product/${product.slug}`; // Annahme: product.slug ist vorhanden und korrekt
  }

  getProductImage(product: WooCommerceProduct): string | undefined {
    return product.images && product.images.length > 0
      ? product.images[0].src
      : undefined;
  }

  extractPriceRange(product: WooCommerceProduct): { min: string, max: string } | null {
    if (product.type === 'variable') {
      if (product.price_html) {
        const rangeMatch = product.price_html.match(/([\d.,]+)[^\d.,<]*?(?:–|-)[^\d.,<]*?([\d.,]+)/);
        if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
          return { min: rangeMatch[1].replace(',', '.'), max: rangeMatch[2].replace(',', '.') };
        }
        const singlePriceMatch = product.price_html.match(/([\d.,]+)/);
        if (singlePriceMatch && singlePriceMatch[1]) {
          const priceVal = singlePriceMatch[1].replace(',', '.');
          return { min: priceVal, max: priceVal };
        }
      }
      // Fallback auf product.price, wenn price_html keine Spanne oder Einzelpreis liefert
      // oder wenn es ein variabler Preis ist, der aber als einzelner Wert in product.price steht
      if (product.price) { 
        return { min: product.price, max: product.price };
      }
    }
    return null; // Für einfache Produkte oder wenn keine Preisspanne extrahiert werden kann
  }

  getProductCurrencySymbol(product: WooCommerceProduct): string {
    // Versuch, das Symbol aus den Metadaten zu lesen (falls von einem Plugin gesetzt)
    const currencyMeta = product.meta_data?.find(m => m.key === '_currency_symbol');
    if (currencyMeta?.value) return currencyMeta.value as string;
    
    // Fallback: Extraktion aus price_html (kann unzuverlässig sein)
    if (product.price_html) {
      if (product.price_html.includes('€')) return '€';
      if (product.price_html.includes('$')) return '$';
      // Weitere Währungen hier hinzufügen, falls nötig
    }
    return '€'; // Standard-Fallback-Währungssymbol
  }
}