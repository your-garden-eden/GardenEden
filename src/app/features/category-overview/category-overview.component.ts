// /src/app/features/category-overview/category-overview.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  WritableSignal,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  DestroyRef,
  PLATFORM_ID
} from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  navItems,
  NavSubItem,
  NavItem,
} from '../../core/data/navigation.data';
import {
  WoocommerceService,
  WooCommerceProduct,
  WooCommerceProductsResponse,
  WooCommerceMetaData, // Nicht direkt verwendet, aber Teil des Imports
} from '../../core/services/woocommerce.service';

import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';
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
  private destroyRef = inject(DestroyRef);
  private platformId = inject(PLATFORM_ID);

  currentParentCategory: WritableSignal<NavItem | null> = signal(null);
  categoryTitle: WritableSignal<string | null> = signal(null);
  subCategoriesToDisplay: WritableSignal<NavSubItem[]> = signal([]);
  error: WritableSignal<string | null> = signal(null);

  productPreview: WritableSignal<WooCommerceProduct[]> = signal([]);
  isLoadingPreview: WritableSignal<boolean> = signal(false);
  previewError: WritableSignal<string | null> = signal(null);

  private readonly TARGET_PREVIEW_COUNT = 100; // Max. Produkte in der Vorschau gesamt
  // Anzahl Produkte pro Unterkategorie von API holen (ggf. erhöhen, wenn Filter stark reduzieren)
  private readonly FETCH_PRODUCTS_PER_SUBCATEGORY = 7;

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        map(params => params.get('slug')),
        tap(() => this.resetState()),
        switchMap(slug => {
          if (!slug) {
            this.handleCategoryNotFound(this.translocoService.translate('categoryOverview.errorNoParentSlug'));
            return of(null);
          }
          const expectedLink = `/category/${slug}`;
          const foundParentCategory = navItems.find(item => item.link === expectedLink);

          if (foundParentCategory) {
            this.currentParentCategory.set(foundParentCategory);
            this.subCategoriesToDisplay.set(foundParentCategory.subItems || []);
            this.updateTitles(foundParentCategory);

            if (foundParentCategory.subItems && foundParentCategory.subItems.length > 0) {
              this.loadProductPreviewForParent(foundParentCategory.subItems);
            } else {
              this.productPreview.set([]);
              this.isLoadingPreview.set(false);
            }
            return of(foundParentCategory);
          } else {
            this.handleCategoryNotFound(this.translocoService.translate('categoryOverview.notFoundError', { categorySlug: slug }));
            return of(null);
          }
        }),
        catchError(err => {
          console.error('Error in CategoryOverview OnInit route subscription:', err);
          this.handleCategoryNotFound(this.translocoService.translate('categoryOverview.genericError'));
          return of(null);
        })
      )
      .subscribe();

    this.translocoService.langChanges$.pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      const cat = this.currentParentCategory();
      if (cat) this.updateTitles(cat);
      if (this.error() && this.error() === this.translocoService.translate('categoryOverview.genericError')) {
         this.error.set(this.translocoService.translate('categoryOverview.genericError'));
      }
      if (this.previewError() && this.previewError() === this.translocoService.translate('categoryOverview.previewLoadError')) {
         this.previewError.set(this.translocoService.translate('categoryOverview.previewLoadError'));
      }
      this.cdr.markForCheck();
    });
  }

  private filterProductsWithNoImageArray(products: WooCommerceProduct[]): WooCommerceProduct[] {
    if (!products) return [];
    return products.filter(product => product.images && product.images.length > 0 && product.images[0]?.src);
  }

  private filterProductsByStockStatus(products: WooCommerceProduct[]): WooCommerceProduct[] {
    if (!products) return [];
    return products.filter(product => product.stock_status === 'instock');
  }

  private async verifyImageLoad(url: string): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) return false;
    return new Promise((resolve) => {
      if (!url || typeof url !== 'string') { resolve(false); return; }
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  private updateTitles(parentCategory: NavItem): void {
    const translatedTitle = this.translocoService.translate(parentCategory.i18nId);
    this.categoryTitle.set(translatedTitle);
    this.titleService.setTitle(`${translatedTitle} - Your Garden Eden`);
  }

  ngOnDestroy(): void {
    // Handled by takeUntilDestroyed
  }

  private resetState(): void {
    this.currentParentCategory.set(null);
    this.categoryTitle.set(null);
    this.subCategoriesToDisplay.set([]);
    this.error.set(null);
    this.productPreview.set([]);
    this.isLoadingPreview.set(false);
    this.previewError.set(null);
    this.cdr.detectChanges();
  }

  private handleCategoryNotFound(errorMessage: string): void {
    this.error.set(errorMessage);
    this.titleService.setTitle(
      `${this.translocoService.translate('categoryOverview.notFoundTitle')} - Your Garden Eden`
    );
    this.currentParentCategory.set(null);
    this.categoryTitle.set(null);
    this.subCategoriesToDisplay.set([]);
    this.productPreview.set([]);
    this.isLoadingPreview.set(false);
    this.previewError.set(null);
    this.cdr.detectChanges();
  }

  getIconPath(filename: string | undefined): string | null {
    return filename ? `assets/icons/categories/${filename}` : null;
  }

  private loadProductPreviewForParent(subItems: NavSubItem[]): void {
    if (!subItems || subItems.length === 0) {
      this.productPreview.set([]);
      this.isLoadingPreview.set(false);
      return;
    }

    this.isLoadingPreview.set(true);
    this.previewError.set(null);
    this.productPreview.set([]);

    const subCategorySlugs = subItems
      .map(sub => sub.link.split('/').pop())
      .filter((slug): slug is string => !!slug);

    if (subCategorySlugs.length === 0) {
      this.isLoadingPreview.set(false);
      return;
    }

    const categoryObservables: Observable<number | undefined>[] = subCategorySlugs.map(slug =>
      this.woocommerceService.getCategoryBySlug(slug).pipe(
        map(wcCategory => wcCategory?.id),
        catchError(() => of(undefined))
      )
    );

    if (categoryObservables.length > 0) {
      forkJoin(categoryObservables).pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((categoryIds: (number | undefined)[]) => {
          const validCategoryIds = categoryIds.filter((id): id is number => id !== undefined);
          if (validCategoryIds.length === 0) return of([] as WooCommerceProductsResponse[]);

          const productObservables: Observable<WooCommerceProductsResponse>[] = validCategoryIds.map(catId =>
            this.woocommerceService.getProducts(catId, this.FETCH_PRODUCTS_PER_SUBCATEGORY, 1).pipe(
              map(response => ({ // Filter hier direkt anwenden
                ...response,
                products: this.filterProductsByStockStatus( // Zuerst Lagerstatus
                  this.filterProductsWithNoImageArray(response.products) // Dann Bilddaten
                )
              })),
              catchError(() => of({ products: [], totalPages: 0, totalCount: 0 } as WooCommerceProductsResponse))
            )
          );
          return productObservables.length > 0 ? forkJoin(productObservables) : of([] as WooCommerceProductsResponse[]);
        }),
        switchMap(async (responsesArray: WooCommerceProductsResponse[]) => {
          console.log(`[PerfTest CatOverview] API responses, candidates after initial filters:`, responsesArray.reduce((sum, r) => sum + (r.products?.length || 0), 0));
          const startTime = performance.now();
          let allCandidateProductsForImageValidation: WooCommerceProduct[] = [];
          const uniqueProductIds = new Set<string | number>();

          responsesArray.forEach(response => {
            if (response && response.products) { // Produkte sind hier schon vor-gefiltert (Bilddaten, Lagerstatus)
              response.products.forEach(p => {
                if (p && !uniqueProductIds.has(p.id)) {
                  allCandidateProductsForImageValidation.push(p);
                  uniqueProductIds.add(p.id);
                }
              });
            }
          });

          if (allCandidateProductsForImageValidation.length === 0) {
            const endTime = performance.now();
            console.log(`[PerfTest CatOverview] Image validation took ${endTime - startTime}ms (no candidates for image validation).`);
            return [];
          }

          const verificationPromises = allCandidateProductsForImageValidation.map(product =>
            this.verifyImageLoad(product.images[0].src) // product.images[0].src sollte existieren
          );
          const verificationResults = await Promise.allSettled(verificationPromises);

          const verifiedProducts: WooCommerceProduct[] = [];
          allCandidateProductsForImageValidation.forEach((product, index) => {
            const result = verificationResults[index];
            if (result.status === 'fulfilled' && result.value === true) {
              verifiedProducts.push(product);
            }
          });
          const endTime = performance.now();
          console.log(`[PerfTest CatOverview] Image validation took ${endTime - startTime}ms. Found ${verifiedProducts.length} displayable from ${allCandidateProductsForImageValidation.length}.`);
          return verifiedProducts;
        }),
        catchError((err: any) => {
          console.error('Fehler beim Laden der Produktvorschau (äußeres catchError):', err);
          this.previewError.set(this.translocoService.translate('categoryOverview.previewLoadError'));
          return of([] as WooCommerceProduct[]);
        }),
        finalize(() => {
          this.isLoadingPreview.set(false);
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: (finalProductsForPreview: WooCommerceProduct[]) => {
          if (finalProductsForPreview.length > 0) {
            const shuffledProducts = this.shuffleArray(finalProductsForPreview);
            this.productPreview.set(shuffledProducts.slice(0, this.TARGET_PREVIEW_COUNT));
          } else {
            this.productPreview.set([]);
            console.log('Keine Produkte mit ladbaren Bildern und Lagerbestand für Vorschau gefunden.');
          }
        },
      });
    } else {
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

  getProductLink(product: WooCommerceProduct): string {
    return `/product/${product.slug}`;
  }

  getProductImage(product: WooCommerceProduct): string | undefined {
    return product.images && product.images.length > 0 && product.images[0]?.src
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
      if (product.price) {
        return { min: product.price, max: product.price };
      }
    }
    return null;
  }

  getProductCurrencySymbol(product: WooCommerceProduct): string {
    const currencyMeta = product.meta_data?.find(m => m.key === '_currency_symbol');
    if (currencyMeta?.value) return currencyMeta.value as string;
    if (product.price_html) {
      if (product.price_html.includes('€')) return '€';
      if (product.price_html.includes('$')) return '$';
    }
    return '€';
  }
}