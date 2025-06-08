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
import { forkJoin, of, Observable } from 'rxjs';
import {
  map,
  catchError,
  switchMap,
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
} from '../../core/services/woocommerce.service';

import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-category-overview',
  standalone: true,
  imports: [CommonModule, RouterModule, ProductCardComponent, TranslocoModule, LoadingSpinnerComponent],
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

  // --- NEU: Haupt-Ladesignal ---
  isLoading: WritableSignal<boolean> = signal(true);

  currentParentCategory: WritableSignal<NavItem | null> = signal(null);
  categoryTitle: WritableSignal<string | null> = signal(null);
  subCategoriesToDisplay: WritableSignal<NavSubItem[]> = signal([]);
  error: WritableSignal<string | null> = signal(null);

  displayableProductPreview: WritableSignal<WooCommerceProduct[]> = signal([]);
  isLoadingPreview: WritableSignal<boolean> = signal(false);
  previewError: WritableSignal<string | null> = signal(null);

  private readonly TARGET_PREVIEW_COUNT = 100;
  private readonly FETCH_PRODUCTS_PER_SUBCATEGORY = 8;

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        tap(() => this.resetState()), // Setzt isLoading wieder auf true
        map(params => params.get('slug')),
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
              this.isLoadingPreview.set(false);
            }
            this.isLoading.set(false); // Ladezustand hier beenden
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
    });
  }
  
  private loadProductPreviewForParent(subItems: NavSubItem[]): void {
    this.isLoadingPreview.set(true);
    this.previewError.set(null);
    this.displayableProductPreview.set([]);

    const subCategorySlugs = subItems.map(sub => sub.link.split('/').pop()).filter(Boolean) as string[];
    if (subCategorySlugs.length === 0) {
      this.isLoadingPreview.set(false);
      return;
    }
    
    const categoryObservables = subCategorySlugs.map(slug =>
      this.woocommerceService.getCategoryBySlug(slug).pipe(map(c => c?.id), catchError(() => of(undefined)))
    );

    forkJoin(categoryObservables).pipe(
      takeUntilDestroyed(this.destroyRef),
      switchMap(categoryIds => {
        const validIds = categoryIds.filter((id): id is number => id !== undefined);
        if (validIds.length === 0) return of([]);
        const productObservables = validIds.map(id =>
          this.woocommerceService.getProducts(id, this.FETCH_PRODUCTS_PER_SUBCATEGORY, 1).pipe(
            map(res => this.filterProductsByStockStatus(this.filterProductsWithNoImageArray(res.products))),
            catchError(() => of([] as WooCommerceProduct[]))
          )
        );
        return forkJoin(productObservables);
      }),
      tap(productArrays => {
        this.isLoadingPreview.set(false);
        this.cdr.markForCheck();
        this.validateAndSetPreview(productArrays);
      }),
      catchError(err => {
        console.error('Fehler beim Laden der Produktvorschau:', err);
        this.previewError.set(this.translocoService.translate('categoryOverview.previewLoadError'));
        this.isLoadingPreview.set(false);
        this.cdr.markForCheck();
        return of([]);
      })
    ).subscribe();
  }
  
  private async validateAndSetPreview(productArrays: WooCommerceProduct[][]): Promise<void> {
    let allCandidates: WooCommerceProduct[] = [];
    const uniqueIds = new Set<string|number>();

    productArrays.flat().forEach(p => {
        if (p && !uniqueIds.has(p.id)) {
            allCandidates.push(p);
            uniqueIds.add(p.id);
        }
    });
    
    if (allCandidates.length === 0) {
        this.displayableProductPreview.set([]);
        this.cdr.markForCheck();
        return;
    }

    const verificationPromises = allCandidates.map(p => this.verifyImageLoad(p.images[0].src));
    const results = await Promise.all(verificationPromises);
    
    const verifiedProducts = allCandidates.filter((_, index) => results[index]);
    
    if (verifiedProducts.length > 0) {
        const shuffled = this.shuffleArray(verifiedProducts);
        this.displayableProductPreview.set(shuffled.slice(0, this.TARGET_PREVIEW_COUNT));
    } else {
        this.displayableProductPreview.set([]);
    }
    
    this.cdr.markForCheck();
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
    if (!isPlatformBrowser(this.platformId) || !url) return Promise.resolve(false);
    return new Promise(resolve => {
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

  ngOnDestroy(): void {}

  private resetState(): void {
    this.isLoading.set(true); // Ladezustand bei jedem neuen Aufruf zurücksetzen
    this.currentParentCategory.set(null);
    this.categoryTitle.set(null);
    this.subCategoriesToDisplay.set([]);
    this.error.set(null);
    this.displayableProductPreview.set([]);
    this.isLoadingPreview.set(false);
    this.previewError.set(null);
  }

  private handleCategoryNotFound(errorMessage: string): void {
    this.error.set(errorMessage);
    this.titleService.setTitle(`${this.translocoService.translate('categoryOverview.notFoundTitle')} - Your Garden Eden`);
    this.isLoading.set(false); // Ladezustand auch im Fehlerfall beenden
    this.isLoadingPreview.set(false);
  }

  getIconPath(filename: string | undefined): string | null {
    return filename ? `assets/icons/categories/${filename}` : null;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  getProductLink(product: WooCommerceProduct): string { return `/product/${product.slug}`; }
  getProductImage(product: WooCommerceProduct): string | undefined { return product.images?.[0]?.src; }
  extractPriceRange(product: WooCommerceProduct): { min: string, max: string } | null {
    if (product.type === 'variable') {
      if (product.price_html) {
        const rangeMatch = product.price_html.match(/([\d.,]+)[^\d.,<]*?(?:–|-)[^\d.,<]*?([\d.,]+)/);
        if (rangeMatch?.[1] && rangeMatch?.[2]) return { min: rangeMatch[1].replace(',', '.'), max: rangeMatch[2].replace(',', '.') };
        const singlePriceMatch = product.price_html.match(/([\d.,]+)/);
        if (singlePriceMatch?.[1]) { const priceVal = singlePriceMatch[1].replace(',', '.'); return { min: priceVal, max: priceVal }; }
      }
      return product.price ? { min: product.price, max: product.price } : null;
    }
    return null;
  }
  getProductCurrencySymbol(product: WooCommerceProduct): string { return product.meta_data?.find(m => m.key === '_currency_symbol')?.value as string || '€'; }
}