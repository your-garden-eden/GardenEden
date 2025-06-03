// /src/app/shared/components/header/header.component.ts
import {
  Component,
  inject,
  Renderer2,
  PLATFORM_ID,
  OnDestroy,
  Signal,
  OnInit,
  WritableSignal,
  signal,
  effect,
  ChangeDetectionStrategy,
  computed,
  ChangeDetectorRef,
} from '@angular/core';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { CommonModule, isPlatformBrowser, AsyncPipe } from '@angular/common';
import { Observable, Subscription, of } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  tap,
  switchMap,
  catchError,
  startWith,
  finalize,
  map,
  take,
} from 'rxjs/operators';
import { ReactiveFormsModule, FormControl, FormsModule } from '@angular/forms';

// Services & Daten
import { AuthService, WordPressUser } from '../../../shared/services/auth.service';
import { CartService } from '../../../shared/services/cart.service';
import { UiStateService } from '../../../shared/services/ui-state.service';
import { WishlistService } from '../../../shared/services/wishlist.service';
import { navItems, NavItem } from '../../../core/data/navigation.data';
import {
  WoocommerceService,
  WooCommerceProduct,
  WooCommerceProductsResponse,
} from '../../../core/services/woocommerce.service';

// Breakpoint-Erkennung
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';

