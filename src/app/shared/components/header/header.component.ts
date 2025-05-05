import { Component, inject, Renderer2, Inject, PLATFORM_ID, OnDestroy, Signal, OnInit, WritableSignal, signal, effect, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule, Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Observable, Subscription, Subject, debounceTime, distinctUntilChanged, switchMap, filter, tap, catchError, EMPTY } from 'rxjs';
import { User } from '@angular/fire/auth';
import { ReactiveFormsModule, FormControl } from '@angular/forms';

import { AuthService } from '../../../shared/services/auth.service';
import { CartService } from '../../../shared/services/cart.service';
import { UiStateService } from '../../../shared/services/ui-state.service';
import { navItems, NavItem } from '../../../core/data/navigation.data';
import { ShopifyService, Product } from '../../../core/services/shopify.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule
   ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeaderComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  public cartService = inject(CartService);
  private uiStateService = inject(UiStateService);
  private router = inject(Router);
  private renderer = inject(Renderer2);
  @Inject(PLATFORM_ID) private platformId = inject(PLATFORM_ID);
  private shopifyService = inject(ShopifyService);

  currentUser$: Observable<User | null> = this.authService.authState$;
  itemCount$: Signal<number> = this.cartService.cartItemCount;
  isMobileMenuOpen = false;
  public navItems = navItems;

  searchControl = new FormControl('');
  private destroy$ = new Subject<void>();
  searchResults: WritableSignal<Product[]> = signal([]);
  isSearchLoading: WritableSignal<boolean> = signal(false);
  isSearchOverlayVisible: WritableSignal<boolean> = signal(false);
  searchError: WritableSignal<string | null> = signal(null);

  private subscriptions = new Subscription();

  constructor() {
    effect(() => {
      if (this.searchControl.value === '') {
        this.closeSearchOverlay();
        this.searchResults.set([]);
      }
    });
  }

  ngOnInit(): void {
    this.setupSearchDebounce();
    this.setupRouteListener();
  }

  ngOnDestroy(): void {
     this.subscriptions.unsubscribe();
     this.destroy$.next();
     this.destroy$.complete();
  }

  private setupSearchDebounce(): void {
    this.subscriptions.add( // Füge die Subscription dem Container hinzu
        this.searchControl.valueChanges.pipe(
        debounceTime(400),
        distinctUntilChanged(),
        filter(term => !!term && term.length > 2),
        tap(() => {
          this.isSearchLoading.set(true);
          this.isSearchOverlayVisible.set(true);
          this.searchResults.set([]);
          this.searchError.set(null);
        }),
        switchMap(term =>
          this.shopifyService.searchProducts(term as string, 8)
            .pipe(
              catchError(err => {
                console.error('Fehler bei Produktsuche:', err);
                this.searchError.set('Fehler bei der Suche.');
                return EMPTY;
              })
            )
        )
        ).subscribe(results => {
        this.searchResults.set(results ?? []);
        this.isSearchLoading.set(false);
        if (!results || results.length === 0) {
            this.searchError.set('Keine Produkte gefunden.');
        }
        })
    ); // Ende add
  }

  clearSearch(): void {
    this.searchControl.setValue('');
  }

  closeSearchOverlay(): void {
    this.isSearchOverlayVisible.set(false);
    this.isSearchLoading.set(false);
    this.searchError.set(null);
  }

  onSearchResultClick(): void {
    this.clearSearch();
  }

  private setupRouteListener(): void {
    const routeSub = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.closeSearchOverlay();
      this.closeMobileMenu();
    });
    this.subscriptions.add(routeSub);
  }

  openLoginOverlayOnEnter(): void {
    this.uiStateService.openLoginOverlay();
    this.uiStateService.cancelCloseTimeout();
  }

  closeLoginOverlayOnLeave(): void { }

  onCartIconMouseEnter(): void {
    this.uiStateService.openMiniCart();
    this.uiStateService.closeLoginOverlay();
  }

  onCartIconMouseLeave(): void {
    this.uiStateService.startCloseTimeout();
  }

  async performLogout(): Promise<void> {
    this.closeMobileMenu();
    try {
      await this.authService.logout();
      this.router.navigate(['/']);
    } catch (error) {
      console.error('Fehler beim Logout:', error);
    }
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    if (isPlatformBrowser(this.platformId)) {
        this.renderer.setProperty(document.body, 'style', this.isMobileMenuOpen ? 'overflow: hidden;' : '');
    }
    if (!this.isMobileMenuOpen) {
      this.navItems.forEach(item => item.isExpanded = false);
    }
  }

  closeMobileMenu(): void {
    if (this.isMobileMenuOpen) {
      this.isMobileMenuOpen = false;
       if (isPlatformBrowser(this.platformId)) {
          this.renderer.removeStyle(document.body, 'overflow');
       }
       this.navItems.forEach(item => item.isExpanded = false);
    }
  }

  toggleSubmenu(item: NavItem): void {
    item.isExpanded = !item.isExpanded;
  }
}