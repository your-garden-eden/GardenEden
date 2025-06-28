import {
  Component, inject, Renderer2, PLATFORM_ID, OnDestroy, Signal, OnInit,
  WritableSignal, signal, ChangeDetectionStrategy, computed, ChangeDetectorRef, ElementRef, ViewChild, HostListener, HostBinding
} from '@angular/core';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { CommonModule, isPlatformBrowser, AsyncPipe } from '@angular/common';
import { Observable, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ReactiveFormsModule, FormControl, FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';

import { AuthService, WordPressUser } from '../../../shared/services/auth.service';
import { CartService } from '../../../shared/services/cart.service';
import { UiStateService } from '../../../shared/services/ui-state.service';
import { WishlistService } from '../../../shared/services/wishlist.service';
import { navItems, NavItem } from '../../../core/data/navigation.data';
import { WooCommerceProduct } from '../../../core/services/woocommerce.service';
import { TrackingService } from '../../../core/services/tracking.service';
import { SearchStateService } from '../../../core/services/search-state.service';
import { FilterStateService } from '../../../core/services/filter-state.service';
import { FilterComponent } from '../filter/filter.component';

import { BreakpointObserver } from '@angular/cdk/layout';
import { TranslocoModule, TranslocoService, LangDefinition } from '@ngneat/transloco';
import { LoadingSpinnerComponent } from '../loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ReactiveFormsModule, FormsModule, AsyncPipe,
    TranslocoModule, LoadingSpinnerComponent, FilterComponent,
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
  public searchStateService = inject(SearchStateService);
  public filterStateService = inject(FilterStateService);
  private router = inject(Router);
  private renderer = inject(Renderer2);
  private platformId = inject(PLATFORM_ID);
  private breakpointObserver = inject(BreakpointObserver);
  private cdr = inject(ChangeDetectorRef);
  public translocoService = inject(TranslocoService);
  private trackingService = inject(TrackingService);
  private hostElement = inject(ElementRef);

  // KORREKTUR: Die Klasse wird jetzt an das Host-Element gebunden
  @HostBinding('class.mobile-menu-active')
  isMobileMenuOpen = false;

  currentUser$: Observable<WordPressUser | null> = this.authService.currentWordPressUser$;
  itemCount$: Signal<number> = this.cartService.cartItemCount;
  wishlistItemCount: Signal<number> = this.wishlistService.wishlistItemCount;
  isLoggedIn: Signal<boolean> = toSignal(this.authService.isLoggedIn$, { initialValue: false });

  public navItems = navItems;
  isMobile: WritableSignal<boolean> = signal(false);
  isSearchOverlayVisible: WritableSignal<boolean> = signal(false);

  availableLangsSignal: WritableSignal<{ id: string; label: string }[]> = signal([]);
  activeLang: WritableSignal<string> = signal(this.translocoService.getActiveLang());
  searchControl = new FormControl('');
  private subscriptions = new Subscription();

  constructor() {
    this.setupBreakpointObserver();
  }

  ngOnInit(): void {
    const searchSub = this.searchControl.valueChanges.subscribe(term => {
      this.searchStateService.searchTrigger$.next(term);
    });
    this.subscriptions.add(searchSub);
    this.setupRouteListener();
    this.setupLanguageOptions();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  @HostListener('document:click', ['$event'])
  handleClickOutside(event: Event) {
    if (this.isSearchOverlayVisible() && !this.hostElement.nativeElement.contains(event.target)) {
      this.isSearchOverlayVisible.set(false);
    }
  }

  private getMobileBreakpoint(): number { return 1024; }

  private setupBreakpointObserver(): void {
    if (isPlatformBrowser(this.platformId)) {
      const breakpointSubscription = this.breakpointObserver
        .observe([`(max-width: ${this.getMobileBreakpoint()}px)`])
        .subscribe(result => {
          this.isMobile.set(result.matches);
          if (!result.matches) {
            if(this.isMobileMenuOpen) this.closeMobileMenu();
            if(this.isSearchOverlayVisible()) this.isSearchOverlayVisible.set(false);
          }
          this.cdr.markForCheck();
        });
      this.subscriptions.add(breakpointSubscription);
    }
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

  changeLanguage(langId: string): void {
    if (langId) {
      this.translocoService.setActiveLang(langId);
      if (isPlatformBrowser(this.platformId)) localStorage.setItem('transloco-lang', langId);
      if (this.isMobileMenuOpen) this.closeMobileMenu();
    }
  }

  clearSearch(): void {
    this.searchControl.setValue('');
    this.searchStateService.searchTrigger$.next('');
  }

  toggleSearchOverlay(event?: MouseEvent): void {
    event?.stopPropagation();
    this.isSearchOverlayVisible.update(v => !v);
    this.closeMobileMenu();
  }

  onDesktopSearchFocus(event: FocusEvent): void {
    if (!this.isMobile()) {
      event.stopPropagation();
      this.isSearchOverlayVisible.set(true);
    }
  }
  
  closeAllOverlays(): void {
    this.isSearchOverlayVisible.set(false);
    this.closeMobileMenu();
  }

  private setupRouteListener(): void {
    const routeSub = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.closeAllOverlays();
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
      next: () => this.router.navigate(['/'], { queryParams: { loggedOut: 'true' } }),
      error: (error) => {
        console.error('Header: Fehler beim Logout im Service:', error);
        this.router.navigate(['/']);
      }
    });
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    if (this.isMobileMenuOpen) {
      this.isSearchOverlayVisible.set(false);
    }
    if (isPlatformBrowser(this.platformId)) {
      this.renderer.setStyle(document.body, 'overflow', this.isMobileMenuOpen ? 'hidden' : '');
    }
    if (!this.isMobileMenuOpen) {
      this.navItems.forEach(item => (item.isExpanded = false));
    }
  }

  closeMobileMenu(): void {
    if (this.isMobileMenuOpen) {
      this.isMobileMenuOpen = false;
      if (isPlatformBrowser(this.platformId)) this.renderer.removeStyle(document.body, 'overflow');
      this.navItems.forEach(item => (item.isExpanded = false));
    }
  }

  toggleSubmenu(item: NavItem): void {
    item.isExpanded = !item.isExpanded;
  }

  trackCategoryClick(categoryI18nKey: string): void {
    const categoryName = this.translocoService.translate(categoryI18nKey);
    this.trackingService.trackCategoryView(categoryName);
  }

  getSearchResultLink(product: WooCommerceProduct): string { return `/product/${product.slug}`; }
  getSearchResultImage(product: WooCommerceProduct): string | undefined { return product.images?.[0]?.src; }

  getCategoryNameBySlug(slug: string | null): string {
    if (!slug) return '';
    const option = this.filterStateService.categoryOptions().find(o => o.slug === slug);
    return option ? this.translocoService.translate(option.i18nId) : '';
  }

  removeFilterAndSearch(filterType: 'price' | 'inStock' | 'category'): void {
    if (filterType === 'price') this.filterStateService.setPriceRange(null, null);
    else if (filterType === 'inStock') this.filterStateService.setInStockOnly(false);
    else if (filterType === 'category') this.filterStateService.selectCategory(null);
    this.searchStateService.applyFiltersAndSearch();
  }
}