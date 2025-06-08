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
import { Subscription, of, combineLatest, Observable, EMPTY } from 'rxjs';
import {
  switchMap,
  tap,
  catchError,
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
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

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

  private productsCandidateSignal: WritableSignal<WooCommerceProduct[]> = signal([]);
  displayableProducts: WritableSignal<WooCommerceProduct[]> = signal([]);

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
  private readonly PRODUCTS_PER_PAGE = 40;

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
      filter(([slug]) => {
        if (slug === null) {
          this.isLoading.set(false);
          return false;
        }
        return true;
      })
    );

    const dataLoadingSubscription = paramMapAndLang$.pipe(
      switchMap(([slug, lang]) => {
        if (!slug) {
          this.handleErrorState(this.translocoService.translate('productList.errorNoSlug'));
          return EMPTY;
        }

        this.findCategoryMetadata(slug);

        return this.woocommerceService.getCategoryBySlug(slug).pipe(
          switchMap(category => {
            if (!category || !category.id) {
              this.handleErrorState(this.translocoService.translate('productList.categoryNotFound', { categorySlug: slug }));
              this.currentCategory.set(undefined);
              this.updateTitlesAndBreadcrumbs(lang);
              return of({ products: [], totalPages: 0, totalCount: 0 });
            }
            this.currentCategory.set(category);
            this.updateTitlesAndBreadcrumbs(lang, category.name);
            return this.woocommerceService.getProducts(category.id, this.PRODUCTS_PER_PAGE, 1).pipe(
              map(response => ({
                ...response,
                products: this.filterProductsWithNoImageArray(response.products)
              }))
            );
          }),
          catchError(error => {
            console.error(`ProductList: Error in data loading pipe for slug ${slug}:`, error);
            this.handleErrorState(this.translocoService.translate('productList.errorLoadingProducts'));
            this.currentCategory.set(undefined);
            this.updateTitlesAndBreadcrumbs(lang);
            return of({ products: [], totalPages: 0, totalCount: 0 });
          })
        );
      })
    ).subscribe((result: WooCommerceProductsResponse) => {
      this.productsCandidateSignal.set(result.products);
      this.totalProductPages.set(result.totalPages);
      this.hasNextPage.set(this.currentPage() < result.totalPages);
      this.isLoading.set(false); // **ÄNDERUNG**: Ladezustand hier beenden, damit Grid erscheint
      
      // Bildvalidierung startet, blockiert aber nicht mehr die Anzeige
      this.processAndSetDisplayableProducts(result.products, 'initial');
      
      this.cdr.detectChanges();
      this.trySetupIntersectionObserver();
    });
    this.subscriptions.add(dataLoadingSubscription);
  }

  private filterProductsWithNoImageArray(products: WooCommerceProduct[]): WooCommerceProduct[] {
    if (!products) return [];
    return products.filter(product => product.images && product.images.length > 0 && product.images[0]?.src);
  }

  private verifyImageLoad(url: string): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId) || !url) {
      return Promise.resolve(false);
    }
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  // **OPTIMIERTE METHODE**: Verarbeitet Bilder einzeln für bessere gefühlte Performance
  private async processAndSetDisplayableProducts(
    candidateProducts: WooCommerceProduct[],
    mode: 'initial' | 'loadMore'
  ): Promise<void> {
    if (mode === 'initial') {
      this.displayableProducts.set([]);
    }

    if (!candidateProducts || candidateProducts.length === 0) {
      if (mode === 'loadMore') this.isLoadingMore.set(false);
      this.trySetupIntersectionObserver();
      return;
    }
    
    // Wir iterieren durch die Kandidaten und validieren jedes Bild einzeln.
    // Sobald ein Bild gültig ist, fügen wir es zur anzeigbaren Liste hinzu.
    for (const product of candidateProducts) {
      const imageUrl = product.images[0].src;
      const isValid = await this.verifyImageLoad(imageUrl);
      if (isValid) {
        if(mode === 'initial') {
            this.displayableProducts.update(current => [...current, product]);
        } else {
             // Beim Nachladen fügen wir die Produkte trotzdem in einem Block hinzu, um Sprünge zu vermeiden
        }
      }
    }
    
    // Für "loadMore" ist es besser, die validierten Produkte am Ende gesammelt hinzuzufügen,
    // um das Layout nicht bei jedem einzelnen Produkt springen zu lassen.
    if(mode === 'loadMore') {
        const verificationPromises = candidateProducts.map(p => this.verifyImageLoad(p.images[0].src));
        const results = await Promise.all(verificationPromises);
        const verifiedProducts = candidateProducts.filter((_, index) => results[index]);
        this.displayableProducts.update(current => [...current, ...verifiedProducts]);
        this.isLoadingMore.set(false);
    }
    
    this.cdr.detectChanges();
    this.trySetupIntersectionObserver();
  }
  
  loadMoreProducts(): void {
    if (!this.hasNextPage() || !this.categorySlugFromRoute || this.isLoadingMore() || !this.currentCategory()?.id || this.isLoading()) {
      return;
    }
    this.isLoadingMore.set(true);
    const nextPageToLoad = this.currentPage() + 1;

    const loadMoreSub = this.woocommerceService.getProducts(this.currentCategory()!.id, this.PRODUCTS_PER_PAGE, nextPageToLoad)
      .pipe(
        take(1),
        map(response => ({
          ...response,
          products: this.filterProductsWithNoImageArray(response.products)
        })),
        catchError(error => {
          console.error('Fehler beim Nachladen:', error);
          this.isLoadingMore.set(false);
          return of(null);
        })
      )
      .subscribe(response => {
        if (response && response.products) {
          this.currentPage.set(nextPageToLoad);
          this.hasNextPage.set(nextPageToLoad < response.totalPages);
          
          // Starte die Validierung für die neuen Produkte
          this.processAndSetDisplayableProducts(response.products, 'loadMore');
        } else {
            this.isLoadingMore.set(false);
        }
        if(!this.hasNextPage()) {
            this.disconnectObserver();
        }
      });
    this.subscriptions.add(loadMoreSub);
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
    if (isPlatformBrowser(this.platformId) && this.loadMoreTriggerEl?.nativeElement && this.hasNextPage() && !this.isLoadingMore() && !this.isLoading()) {
      this.setupIntersectionObserver(this.loadMoreTriggerEl.nativeElement);
    } else if (!this.hasNextPage()) {
      this.disconnectObserver();
    }
  }

  private setupIntersectionObserver(targetElement: HTMLElement): void {
    this.disconnectObserver();
    const options = { root: null, rootMargin: '0px 0px 1000px 0px', threshold: 0 };
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

  private resetStateBeforeLoad(): void {
    this.isLoading.set(true);
    this.productsCandidateSignal.set([]);
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
    this.productsCandidateSignal.set([]);
    this.displayableProducts.set([]);
    this.isLoading.set(false);
    this.isLoadingMore.set(false);
    this.hasNextPage.set(false);
    this.categoryTitle.set(this.translocoService.translate('productList.errorPageTitle'));
  }

  // --- HELPER METHODEN (größtenteils unverändert) ---
  getProductImage(product: WooCommerceProduct): string | undefined {
    return product.images?.[0]?.src;
  }
  
  getProductLink(product: WooCommerceProduct): string {
    return `/product/${product.slug}`;
  }
  
  getProductCurrencySymbol(product: WooCommerceProduct): string {
    return product.meta_data?.find(m => m.key === '_currency_symbol')?.value as string || '€';
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

  trackProductById(index: number, product: WooCommerceProduct): number {
    return product.id;
  }

  // Unveränderte Methoden: updateTitlesAndBreadcrumbs, findSubItemByLink, findMainCategoryInfoForSubItemLink, HostListener etc.
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