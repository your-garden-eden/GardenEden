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
  private platformId = inject(PLATFORM_ID);

  // Signal für Produkte, die von der API kommen und den ersten Filter (nur Datenprüfung) bestanden haben
  private productsCandidateSignal: WritableSignal<WooCommerceProduct[]> = signal([]);
  // Signal für Produkte, deren Bilder erfolgreich validiert wurden und die im Template angezeigt werden
  displayableProducts: WritableSignal<WooCommerceProduct[]> = signal([]);

  categoryTitle: WritableSignal<string | null> = signal(null);
  mainCategoryLabel: WritableSignal<string | null> = signal(null);

  isLoading: WritableSignal<boolean> = signal(true); // Haupt-Ladeindikator
  isLoadingMore: WritableSignal<boolean> = signal(false); // Für "Mehr laden"
  error: WritableSignal<string | null> = signal(null);

  private currentPage: WritableSignal<number> = signal(1);
  private totalProductPages: WritableSignal<number> = signal(1); // Basiert auf Server-Daten

  categorySlugFromRoute: string | null = null;
  hasNextPage: WritableSignal<boolean> = signal(false); // Basiert auf Server-Daten

  private currentCategory: WritableSignal<WooCommerceCategory | null | undefined> = signal(null);
  mainCategoryLink: WritableSignal<string | null> = signal(null);

  @ViewChild('loadMoreTrigger')
  private loadMoreTriggerEl?: ElementRef<HTMLDivElement>;
  private intersectionObserver?: IntersectionObserver;
  private subscriptions = new Subscription();
  private readonly PRODUCTS_PER_PAGE = 12;

  private currentFoundSubItem: NavSubItem | undefined;
  private currentMainCategoryNavItem: NavItem | undefined;

  showScrollToTopButton: WritableSignal<boolean> = signal(false);
  private scrollThreshold = 300;

  constructor() {
    afterNextRender(() => {
      // IntersectionObserver wird erst nach der ersten Bildvalidierung sinnvoll aufgesetzt
      if (isPlatformBrowser(this.platformId)) {
        this.checkScrollPosition();
      }
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
          this.resetStateBeforeLoad(); // isLoading wird hier true
          console.log('ProductList: State reset, loading for slug:', slug);
        }
        this.updateTitlesAndBreadcrumbs(lang, this.currentCategory()?.name);
      }),
      filter(([slug]) => {
        if (slug === null) {
          console.warn('ProductList: Slug is null, stopping data loading.');
          this.isLoading.set(false); // Wichtig, falls hier abgebrochen wird
          return false;
        }
        return true;
      })
    );

    const dataLoadingSubscription = paramMapAndLang$.pipe(
      switchMap(([slug, lang]) => {
        if (!slug) { // Sollte durch Filter oben abgedeckt sein, aber sicher ist sicher
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
                map(response => {
                  return {
                    ...response,
                    products: this.filterProductsWithNoImageArray(response.products) // Erster Filter
                  };
                }),
                tap(response => console.log(`ProductList: Fetched and pre-filtered products for category ${category.id}:`, response.products))
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
    ).subscribe(async (result: WooCommerceProductsResponse) => { // async hier für await
      console.log('[PerfTest] API result for initial load:', result.products?.length || 0, 'candidates');
      this.productsCandidateSignal.set(result.products); // Kandidaten setzen
      this.totalProductPages.set(result.totalPages);
      this.hasNextPage.set(this.currentPage() < result.totalPages);

      // NEU: Bildvalidierung starten
      await this.processAndSetDisplayableProducts(result.products, 'initial');
      // isLoading wird in processAndSetDisplayableProducts auf false gesetzt
      // trySetupIntersectionObserver wird auch dort aufgerufen, nachdem displayableProducts gesetzt wurde
    });
    this.subscriptions.add(dataLoadingSubscription);
  }

  // Filtert Produkte, bei denen das 'images'-Array komplett fehlt, leer ist oder kein 'src' hat
  private filterProductsWithNoImageArray(products: WooCommerceProduct[]): WooCommerceProduct[] {
    if (!products) {
      return [];
    }
    return products.filter(product => product.images && product.images.length > 0 && product.images[0]?.src);
  }

  // Hilfsfunktion zum Validieren einer einzelnen Bild-URL
  private async verifyImageLoad(url: string): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) {
      return false; // Auf dem Server können wir Bilder nicht so einfach validieren
    }
    return new Promise((resolve) => {
      if (!url || typeof url !== 'string') { // Zusätzliche Prüfung für ungültige URLs
        resolve(false);
        return;
      }
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => {
        // console.warn(`[PerfTest] Bild konnte nicht geladen werden: ${url}`);
        resolve(false);
      };
      img.src = url;
    });
  }

  // Verarbeitet Kandidatenprodukte: validiert Bilder und setzt `displayableProducts`
  private async processAndSetDisplayableProducts(
    candidateProducts: WooCommerceProduct[],
    mode: 'initial' | 'loadMore'
  ): Promise<void> {
    console.log(`[PerfTest] processAndSetDisplayableProducts called for ${mode} with ${candidateProducts?.length || 0} candidates.`);
    const startTime = performance.now();

    if (mode === 'initial') {
      this.displayableProducts.set([]); // Für den initialen Ladevorgang sicherheitshalber leeren
    }

    if (!candidateProducts || candidateProducts.length === 0) {
      if (mode === 'initial') this.isLoading.set(false);
      if (mode === 'loadMore') this.isLoadingMore.set(false);
      this.cdr.detectChanges();
      const endTime = performance.now();
      console.log(`[PerfTest] processAndSetDisplayableProducts (${mode}) took ${endTime - startTime}ms (no candidates).`);
      if (mode === 'initial') this.trySetupIntersectionObserver(); // Observer trotzdem versuchen aufzusetzen
      return;
    }

    const verificationPromises: Promise<boolean>[] = [];
    const productsForVerification: WooCommerceProduct[] = [];

    candidateProducts.forEach(product => {
      // product.images sollte hier schon existieren und nicht leer sein durch filterProductsWithNoImageArray
      const imageUrl = product.images[0].src; // Annahme: erstes Bild ist das primäre
      verificationPromises.push(this.verifyImageLoad(imageUrl));
      productsForVerification.push(product);
    });

    const results = await Promise.allSettled(verificationPromises);
    const verifiedProducts: WooCommerceProduct[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value === true) {
        verifiedProducts.push(productsForVerification[index]);
      }
    });
    const endTime = performance.now();
    console.log(`[PerfTest] processAndSetDisplayableProducts (${mode}) image verification took ${endTime - startTime}ms. Found ${verifiedProducts.length} displayable products from ${candidateProducts.length}.`);

    if (mode === 'initial') {
      this.displayableProducts.set(verifiedProducts);
      this.isLoading.set(false);
    } else {
      this.displayableProducts.update(current => [...current, ...verifiedProducts]);
      this.isLoadingMore.set(false);
    }
    this.cdr.detectChanges();

    // Intersection Observer Setup/Prüfung
    if (mode === 'initial' || (mode === 'loadMore' && this.hasNextPage())) {
        this.trySetupIntersectionObserver();
    } else if (mode === 'loadMore' && !this.hasNextPage()) {
        this.disconnectObserver(); // Keine weiteren Seiten, Observer entfernen
    }
  }

  private trySetupIntersectionObserver(): void {
    // Nur aufsetzen, wenn es eine nächste Seite geben KÖNNTE und wir nicht gerade laden
    if (this.loadMoreTriggerEl?.nativeElement && this.hasNextPage() && !this.isLoadingMore() && !this.isLoading()) {
      this.setupIntersectionObserver(this.loadMoreTriggerEl.nativeElement);
    } else if (!this.hasNextPage()) { // Wenn es definitiv keine nächste Seite gibt
      this.disconnectObserver();
    }
    // Wenn wir laden, wird der Observer nicht neu aufgesetzt, das passiert nach dem Ladevorgang.
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
    this.productsCandidateSignal.set([]);
    this.displayableProducts.set([]);
    this.isLoading.set(false);
    this.isLoadingMore.set(false);
    this.hasNextPage.set(false);
    this.currentPage.set(1);
    this.totalProductPages.set(1);
    this.categoryTitle.set(this.translocoService.translate('productList.errorPageTitle'));
    this.cdr.detectChanges();
  }

  private resetStateBeforeLoad(): void {
    this.isLoading.set(true); // Haupt-Ladeindikator an
    this.productsCandidateSignal.set([]);
    this.displayableProducts.set([]); // Wichtig: Auch anzeigbare Produkte zurücksetzen
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
    this.disconnectObserver(); // Alten Observer entfernen
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.disconnectObserver();
  }

  private setupIntersectionObserver(targetElement: HTMLElement): void {
    this.disconnectObserver(); // Vorherigen Observer entfernen
    const options = { root: null, rootMargin: '0px 0px 300px 0px', threshold: 0.1 };
    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && this.hasNextPage() && !this.isLoadingMore() && !this.isLoading()) {
          console.log('[PerfTest] IntersectionObserver triggered loadMoreProducts.');
          this.loadMoreProducts();
        }
      });
    }, options);
    this.intersectionObserver.observe(targetElement);
    console.log('[PerfTest] IntersectionObserver setup on', targetElement);
  }

  private disconnectObserver(): void {
    if (this.intersectionObserver) {
      if (this.loadMoreTriggerEl?.nativeElement) {
        this.intersectionObserver.unobserve(this.loadMoreTriggerEl.nativeElement);
         console.log('[PerfTest] IntersectionObserver unobserved', this.loadMoreTriggerEl.nativeElement);
      }
      this.intersectionObserver.disconnect();
      this.intersectionObserver = undefined;
      console.log('[PerfTest] IntersectionObserver disconnected.');
    }
  }

  loadMoreProducts(): void {
    if (!this.hasNextPage() || !this.categorySlugFromRoute || this.isLoadingMore() || !this.currentCategory()?.id || this.isLoading()) {
      // isLoading() check hinzugefügt, um parallele Ladevorgänge zu verhindern
      return;
    }
    this.isLoadingMore.set(true); // Ladeindikator für "Mehr laden"
    const nextPageToLoad = this.currentPage() + 1;

    const loadMoreSub = this.woocommerceService.getProducts(this.currentCategory()!.id, this.PRODUCTS_PER_PAGE, nextPageToLoad)
      .pipe(
        take(1), // Wichtig, um die Subscription nach dem ersten Wert zu beenden
        map(response => {
            return {
              ...response,
              // Erster Filter auf Produkte ohne jegliche Bilddaten
              products: this.filterProductsWithNoImageArray(response.products)
            };
        }),
        catchError(error => {
          console.error('ProductList: Fehler beim API-Aufruf für weitere Produkte:', error);
          this.isLoadingMore.set(false); // Ladeindikator aus
          return of(null); // Gibt null zurück, um den Stream nicht abzubrechen, aber Fehler zu signalisieren
        })
      )
      .subscribe(async (response: WooCommerceProductsResponse | null) => { // async hier
        if (response && response.products) {
          console.log(`[PerfTest] API result for more products (page ${nextPageToLoad}):`, response.products.length, "candidates");
          // Kandidaten zu bestehenden Kandidaten hinzufügen (falls benötigt, aber hier nicht direkt verwendet für Anzeige)
          // this.productsCandidateSignal.update(current => [...current, ...response.products]);

          // Paginierungsstatus basierend auf Server-Antwort aktualisieren
          this.currentPage.set(nextPageToLoad);
          this.totalProductPages.set(response.totalPages); // Server-Gesamtseiten
          this.hasNextPage.set(nextPageToLoad < response.totalPages); // Basiert auf Server-Gesamtseiten

          // NEU: Bildvalidierung für die neu geladenen Produkte
          await this.processAndSetDisplayableProducts(response.products, 'loadMore');
        } else if (response === null) { // Fehlerfall aus catchError
            this.isLoadingMore.set(false); // Sicherstellen, dass Ladeindikator aus ist
        } else { // Keine Produkte oder keine Antwort (sollte durch API-Fehlerbehandlung abgedeckt sein)
            this.isLoadingMore.set(false);
            this.hasNextPage.set(false); // Keine weiteren Produkte zu erwarten
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

  // Diese Methode kann beibehalten werden, falls sie im Template direkt für etwas genutzt wird,
  // ist aber für die Filterlogik nicht mehr primär zuständig.
  getProductImage(product: WooCommerceProduct): string | undefined {
    return product.images && product.images.length > 0 && product.images[0]?.src ? product.images[0].src : undefined;
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
      if (product.price) { // Fallback für variable Produkte, wenn price_html keine Spanne liefert
        return { min: product.price, max: product.price };
      }
    }
    // Für einfache Produkte oder wenn keine Spanne extrahiert werden kann
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

  // WICHTIG für *ngFor Performance bei sich ändernden Listen
  trackProductById(index: number, product: WooCommerceProduct): number {
    return product.id;
  }
}