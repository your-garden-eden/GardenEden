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

// ENTFERNT: Komponenten-Import für MiniCartComponent
// import { MiniCartComponent } from '../mini-cart/mini-cart.component';

// Services & Daten
import { AuthService, WordPressUser } from '../../../shared/services/auth.service';
import { CartService } from '../../../shared/services/cart.service';
import { UiStateService } from '../../../shared/services/ui-state.service'; // Bleibt für Login-Overlay etc.
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
    // ENTFERNT: MiniCartComponent, // Da es nicht mehr im Template ist
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

  // ENTFERNT: isMiniCartOpen$: Signal<boolean> = this.uiStateService.isMiniCartOpen$;
  isWishlistEmpty: Signal<boolean> = this.wishlistService.isEmpty;
  isLoggedIn$: Observable<boolean> = this.authService.isLoggedIn$;

  searchControl = new FormControl(''); // FormControl kann string | null emittieren
  searchResults: WritableSignal<WooCommerceProduct[]> = signal([]);
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
  private currentSearchTerm: string | null = null; // Bleibt string | null für interne Zwecke
  private readonly SEARCH_RESULTS_PER_PAGE = 8;

  constructor() {
    effect(() => {
      const searchValue = this.searchControl.value;
      if (searchValue === '' || searchValue === null) { // Expliziter Check für null
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
          // ENTFERNT: Logik bezüglich MiniCart bei Screen-Wechsel
          // if (this.isMobileScreen() && this.isMiniCartOpen$()) { // isMiniCartOpen$ existiert nicht mehr
          //   this.uiStateService.closeMiniCart(); // Methode existiert ggf. nicht mehr im UiStateService
          // }
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
      if (this.searchError()) {
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
          this.isSearchLoading.set(true);
          this.isSearchLoadingMore.set(false);
          this.isSearchOverlayVisible.set(true);
          this.searchResults.set([]);
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
            catchError(err => {
              console.error('Fehler bei initialer Produktsuche:', err);
              this.searchError.set(this.translocoService.translate('header.searchError'));
              this.currentSearchTerm = null;
              this.isSearchOverlayVisible.set(true);
              return of({ products: [], totalPages: 0, totalCount: 0 } as WooCommerceProductsResponse);
            }),
            tap((response: WooCommerceProductsResponse) => {
              this.totalSearchPages.set(response.totalPages);
            }),
            map((response: WooCommerceProductsResponse) => response.products),
            finalize(() => {
                this.isSearchLoading.set(false);
                this.cdr.markForCheck();
            })
          );
        })
      )
      .subscribe((results: WooCommerceProduct[]) => {
        this.searchResults.set(results);
      });
    this.subscriptions.add(searchSub);
  }

  onSearchFocus(): void {
    const currentSearchValue = this.searchControl.value;
    if (currentSearchValue && currentSearchValue.length > 2) {
      this.isSearchOverlayVisible.set(true);
    }
  }

  clearSearch(): void {
    this.searchControl.setValue('');
  }

  closeSearchOverlay(clearInput: boolean = true): void {
    if (clearInput) {
        this.searchControl.setValue('', { emitEvent: false });
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
        // ENTFERNT: Aufruf von this.uiStateService.closeMiniCart();
      });
    this.subscriptions.add(routeSub);
  }

  toggleLoginOverlay(event?: MouseEvent): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.uiStateService.toggleLoginOverlay();
    if (this.isMobileMenuOpen) this.closeMobileMenu();
  }

  // ENTFERNT: onCartIconMouseEnter Methode
  // onCartIconMouseEnter(): void {
  //   if (!this.isMobileScreen()) {
  //     this.uiStateService.openMiniCart();
  //   }
  // }

  // ENTFERNT: onCartIconMouseLeave Methode
  // onCartIconMouseLeave(): void {
  //   if (!this.isMobileScreen()) {
  //     this.uiStateService.startCloseTimeout(300);
  //   }
  // }

  performLogout(): void {
    this.closeMobileMenu();
    this.authService.logout().subscribe({
        next: () => {
            this.router.navigate(['/'], { queryParams: { loggedOut: 'true' } });
        },
        error: (error) => {
             console.error('Header: Fehler beim Logout im Service:', error);
             this.router.navigate(['/']);
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
    if (!this.isMobileMenuOpen) {
      this.navItems.forEach(item => (item.isExpanded = false));
    }
  }

  closeMobileMenu(): void {
    if (this.isMobileMenuOpen) {
      this.isMobileMenuOpen = false;
      if (isPlatformBrowser(this.platformId)) {
        this.renderer.removeStyle(document.body, 'overflow');
      }
      this.navItems.forEach(item => (item.isExpanded = false));
    }
  }

  toggleSubmenu(item: NavItem): void {
    item.isExpanded = !item.isExpanded;
  }

  getSearchResultLink(product: WooCommerceProduct): string {
    return `/product/${product.slug}`;
  }

  getSearchResultImage(product: WooCommerceProduct): string | undefined {
    return product.images && product.images.length > 0 ? product.images[0].src : undefined;
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
      .set('search', this.currentSearchTerm) // currentSearchTerm ist hier sicher string
      .set('per_page', this.SEARCH_RESULTS_PER_PAGE.toString());

    this.woocommerceService.getProducts(undefined, this.SEARCH_RESULTS_PER_PAGE, nextPageToLoad, params)
      .pipe(
        take(1),
        catchError(err => {
          console.error('Fehler beim Nachladen weiterer Suchergebnisse:', err);
          return of(null);
        }),
        finalize(() => {
          this.isSearchLoadingMore.set(false);
          this.cdr.markForCheck();
        })
      )
      .subscribe((response: WooCommerceProductsResponse | null) => {
        if (response && response.products && response.products.length > 0) {
          this.searchResults.update(currentResults => [...currentResults, ...response.products]);
          this.currentSearchPage.set(nextPageToLoad);
        }
      });
  }

  onSearchOverlayScroll(event: Event): void {
    const target = event.target as HTMLElement;
    const threshold = 80;
    const nearBottom = target.scrollTop + target.offsetHeight + threshold >= target.scrollHeight;

    if (nearBottom) {
      if (this.currentSearchPage() < this.totalSearchPages() && !this.isSearchLoadingMore() && !this.isSearchLoading()) {
        this.loadMoreSearchResults();
      }
    }
  }
}