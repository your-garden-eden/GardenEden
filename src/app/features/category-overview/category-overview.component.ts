// /src/app/features/category-overview/category-overview.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  WritableSignal,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
  WooCommerceMetaData,
} from '../../core/services/woocommerce.service';

// Komponenten
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component'; // *** KORRIGIERT ZURÜCK ZU ProductCardComponent ***

// Transloco
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';

@Component({
  selector: 'app-category-overview',
  standalone: true,
  imports: [CommonModule, RouterModule, ProductCardComponent, TranslocoModule], // *** KORRIGIERT ZURÜCK ZU ProductCardComponent ***
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

  private subscriptions = new Subscription();

  currentParentCategory: WritableSignal<NavItem | null> = signal(null);
  categoryTitle: WritableSignal<string | null> = signal(null);
  subCategoriesToDisplay: WritableSignal<NavSubItem[]> = signal([]);
  error: WritableSignal<string | null> = signal(null);

  productPreview: WritableSignal<WooCommerceProduct[]> = signal([]);
  isLoadingPreview: WritableSignal<boolean> = signal(false);
  previewError: WritableSignal<string | null> = signal(null);

  private readonly TARGET_PREVIEW_COUNT = 8;
  private readonly FETCH_PRODUCTS_PER_SUBCATEGORY = 3;

  ngOnInit(): void {
    const routeSub = this.route.paramMap
      .pipe(
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
            return of(foundParentCategory);
          } else {
            this.handleCategoryNotFound(
              this.translocoService.translate(
                'categoryOverview.notFoundError',
                { categorySlug: slug }
              )
            );
            return of(null);
          }
        }),
        catchError(err => {
          console.error('Error in CategoryOverview OnInit:', err);
          this.handleCategoryNotFound(
            this.translocoService.translate('categoryOverview.genericError')
          );
          return of(null);
        })
      )
      .subscribe();
    this.subscriptions.add(routeSub);

    const langSub = this.translocoService.langChanges$.subscribe(() => {
      const cat = this.currentParentCategory();
      if (cat) {
        this.updateTitles(cat);
      }
      if (this.error()) { this.error.set(this.translocoService.translate('categoryOverview.genericError')); }
      if (this.previewError()) { this.previewError.set(this.translocoService.translate('categoryOverview.previewLoadError')); }
      this.cdr.markForCheck();
    });
    this.subscriptions.add(langSub);
  }

  private updateTitles(parentCategory: NavItem): void {
    const translatedTitle = this.translocoService.translate(parentCategory.i18nId);
    this.categoryTitle.set(translatedTitle);
    this.titleService.setTitle(`${translatedTitle} - Your Garden Eden`);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
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
    this.cdr.detectChanges();
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
      .map(sub => sub.link.split('/').pop())
      .filter(Boolean) as string[];

    if (subCategorySlugs.length === 0) {
      this.isLoadingPreview.set(false);
      this.cdr.detectChanges();
      return;
    }

    const categoryObservables: Observable<number | undefined>[] = subCategorySlugs.map(slug =>
      this.woocommerceService.getCategoryBySlug(slug).pipe(
        map(wcCategory => wcCategory?.id),
        catchError(() => of(undefined))
      )
    );

    const previewSub = forkJoin(categoryObservables).pipe(
      switchMap((categoryIds: (number | undefined)[]) => {
        const validCategoryIds = categoryIds.filter(id => id !== undefined) as number[];
        if (validCategoryIds.length === 0) {
          console.log('Keine gültigen WooCommerce Kategorie-IDs für Produktvorschau gefunden.');
          return of([] as WooCommerceProductsResponse[]);
        }

        const productObservables: Observable<WooCommerceProductsResponse>[] = validCategoryIds.map(catId =>
          this.woocommerceService.getProducts(catId, this.FETCH_PRODUCTS_PER_SUBCATEGORY, 1).pipe(
            catchError(() => of({ products: [], totalPages: 0, totalCount: 0 } as WooCommerceProductsResponse))
          )
        );
        return forkJoin(productObservables);
      }),
      map((responsesArray: WooCommerceProductsResponse[]) => {
        const allFetchedProducts: WooCommerceProduct[] = [];
        const uniqueProductIds = new Set<string | number>();
        responsesArray.forEach((response: WooCommerceProductsResponse) => {
          response.products.forEach((p: WooCommerceProduct) => {
            if (!uniqueProductIds.has(p.id)) {
              allFetchedProducts.push(p);
              uniqueProductIds.add(p.id);
            }
          });
        });
        return allFetchedProducts;
      }),
      take(1),
      catchError((err: any) => {
        console.error('Fehler beim Laden der Produktvorschau:', err);
        this.previewError.set(this.translocoService.translate('categoryOverview.previewLoadError'));
        return of([] as WooCommerceProduct[]);
      }),
      finalize(() => {
        this.isLoadingPreview.set(false);
        this.cdr.detectChanges();
      })
    ).subscribe((allProducts: WooCommerceProduct[]) => {
      if (allProducts.length > 0) {
        const shuffledProducts = this.shuffleArray(allProducts);
        this.productPreview.set(shuffledProducts.slice(0, this.TARGET_PREVIEW_COUNT));
      } else {
        this.productPreview.set([]);
         console.log('Keine Produkte für Vorschau gefunden nach API-Abfragen.');
      }
    });
    this.subscriptions.add(previewSub);
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