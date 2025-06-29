// /src/app/features/product-list/product-list.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  WritableSignal,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  afterNextRender,
  HostListener,
  PLATFORM_ID
} from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Subscription, of, combineLatest, Observable, EMPTY, firstValueFrom } from 'rxjs';
import {
  switchMap,
  tap,
  catchError,
  map,
  distinctUntilChanged,
  startWith,
  filter,
  take,
} from 'rxjs/operators';

import {
  WoocommerceService,
  WooCommerceProduct,
  WooCommerceCategory,
  WooCommerceMetaData,
} from '../../core/services/woocommerce.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';
import {
  navItems,
  NavItem,
  NavSubItem,
} from '../../core/data/navigation.data';

import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

type LoadState = 'loading' | 'completed' | 'error';

@Component({
  selector: 'app-product-list-page',
  standalone: true,
  imports: [CommonModule, ProductCardComponent, RouterModule, TranslocoModule, LoadingSpinnerComponent],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductListPageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private woocommerceService = inject(WoocommerceService);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);
  private platformId = inject(PLATFORM_ID);

  displayableProducts: WritableSignal<WooCommerceProduct[]> = signal([]);
  categoryTitle: WritableSignal<string | null> = signal(null);
  mainCategoryLabel: WritableSignal<string | null> = signal(null);
  loadState: WritableSignal<LoadState> = signal('loading');
  isLoadingMore: WritableSignal<boolean> = signal(false);
  error: WritableSignal<string | null> = signal(null);
  private currentPage: WritableSignal<number> = signal(1);
  private totalProductPages: WritableSignal<number> = signal(1);
  categorySlugFromRoute: string | null = null;
  hasNextPage: WritableSignal<boolean> = signal(false);
  private currentCategory: WritableSignal<WooCommerceCategory | null | undefined> = signal(null);
  mainCategoryLink: WritableSignal<string | null> = signal(null);

  @ViewChild('loadMoreTrigger')
  private loadMoreTriggerEl?: ElementRef<HTMLDivElement>;
  private intersectionObserver?: IntersectionObserver;
  private subscriptions = new Subscription();

  private readonly PRODUCTS_PER_PAGE = 25;

  private currentFoundSubItem: NavSubItem | undefined;
  private currentMainCategoryNavItem: NavItem | undefined;
  showScrollToTopButton: WritableSignal<boolean> = signal(false);
  private scrollThreshold = 300;

  constructor() {
    afterNextRender(() => {
      if (isPlatformBrowser(this.platformId)) {
        this.checkScrollPosition();
      }
    });
  }

  ngOnInit(): void {
    const paramMapAndLang$ = combineLatest([
      this.route.paramMap.pipe(map(params => params.get('slug')), distinctUntilChanged()),
      this.translocoService.langChanges$.pipe(startWith(this.translocoService.getActiveLang())),
    ]).pipe(
      tap(([slug, lang]) => {
        if (slug !== this.categorySlugFromRoute) {
          this.categorySlugFromRoute = slug;
          this.resetStateBeforeLoad();
        }
        this.updateTitlesAndBreadcrumbs(lang, this.currentCategory()?.name);
      }),
      filter(([slug]) => !!slug)
    );

    const dataLoadingSubscription = paramMapAndLang$.pipe(
      switchMap(([slug, lang]) => {
        if (!slug) return EMPTY;
        this.findCategoryMetadata(slug);
        return this.woocommerceService.getCategoryBySlug(slug).pipe(
          tap(category => {
            if (!category || !category.id) {
              this.handleErrorState(this.translocoService.translate('productList.categoryNotFound', { categorySlug: slug }));
              this.currentCategory.set(undefined);
            } else {
              this.currentCategory.set(category);
            }
            this.updateTitlesAndBreadcrumbs(lang, category?.name);
          }),
          catchError(error => {
            console.error(`ProductList: Error loading category ${slug}:`, error);
            this.handleErrorState(this.translocoService.translate('productList.errorLoadingProducts'));
            return EMPTY;
          })
        );
      })
    ).subscribe(category => {
      if (category?.id) {
        this.initialLoad();
      }
    });
    this.subscriptions.add(dataLoadingSubscription);
  }
  
  // HIER GEÄNDERT: Vereinfachte und schnellere Ladelogik
  private async initialLoad(): Promise<void> {
    const categoryId = this.currentCategory()?.id;
    if (!categoryId) return;
    
    this.loadState.set('loading');
    
    try {
      const response = await firstValueFrom(this.woocommerceService.getProducts(categoryId, this.PRODUCTS_PER_PAGE, 1));
      
      const validProducts = this.filterProductsWithImageData(response.products);
      
      this.displayableProducts.set(validProducts);
      this.totalProductPages.set(response.totalPages);
      this.currentPage.set(1);
      this.hasNextPage.set(this.currentPage() < this.totalProductPages());
      this.loadState.set('completed');

    } catch (err) {
      console.error("Error during initial product load:", err);
      this.handleErrorState(this.translocoService.translate('productList.errorLoadingProducts'));
    } finally {
      this.cdr.detectChanges();
      this.trySetupIntersectionObserver();
    }
  }
  
  // HIER GEÄNDERT: Vereinfachte und schnellere Ladelogik
  async loadMoreProducts(): Promise<void> {
    const categoryId = this.currentCategory()?.id;
    if (!categoryId || this.isLoadingMore() || !this.hasNextPage()) {
      return;
    }
    this.isLoadingMore.set(true);

    const nextPage = this.currentPage() + 1;

    try {
      const response = await firstValueFrom(this.woocommerceService.getProducts(categoryId, this.PRODUCTS_PER_PAGE, nextPage));
      
      const newValidProducts = this.filterProductsWithImageData(response.products);

      this.displayableProducts.update(currentProducts => {
        const uniqueNewProducts = newValidProducts.filter(p => !currentProducts.some(cp => cp.id === p.id));
        return [...currentProducts, ...uniqueNewProducts];
      });

      this.totalProductPages.set(response.totalPages);
      this.currentPage.set(nextPage);
      this.hasNextPage.set(this.currentPage() < this.totalProductPages());

    } catch (err) {
      console.error(`Error on loading page ${nextPage}:`, err);
      this.hasNextPage.set(false);
    } finally {
      this.isLoadingMore.set(false);
      this.cdr.detectChanges();
      this.trySetupIntersectionObserver();
    }
  }
  
  /**
   * HIER GEÄNDERT: Schneller, nicht-blockierender Filter anstelle der langsamen Validierung.
   */
  private filterProductsWithImageData(products: WooCommerceProduct[]): WooCommerceProduct[] {
    if (!products) return [];
    return products.filter(product => product.images && product.images.length > 0 && product.images[0]?.src);
  }

  // --- ENTFERNT ---: Die folgenden Methoden sind nicht mehr nötig und wurden für bessere Performance entfernt:
  // - processAndDisplayProducts
  // - getUniqueProducts
  // - validateProducts
  // - verifyImageLoad

  private resetStateBeforeLoad(): void {
    this.loadState.set('loading');
    this.displayableProducts.set([]);
    this.categoryTitle.set(null);
    this.error.set(null);
    this.currentPage.set(1);
    this.totalProductPages.set(1);
    this.hasNextPage.set(false);
    this.isLoadingMore.set(false);
    this.mainCategoryLink.set(null);
    this.mainCategoryLabel.set(null);
    this.currentCategory.set(null);
    this.disconnectObserver();
  }

  private handleErrorState(errorMessage: string): void {
    this.error.set(errorMessage);
    this.displayableProducts.set([]);
    this.loadState.set('error');
    this.isLoadingMore.set(false);
    this.hasNextPage.set(false);
    this.categoryTitle.set(this.translocoService.translate('productList.errorPageTitle'));
  }
  
  private findCategoryMetadata(slug: string): void {
      const subItemLink = `/product-list/${slug}`;
      this.currentFoundSubItem = this.findSubItemByLink(subItemLink);
      const categoryInfo = this.findMainCategoryInfoForSubItemLink(subItemLink);
      this.mainCategoryLink.set(categoryInfo?.mainCategoryLink ?? null);
      this.currentMainCategoryNavItem = categoryInfo
        ? navItems.find(item => item.link === categoryInfo.mainCategoryLink)
        : undefined;
  }

  private trySetupIntersectionObserver(): void {
    if (isPlatformBrowser(this.platformId) && this.loadMoreTriggerEl?.nativeElement && this.hasNextPage() && !this.isLoadingMore() && this.loadState() !== 'loading') {
      this.setupIntersectionObserver(this.loadMoreTriggerEl.nativeElement);
    } else if (!this.hasNextPage()) {
      this.disconnectObserver();
    }
  }

  private setupIntersectionObserver(targetElement: HTMLElement): void {
    this.disconnectObserver();
    const options = { root: null, rootMargin: '1500px 0px 0px 0px', threshold: 0 };
    this.intersectionObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        this.loadMoreProducts();
      }
    }, options);
    this.intersectionObserver.observe(targetElement);
  }

  private disconnectObserver(): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = undefined;
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.disconnectObserver();
  }
  
  getProductImage(product: WooCommerceProduct): string | undefined {
    return product.images?.[0]?.src;
  }
  
  getProductLink(product: WooCommerceProduct): string {
    return `/product/${product.slug}`;
  }
  
  getProductCurrencySymbol(product: WooCommerceProduct): string {
    const currencyMeta = product.meta_data?.find((m: WooCommerceMetaData) => m.key === '_currency_symbol');
    return (currencyMeta?.value as string) || '€';
  }
  
  extractPriceRange(product: WooCommerceProduct): { min: string, max: string } | null {
    if (product.type === 'variable') {
      if (product.price_html) {
        const rangeMatch = product.price_html.match(/<span class="woocommerce-Price-amount amount"><bdi>.*?([\d,.]+).*?<\/bdi><\/span>\s*–\s*<span class="woocommerce-Price-amount amount"><bdi>.*?([\d,.]+).*?<\/bdi><\/span>/);
        if (rangeMatch?.[1] && rangeMatch?.[2]) return { min: rangeMatch[1].replace(',', '.'), max: rangeMatch[2].replace(',', '.') };
        const singlePriceMatch = product.price_html.match(/<span class="woocommerce-Price-amount amount"><bdi>.*?([\d,.]+).*?<\/bdi><\/span>/);
        if (singlePriceMatch?.[1]) { const priceVal = singlePriceMatch[1].replace(',', '.'); return { min: priceVal, max: priceVal }; }
      }
      return product.price ? { min: product.price, max: product.price } : null;
    }
    return null;
  }
  
  private updateTitlesAndBreadcrumbs(lang: string, categoryNameFromApi?: string): void {
    let h1Title$: Observable<string>;
    let pageTitleForBrowser = '';

    if (this.currentFoundSubItem?.i18nId) {
      h1Title$ = this.translocoService.selectTranslate(this.currentFoundSubItem.i18nId, {}, lang);
      pageTitleForBrowser = categoryNameFromApi || this.translocoService.translate(this.currentFoundSubItem.i18nId, {}, lang);
    } else if (categoryNameFromApi) {
      h1Title$ = of(categoryNameFromApi);
      pageTitleForBrowser = categoryNameFromApi;
    } else if (this.categorySlugFromRoute) {
      const formattedSlug = this.categorySlugFromRoute.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      h1Title$ = of(formattedSlug);
      pageTitleForBrowser = formattedSlug;
    } else {
      h1Title$ = this.translocoService.selectTranslate('productList.defaultTitle', {}, lang);
      pageTitleForBrowser = this.translocoService.translate('productList.defaultTitle', {}, lang);
    }

    if (this.currentCategory() === undefined && this.categorySlugFromRoute) {
        const notFoundTitle = this.translocoService.translate('productList.categoryNotFoundTitle', { categorySlug: this.categorySlugFromRoute }, lang);
        h1Title$ = of(notFoundTitle);
        pageTitleForBrowser = notFoundTitle;
    }

    let breadcrumbLabel$: Observable<string | null> = of(null);
    if (this.currentMainCategoryNavItem?.i18nId) {
      breadcrumbLabel$ = this.translocoService.selectTranslate( this.currentMainCategoryNavItem.i18nId, {}, lang ).pipe(startWith(this.mainCategoryLabel() || null));
    } else if (this.currentMainCategoryNavItem?.label) {
      breadcrumbLabel$ = of(this.currentMainCategoryNavItem.label);
    }

    const titleUpdateSub = combineLatest<[string, string | null]>([
        h1Title$.pipe(startWith(this.categoryTitle() || '')),
        breadcrumbLabel$
    ]).pipe(take(1))
      .subscribe(([translatedH1Title, translatedBreadcrumbLabel]) => {
        if (translatedH1Title && translatedH1Title !== this.categoryTitle()) {
          this.categoryTitle.set(translatedH1Title);
        }
        this.mainCategoryLabel.set(translatedBreadcrumbLabel);
        this.cdr.markForCheck();
    });
    this.subscriptions.add(titleUpdateSub);

    const finalBrowserTitle = pageTitleForBrowser || this.translocoService.translate('productList.defaultTitle');
    this.titleService.setTitle(`${finalBrowserTitle} - Your Garden Eden`);
  }

  private findSubItemByLink(link: string): NavSubItem | undefined {
    for (const item of navItems) {
      if (item.subItems) {
        const found = item.subItems.find(subItem => subItem.link === link);
        if (found) { return found; }
      }
    }
    return undefined;
  }

  private findMainCategoryInfoForSubItemLink(subItemLink: string): { mainCategoryLink: string; mainCategoryLabelI18nKey: string } | null {
    for (const mainItem of navItems) {
      if (mainItem.subItems) {
        const foundSubItem = mainItem.subItems.find(subItem => subItem.link === subItemLink);
        if (foundSubItem && mainItem.link && mainItem.link.startsWith('/category/')) {
          return {
            mainCategoryLink: mainItem.link,
            mainCategoryLabelI18nKey: mainItem.i18nId,
          };
        }
      }
    }
    return null;
  }

  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.checkScrollPosition();
    }
  }

  private checkScrollPosition(): void {
    const scrollPosition = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (scrollPosition > this.scrollThreshold) {
      if (!this.showScrollToTopButton()) { this.showScrollToTopButton.set(true); this.cdr.detectChanges(); }
    } else {
      if (this.showScrollToTopButton()) { this.showScrollToTopButton.set(false); this.cdr.detectChanges(); }
    }
  }

  scrollToTop(): void {
    if (isPlatformBrowser(this.platformId)) { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }
}