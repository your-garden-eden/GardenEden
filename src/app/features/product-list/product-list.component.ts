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
  HostListener, // HINZUGEFÜGT
  PLATFORM_ID   // Sicherstellen, dass es importiert ist
} from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common'; // isPlatformBrowser sicherstellen
import { Title } from '@angular/platform-browser';
import { Subscription, of, combineLatest, Observable, EMPTY } from 'rxjs';
import {
  switchMap,
  tap,
  catchError,
  finalize,
  map,
  take,
  distinctUntilChanged,
  startWith,
  filter,
} from 'rxjs/operators';

import {
  WoocommerceService,
  WooCommerceProduct,
  WooCommerceCategory,
  WooCommerceProductsResponse,
  WooCommerceMetaData,
} from '../../core/services/woocommerce.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';
import {
  navItems,
  NavItem,
  NavSubItem,
} from '../../core/data/navigation.data';

import { TranslocoModule, TranslocoService } from '@ngneat/transloco';

@Component({
  selector: 'app-product-list-page',
  standalone: true,
  imports: [CommonModule, ProductCardComponent, RouterModule, TranslocoModule],
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
  private platformId = inject(PLATFORM_ID); // HINZUGEFÜGT (falls noch nicht vorhanden)

  products: WritableSignal<WooCommerceProduct[]> = signal([]);
  categoryTitle: WritableSignal<string | null> = signal(null);
  mainCategoryLabel: WritableSignal<string | null> = signal(null);

  isLoading: WritableSignal<boolean> = signal(true);
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
  private readonly PRODUCTS_PER_PAGE = 12;

  private currentFoundSubItem: NavSubItem | undefined;
  private currentMainCategoryNavItem: NavItem | undefined;

  // --- HINZUGEFÜGT: Für Scroll-to-Top Button ---
  showScrollToTopButton: WritableSignal<boolean> = signal(false);
  private scrollThreshold = 300; // Zeige Button nach 300px Scroll
  // --- ENDE Scroll-to-Top Button ---

  constructor() {
    afterNextRender(() => {
      this.trySetupIntersectionObserver();
      // --- HINZUGEFÜGT: Initialer Check für Scroll-to-Top ---
      if (isPlatformBrowser(this.platformId)) {
        this.checkScrollPosition();
      }
      // --- ENDE Initialer Check ---
    });
  }

  ngOnInit(): void {
    const paramMapAndLang$ = combineLatest([
      this.route.paramMap.pipe(
        map(params => params.get('slug')),
        distinctUntilChanged(),
        tap(slug => console.log('ProductList: slug from route:', slug))
      ),
      this.translocoService.langChanges$.pipe(
        startWith(this.translocoService.getActiveLang())
      ),
    ]).pipe(
      tap(([slug, lang]) => {
        if (slug !== this.categorySlugFromRoute) {
          this.categorySlugFromRoute = slug;
          this.resetStateBeforeLoad();
          this.isLoading.set(true);
          console.log('ProductList: State reset, loading for slug:', slug);
        }
        this.updateTitlesAndBreadcrumbs(lang, this.currentCategory()?.name);
      }),
      filter(([slug]) => {
        if (slug === null) {
          console.warn('ProductList: Slug is null, stopping data loading.');
          return false;
        }
        return true;
      })
    );

    const dataLoadingSubscription = paramMapAndLang$.pipe(
      switchMap(([slug, lang]) => {
        if (!slug) {
          this.handleErrorState(this.translocoService.translate('productList.errorNoSlug'));
          const errorPageTitleText = this.translocoService.translate('productList.errorPageTitle');
          this.titleService.setTitle(`${errorPageTitleText} - Your Garden Eden`);
          return EMPTY;
        }

        this.currentFoundSubItem = this.findSubItemByLink(`/product-list/${slug}`);
        const categoryInfo = this.findMainCategoryInfoForSubItemLink(`/product-list/${slug}`);
        this.mainCategoryLink.set(categoryInfo?.mainCategoryLink ?? null);
        this.currentMainCategoryNavItem = categoryInfo
          ? navItems.find(item => item.link === categoryInfo.mainCategoryLink)
          : undefined;

        console.log(`ProductList: Attempting to fetch category for slug: ${slug}`);
        return this.woocommerceService.getCategoryBySlug(slug).pipe(
          tap(category => console.log('ProductList: Fetched category by slug response:', category)),
          switchMap(category => {
            if (!category || !category.id) {
              console.error(`ProductList: Category not found or no ID for slug: ${slug}`);
              this.handleErrorState(this.translocoService.translate('productList.categoryNotFound', { categorySlug: slug }));
              this.currentCategory.set(undefined);
              this.updateTitlesAndBreadcrumbs(lang);
              return of({ products: [], totalPages: 0, totalCount: 0 } as WooCommerceProductsResponse);
            }
            this.currentCategory.set(category);
            this.updateTitlesAndBreadcrumbs(lang, category.name);
            console.log(`ProductList: Category found: ${category.name} (ID: ${category.id}). Fetching products.`);

            return this.woocommerceService.getProducts(category.id, this.PRODUCTS_PER_PAGE, 1).pipe(
                tap(response => console.log(`ProductList: Fetched products for category ${category.id}:`, response.products))
            );
          }),
          catchError(error => {
            console.error(`ProductList: Error in data loading pipe for slug ${slug}:`, error);
            this.handleErrorState(this.translocoService.translate('productList.errorLoadingProducts'));
            this.currentCategory.set(undefined);
            this.updateTitlesAndBreadcrumbs(lang);
            return of({ products: [], totalPages: 0, totalCount: 0 } as WooCommerceProductsResponse);
          })
        );
      })
    ).subscribe((result: WooCommerceProductsResponse) => {
      console.log('ProductList: Final result from data loading subscription:', result);
      this.products.set(result.products);
      this.totalProductPages.set(result.totalPages);
      this.hasNextPage.set(this.currentPage() < result.totalPages);
      this.isLoading.set(false);
      this.cdr.detectChanges();
      this.trySetupIntersectionObserver();
    });
    this.subscriptions.add(dataLoadingSubscription);
  }

  private trySetupIntersectionObserver(): void {
    if (this.loadMoreTriggerEl?.nativeElement && this.hasNextPage() && !this.isLoadingMore()) {
      this.setupIntersectionObserver(this.loadMoreTriggerEl.nativeElement);
    } else {
      this.disconnectObserver();
    }
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

    const titleUpdateSub = combineLatest([
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

  private handleErrorState(errorMessage: string): void {
    console.error('ProductList: handleErrorState called with:', errorMessage);
    this.error.set(errorMessage);
    this.products.set([]);
    this.isLoading.set(false);
    this.hasNextPage.set(false);
    this.currentPage.set(1);
    this.totalProductPages.set(1);
    this.categoryTitle.set(this.translocoService.translate('productList.errorPageTitle'));
    this.cdr.detectChanges();
  }

  private resetStateBeforeLoad(): void {
    this.isLoading.set(true);
    this.products.set([]);
    this.categoryTitle.set(null);
    this.error.set(null);
    this.currentPage.set(1);
    this.totalProductPages.set(1);
    this.hasNextPage.set(false);
    this.isLoadingMore.set(false);
    this.mainCategoryLink.set(null);
    this.mainCategoryLabel.set(null);
    this.currentFoundSubItem = undefined;
    this.currentMainCategoryNavItem = undefined;
    this.currentCategory.set(null);
    this.disconnectObserver();
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.disconnectObserver();
    // Kein explizites Entfernen des window:scroll Listeners nötig, da @HostListener das managed.
  }

  private setupIntersectionObserver(targetElement: HTMLElement): void {
    this.disconnectObserver();
    const options = { root: null, rootMargin: '0px 0px 300px 0px', threshold: 0.1 };
    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && this.hasNextPage() && !this.isLoadingMore()) {
          this.loadMoreProducts();
        }
      });
    }, options);
    this.intersectionObserver.observe(targetElement);
  }

  private disconnectObserver(): void {
    if (this.intersectionObserver) {
      if (this.loadMoreTriggerEl?.nativeElement) {
        this.intersectionObserver.unobserve(this.loadMoreTriggerEl.nativeElement);
      }
      this.intersectionObserver.disconnect();
      this.intersectionObserver = undefined;
    }
  }

  loadMoreProducts(): void {
    if (!this.hasNextPage() || !this.categorySlugFromRoute || this.isLoadingMore() || !this.currentCategory()?.id) {
      return;
    }
    this.isLoadingMore.set(true);
    const nextPageToLoad = this.currentPage() + 1;

    const loadMoreSub = this.woocommerceService.getProducts(this.currentCategory()!.id, this.PRODUCTS_PER_PAGE, nextPageToLoad)
      .pipe(
        take(1),
        catchError(error => {
          console.error('ProductList: Fehler beim Nachladen weiterer Produkte:', error);
          return of(null);
        }),
        finalize(() => {
            this.isLoadingMore.set(false);
            this.cdr.detectChanges();
        })
      )
      .subscribe((response: WooCommerceProductsResponse | null) => {
        if (response && response.products && response.products.length > 0) {
          this.products.update(currentProducts => [...currentProducts, ...response.products]);
          this.currentPage.set(nextPageToLoad);
          this.totalProductPages.set(response.totalPages);
          this.hasNextPage.set(nextPageToLoad < response.totalPages);

          if (!this.hasNextPage()) {
            this.disconnectObserver();
          }
        } else {
          this.hasNextPage.set(false);
          this.disconnectObserver();
        }
      });
    this.subscriptions.add(loadMoreSub);
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

  getProductLink(product: WooCommerceProduct): string {
    return `/product/${product.slug}`;
  }

  getProductImage(product: WooCommerceProduct): string | undefined {
    return product.images && product.images.length > 0 ? product.images[0].src : undefined;
  }

  extractPriceRange(product: WooCommerceProduct): { min: string, max: string } | null {
    if (product.type === 'variable') {
      if (product.price_html) {
        const rangeMatch = product.price_html.match(/<span class="woocommerce-Price-amount amount"><bdi>.*?([\d,.]+).*?<\/bdi><\/span>\s*–\s*<span class="woocommerce-Price-amount amount"><bdi>.*?([\d,.]+).*?<\/bdi><\/span>/);
        if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
          return { min: rangeMatch[1].replace(',', '.'), max: rangeMatch[2].replace(',', '.') };
        }
        const singlePriceMatch = product.price_html.match(/<span class="woocommerce-Price-amount amount"><bdi>.*?([\d,.]+).*?<\/bdi><\/span>/);
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

  // --- HINZUGEFÜGT: Methoden für Scroll-to-Top Button ---
  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.checkScrollPosition();
    }
  }

  private checkScrollPosition(): void {
    const scrollPosition = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (scrollPosition > this.scrollThreshold) {
      if (!this.showScrollToTopButton()) { // Nur setzen, wenn sich der Zustand ändert
        this.showScrollToTopButton.set(true);
        this.cdr.detectChanges(); // Manchmal nötig bei HostListener außerhalb von Angular Zonen Trigger
      }
    } else {
      if (this.showScrollToTopButton()) { // Nur setzen, wenn sich der Zustand ändert
        this.showScrollToTopButton.set(false);
        this.cdr.detectChanges(); // Manchmal nötig
      }
    }
  }

  scrollToTop(): void {
    if (isPlatformBrowser(this.platformId)) {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }
  // --- ENDE Scroll-to-Top Button Methoden ---
}