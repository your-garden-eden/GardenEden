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
import { RouterModule, Router, RouterLinkActive, NavigationEnd } from '@angular/router';
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
  map, // map importiert
} from 'rxjs/operators';
import { User } from '@angular/fire/auth';
import { ReactiveFormsModule, FormControl, FormsModule } from '@angular/forms';

// Komponenten
import { MiniCartComponent } from '../mini-cart/mini-cart.component';

// Services & Daten
import { AuthService } from '../../../shared/services/auth.service';
import { CartService } from '../../../shared/services/cart.service';
import { UiStateService } from '../../../shared/services/ui-state.service';
import { WishlistService } from '../../../shared/services/wishlist.service';
import { navItems, NavItem } from '../../../core/data/navigation.data';
import {
  WoocommerceService,
  WooCommerceProduct,
  WooCommerceProductsResponse, // Importiert
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
    MiniCartComponent,
    TranslocoModule,
  ],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
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

  currentUser$: Observable<User | null> = this.authService.authState$;
  itemCount$: Signal<number> = this.cartService.cartItemCount;
  isMobileMenuOpen = false;
  public navItems = navItems;

  isMiniCartOpen$: Signal<boolean> = this.uiStateService.isMiniCartOpen$;
  isWishlistEmpty: Signal<boolean> = this.wishlistService.isEmpty;
  isLoggedIn$: Observable<boolean> = this.authService.isLoggedIn();

  searchControl = new FormControl('');
  searchResults: WritableSignal<WooCommerceProduct[]> = signal([]);
  isSearchLoading: WritableSignal<boolean> = signal(false);
  isSearchOverlayVisible: WritableSignal<boolean> = signal(false);
  searchError: WritableSignal<string | null> = signal(null);
  private subscriptions = new Subscription();

  isMobileScreen: WritableSignal<boolean> = signal(false);

  availableLangsSignal: WritableSignal<{ id: string; label: string }[]> = signal([]);
  activeLang: WritableSignal<string> = signal(this.translocoService.getActiveLang());

  constructor() {
    effect(() => {
      if (this.searchControl.value === '') {
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
          if (this.isMobileScreen() && this.isMiniCartOpen$()) {
            this.uiStateService.closeMiniCart();
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
        filter(term => {
          if (!term || (term as string).length < 3) {
            this.searchResults.set([]);
            if (!(term as string)) {
                this.closeSearchOverlay(false);
            }
            return false;
          }
          return true;
        }),
        debounceTime(400),
        distinctUntilChanged(),
        tap(() => {
          this.isSearchLoading.set(true);
          this.isSearchOverlayVisible.set(true);
          this.searchResults.set([]);
          this.searchError.set(null);
        }),
        switchMap(term => {
          const params = new HttpParams().set('search', term as string).set('per_page', '8');
          return this.woocommerceService.getProducts(undefined, 8, 1, params).pipe(
            catchError(err => {
              console.error('Fehler bei Produktsuche:', err);
              this.searchError.set(this.translocoService.translate('header.searchError'));
              // return of([] as WooCommerceProduct[]); // Alt
              return of({ products: [], totalPages: 0, totalCount: 0 } as WooCommerceProductsResponse); // KORRIGIERT: Gibt das Response-Objekt zurück
            }),
            map((response: WooCommerceProductsResponse) => response.products), // *** KORRIGIERT: Produkte hier extrahieren ***
            finalize(() => {
                this.isSearchLoading.set(false);
                this.cdr.markForCheck();
            })
          );
        })
      )
      .subscribe((results: WooCommerceProduct[]) => { // *** Erwartet jetzt WooCommerceProduct[] ***
        this.searchResults.set(results);
      });
    this.subscriptions.add(searchSub);
  }

  onSearchFocus(): void {
    if (this.searchControl.value && (this.searchControl.value as string).length > 2) {
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
    this.searchError.set(null);
    this.searchResults.set([]);
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
        this.uiStateService.closeMiniCart();
      });
    this.subscriptions.add(routeSub);
  }

  toggleLoginOverlay(event?: MouseEvent): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.uiStateService.toggleLoginOverlay();
    if (this.isMobileMenuOpen) this.closeMobileMenu();
  }

  onCartIconMouseEnter(): void {
    if (!this.isMobileScreen()) {
      this.uiStateService.openMiniCart();
    }
  }

  onCartIconMouseLeave(): void {
    if (!this.isMobileScreen()) {
      this.uiStateService.startCloseTimeout(300);
    }
  }

  async performLogout(): Promise<void> {
    this.closeMobileMenu();
    try {
      await this.authService.logout();
      this.router.navigate(['/'], { queryParams: { loggedOut: 'true' } });
    } catch (error) {
      console.error('Fehler beim Logout:', error);
    }
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
}