// Transloco
import { TranslocoModule, TranslocoService, LangDefinition } from '@ngneat/transloco';
import { HttpParams } from '@angular/common/http';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    AsyncPipe,
    TranslocoModule,
  ],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent implements OnInit, OnDestroy {
  public authService = inject(AuthService);
  public cartService = inject(CartService);
  public uiStateService = inject(UiStateService);
  private wishlistService = inject(WishlistService);
  private router = inject(Router);
  private renderer = inject(Renderer2);
  private platformId = inject(PLATFORM_ID);
  private woocommerceService = inject(WoocommerceService);
  private breakpointObserver = inject(BreakpointObserver);
  private cdr = inject(ChangeDetectorRef);
  public translocoService = inject(TranslocoService);

  currentUser$: Observable<WordPressUser | null> = this.authService.currentWordPressUser$;
  itemCount$: Signal<number> = this.cartService.cartItemCount;
  isMobileMenuOpen = false;
  public navItems = navItems;

  isWishlistEmpty: Signal<boolean> = this.wishlistService.isEmpty;
  isLoggedIn$: Observable<boolean> = this.authService.isLoggedIn$;

  searchControl = new FormControl('');
  searchResults: WritableSignal<WooCommerceProduct[]> = signal([]); // Wird mit validierten Produkten befüllt
  isSearchLoading: WritableSignal<boolean> = signal(false);
  isSearchLoadingMore: WritableSignal<boolean> = signal(false);
  isSearchOverlayVisible: WritableSignal<boolean> = signal(false);
  searchError: WritableSignal<string | null> = signal(null);
  private subscriptions = new Subscription();

  isMobileScreen: WritableSignal<boolean> = signal(false);

  availableLangsSignal: WritableSignal<{ id: string; label: string }[]> = signal([]);
  activeLang: WritableSignal<string> = signal(this.translocoService.getActiveLang());

  private currentSearchPage: WritableSignal<number> = signal(1);
  private totalSearchPages: WritableSignal<number> = signal(1);
  private currentSearchTerm: string | null = null;
  private readonly SEARCH_RESULTS_PER_PAGE = 8;

  constructor() {
    effect(() => {
      const searchValue = this.searchControl.value;
      if (searchValue === '' || searchValue === null) {
        this.closeSearchOverlay(false);
      }
    });

    if (isPlatformBrowser(this.platformId)) {
      const breakpointSubscription = this.breakpointObserver
        .observe([
          Breakpoints.XSmall,
          Breakpoints.Small,
          `(max-width: ${this.getMobileBreakpoint()}px)`,
        ])
        .subscribe(result => {
          const wasMobile = this.isMobileScreen();
          this.isMobileScreen.set(result.matches);
          if (wasMobile && !this.isMobileScreen() && this.isMobileMenuOpen) {
            this.closeMobileMenu();
          }
          this.cdr.markForCheck();
        });
      this.subscriptions.add(breakpointSubscription);
    }
  }

  private getMobileBreakpoint(): number {
    return 1024;
  }

  ngOnInit(): void {
    this.setupSearchDebounce();
    this.setupRouteListener();
    this.setupLanguageOptions();

    const langChangeSub = this.translocoService.langChanges$.subscribe(currentLang => {
      this.activeLang.set(currentLang);
      if (this.searchError()) { // Nur übersetzen, wenn ein Fehler vorliegt
        this.searchError.set(this.translocoService.translate('header.searchError'));
      }
      this.cdr.markForCheck();
    });
    this.subscriptions.add(langChangeSub);
  }

  private setupLanguageOptions(): void {
    const rawLangs = this.translocoService.getAvailableLangs();
    const langsArray = Array.isArray(rawLangs) ? rawLangs : (typeof rawLangs === 'object' && rawLangs !== null ? Object.keys(rawLangs) : [rawLangs as LangDefinition]);

    const formattedLangs = langsArray.map(langInput => {
      const langId = typeof langInput === 'string' ? langInput : (langInput as LangDefinition).id;
      let label = langId.toUpperCase();
      switch (langId) {
        case 'de': label = 'Deutsch'; break;
        case 'en': label = 'English'; break;
        case 'hr': label = 'Hrvatski'; break;
        case 'es': label = 'Español'; break;
        case 'pl': label = 'Polski'; break;
      }
      return { id: langId, label: label };
    });
    this.availableLangsSignal.set(formattedLangs.filter(lang => lang.id));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  changeLanguage(langId: string): void {
    if (langId) {
      this.translocoService.setActiveLang(langId);
      if (this.isMobileMenuOpen) {
        this.closeMobileMenu();
      }
    }
  }

  // --- NEUE Hilfsfunktionen für Bildvalidierung ---
  private filterProductsWithNoImageArray(products: WooCommerceProduct[]): WooCommerceProduct[] {
    if (!products) return [];
    return products.filter(product => product.images && product.images.length > 0 && product.images[0]?.src);
  }

  private async verifyImageLoad(url: string): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) return false;
    return new Promise((resolve) => {
      if (!url || typeof url !== 'string') {
        resolve(false);
        return;
      }
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  private async processAndSetSearchResults(
    candidateProducts: WooCommerceProduct[],
    mode: 'initial' | 'loadMore'
  ): Promise<void> {
    console.log(`[PerfTest HeaderSearch] processAndSet called for ${mode} with ${candidateProducts?.length || 0} candidates.`);
    const startTime = performance.now();

    if (mode === 'initial') {
      this.searchResults.set([]);
    }

    if (!candidateProducts || candidateProducts.length === 0) {
      if (mode === 'initial') this.isSearchLoading.set(false);
      if (mode === 'loadMore') this.isSearchLoadingMore.set(false);
      this.cdr.markForCheck();
      const endTime = performance.now();
      console.log(`[PerfTest HeaderSearch] processAndSet (${mode}) took ${endTime - startTime}ms (no candidates).`);
      return;
    }

    const verificationPromises: Promise<boolean>[] = [];
    const productsForVerification: WooCommerceProduct[] = [];

    candidateProducts.forEach(product => {
      const imageUrl = product.images[0].src; // Annahme: product ist bereits durch filterProductsWithNoImageArray gegangen
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
    console.log(`[PerfTest HeaderSearch] processAndSet (${mode}) image verification took ${endTime - startTime}ms. Found ${verifiedProducts.length} displayable from ${candidateProducts.length}.`);

    if (mode === 'initial') {
      this.searchResults.set(verifiedProducts);
      this.isSearchLoading.set(false);
    } else {
      this.searchResults.update(current => [...current, ...verifiedProducts]);
      this.isSearchLoadingMore.set(false);
    }
    this.cdr.markForCheck();
  }
  // --- ENDE Hilfsfunktionen ---

  private setupSearchDebounce(): void {
    const searchSub = this.searchControl.valueChanges
      .pipe(
        filter((termValue: string | null): termValue is string => {
          if (termValue === null || termValue.length < 3) {
            this.searchResults.set([]);
            this.isSearchLoading.set(false);
            this.isSearchLoadingMore.set(false);
            this.currentSearchPage.set(1);
            this.totalSearchPages.set(1);
            this.currentSearchTerm = null;
            if (termValue === null || termValue === '') {
                this.closeSearchOverlay(false);
            }
            return false;
          }
          return true;
        }),
        debounceTime(400),
        distinctUntilChanged(),
        tap((term: string) => {
          this.isSearchLoading.set(true); // Haupt-Ladeindikator für Suche an
          this.isSearchLoadingMore.set(false);
          this.isSearchOverlayVisible.set(true);
          this.searchResults.set([]); // Leeren für neue Suche, wird durch processAndSet... befüllt
          this.searchError.set(null);
          this.currentSearchPage.set(1);
          this.totalSearchPages.set(1);
          this.currentSearchTerm = term;
        }),
        switchMap((term: string) => {
          const params = new HttpParams()
            .set('search', term)
            .set('per_page', this.SEARCH_RESULTS_PER_PAGE.toString());
          return this.woocommerceService.getProducts(undefined, this.SEARCH_RESULTS_PER_PAGE, 1, params).pipe(
            map(response => ({ // Erster Filter hier
              ...response,
              products: this.filterProductsWithNoImageArray(response.products)
            })),
            catchError(err => {
              console.error('Fehler bei initialer Produktsuche:', err);
              this.searchError.set(this.translocoService.translate('header.searchError'));
              this.currentSearchTerm = null;
              this.isSearchOverlayVisible.set(true); // Overlay bei Fehler offen lassen
              this.isSearchLoading.set(false); // Wichtig: Ladezustand beenden
              return of({ products: [], totalPages: 0, totalCount: 0 } as WooCommerceProductsResponse);
            }),
            tap((response: WooCommerceProductsResponse) => { // response enthält hier bereits vor-gefilterte Produkte
              this.totalSearchPages.set(response.totalPages); // Basiert auf Server-Daten
            })
            // finalize wird hier nicht mehr benötigt, isSearchLoading wird in processAndSet... oder catchError gesteuert
          );
        })
      )
      .subscribe(async (responseWithCandidates: WooCommerceProductsResponse) => {
        // responseWithCandidates.products sind die Kandidaten nach dem ersten Filter
        if (responseWithCandidates.products) {
          await this.processAndSetSearchResults(responseWithCandidates.products, 'initial');
        } else { // Sollte durch catchError abgedeckt sein
          this.isSearchLoading.set(false);
        }
      });
    this.subscriptions.add(searchSub);
  }

  onSearchFocus(): void {
    const currentSearchValue = this.searchControl.value;
    if (currentSearchValue && currentSearchValue.length > 2 && this.searchResults().length > 0) { // Zeige Overlay nur, wenn es Ergebnisse gibt oder gerade gesucht wird
      this.isSearchOverlayVisible.set(true);
    } else if (currentSearchValue && currentSearchValue.length > 2 && !this.searchError()) {
        // Wenn gesucht wird aber noch keine Ergebnisse/Fehler da sind (z.B. nach Tippen)
        this.isSearchOverlayVisible.set(true);
    }
  }

  clearSearch(): void {
    this.searchControl.setValue(''); // Löst valueChanges aus, was closeSearchOverlay indirekt aufruft
  }

  closeSearchOverlay(clearInput: boolean = true): void {
    if (clearInput) {
        this.searchControl.setValue('', { emitEvent: false }); // Verhindert erneutes Auslösen von valueChanges
    }
    this.isSearchOverlayVisible.set(false);
    this.isSearchLoading.set(false);
    this.isSearchLoadingMore.set(false);
    this.searchError.set(null);
    this.searchResults.set([]);
    this.currentSearchPage.set(1);
    this.totalSearchPages.set(1);
    this.currentSearchTerm = null;
  }

  onSearchResultClick(): void {
    this.closeSearchOverlay();
  }

  private setupRouteListener(): void {
    const routeSub = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.closeSearchOverlay();
        this.closeMobileMenu();
        this.uiStateService.closeLoginOverlay();
      });
    this.subscriptions.add(routeSub);
  }

  toggleLoginOverlay(event?: MouseEvent): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.uiStateService.toggleLoginOverlay();
    if (this.isMobileMenuOpen) this.closeMobileMenu();
  }

  performLogout(): void {
    this.closeMobileMenu();
    this.authService.logout().subscribe({
        next: () => {
            this.router.navigate(['/'], { queryParams: { loggedOut: 'true' } });
        },
        error: (error) => {
             console.error('Header: Fehler beim Logout im Service:', error);
             this.router.navigate(['/']); // Fallback
        }
    });
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    if (isPlatformBrowser(this.platformId)) {
      if (this.isMobileMenuOpen) {
        this.renderer.setStyle(document.body, 'overflow', 'hidden');
      } else {
        this.renderer.removeStyle(document.body, 'overflow');
      }
    }
    if (!this.isMobileMenuOpen) { // Reset submenu states when closing main mobile menu
      this.navItems.forEach(item => (item.isExpanded = false));
    }
  }

  closeMobileMenu(): void {
    if (this.isMobileMenuOpen) {
      this.isMobileMenuOpen = false;
      if (isPlatformBrowser(this.platformId)) {
        this.renderer.removeStyle(document.body, 'overflow');
      }
      this.navItems.forEach(item => (item.isExpanded = false)); // Reset submenu states
    }
  }

  toggleSubmenu(item: NavItem): void {
    item.isExpanded = !item.isExpanded;
  }

  getSearchResultLink(product: WooCommerceProduct): string {
    return `/product/${product.slug}`;
  }

  getSearchResultImage(product: WooCommerceProduct): string | undefined {
    // Die Produkte in searchResults() sollten bereits validierte Bilder haben.
    // Diese Methode liefert nur die URL für das Template.
    return product.images && product.images.length > 0 && product.images[0]?.src ? product.images[0].src : undefined;
  }

  loadMoreSearchResults(): void {
    if (this.isSearchLoading() || this.isSearchLoadingMore() || !this.currentSearchTerm) {
      return;
    }
    if (this.currentSearchPage() >= this.totalSearchPages()) {
      return;
    }

    this.isSearchLoadingMore.set(true);
    const nextPageToLoad = this.currentSearchPage() + 1;
    const params = new HttpParams()
      .set('search', this.currentSearchTerm)
      .set('per_page', this.SEARCH_RESULTS_PER_PAGE.toString());

    this.woocommerceService.getProducts(undefined, this.SEARCH_RESULTS_PER_PAGE, nextPageToLoad, params)
      .pipe(
        take(1),
        map(response => ({ // Erster Filter
          ...response,
          products: this.filterProductsWithNoImageArray(response.products)
        })),
        catchError(err => {
          console.error('Fehler beim Nachladen weiterer Suchergebnisse:', err);
          this.isSearchLoadingMore.set(false); // Wichtig: Ladezustand beenden
          return of(null);
        })
        // finalize nicht mehr hier, da isSearchLoadingMore in processAndSet... oder catchError gesteuert wird
      )
      .subscribe(async (response: WooCommerceProductsResponse | null) => {
        if (response && response.products) {
          // totalSearchPages wird bei der initialen Suche gesetzt und hier nicht mehr angepasst
          this.currentSearchPage.set(nextPageToLoad);
          await this.processAndSetSearchResults(response.products, 'loadMore');
        } else { // Fehlerfall oder keine Produkte
          this.isSearchLoadingMore.set(false);
        }
      });
  }

  onSearchOverlayScroll(event: Event): void {
    const target = event.target as HTMLElement;
    const threshold = 80; // Wie weit vom Boden entfernt soll nachgeladen werden (in px)
    const nearBottom = target.scrollTop + target.offsetHeight + threshold >= target.scrollHeight;

    if (nearBottom) {
      if (this.currentSearchPage() < this.totalSearchPages() && !this.isSearchLoadingMore() && !this.isSearchLoading()) {
        this.loadMoreSearchResults();
      }
    }
  }
}