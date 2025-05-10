// /src/app/shared/components/header/header.component.ts
import { Component, inject, Renderer2, Inject, PLATFORM_ID, OnDestroy, Signal, OnInit, WritableSignal, signal, effect, ChangeDetectionStrategy, computed, ChangeDetectorRef } from '@angular/core';
import { RouterModule, Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { CommonModule, isPlatformBrowser, AsyncPipe } from '@angular/common';
import { Observable, Subscription, Subject, EMPTY } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, tap, switchMap, catchError } from 'rxjs/operators';
import { User } from '@angular/fire/auth';
import { ReactiveFormsModule, FormControl } from '@angular/forms';

// Komponenten
import { MiniCartComponent } from '../mini-cart/mini-cart.component';

// Services & Daten
import { AuthService } from '../../../shared/services/auth.service';
import { CartService } from '../../../shared/services/cart.service';
import { UiStateService } from '../../../shared/services/ui-state.service';
import { WishlistService } from '../../../shared/services/wishlist.service';
import { navItems, NavItem } from '../../../core/data/navigation.data';
import { ShopifyService, Product } from '../../../core/services/shopify.service';

// +++ NEU für Breakpoint-Erkennung +++
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
// distinctUntilChanged und tap sind schon importiert

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    AsyncPipe,
    MiniCartComponent
   ],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeaderComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  public cartService = inject(CartService); // public, falls im Template direkt genutzt, sonst private
  public uiStateService = inject(UiStateService); // public für Template-Zugriff (isMiniCartOpen$)
  private wishlistService = inject(WishlistService);
  private router = inject(Router);
  private renderer = inject(Renderer2);
  @Inject(PLATFORM_ID) private platformId = inject(PLATFORM_ID);
  private shopifyService = inject(ShopifyService);
  // +++ NEU +++
  private breakpointObserver = inject(BreakpointObserver);
  private cdr = inject(ChangeDetectorRef);


  currentUser$: Observable<User | null> = this.authService.authState$;
  itemCount$: Signal<number> = this.cartService.cartItemCount;
  isMobileMenuOpen = false;
  public navItems = navItems; // public für @for im Template

  // Signale vom UiStateService
  isMiniCartOpen$ = this.uiStateService.isMiniCartOpen$;

  // Signale für Wunschliste und Login-Status
  isWishlistEmpty: Signal<boolean> = this.wishlistService.isEmpty;
  isLoggedIn$: Observable<boolean> = this.authService.isLoggedIn();

  // Suche
  searchControl = new FormControl('');
  // private destroy$ = new Subject<void>(); // Wird durch subscriptions ersetzt für einheitliches Handling
  searchResults: WritableSignal<Product[]> = signal([]);
  isSearchLoading: WritableSignal<boolean> = signal(false);
  isSearchOverlayVisible: WritableSignal<boolean> = signal(false);
  searchError: WritableSignal<string | null> = signal(null);
  private subscriptions = new Subscription(); // Für alle Abos dieser Komponente

  // +++ NEU: Flag für mobilen Bildschirm +++
  isMobileScreen: WritableSignal<boolean> = signal(false);


  constructor() {
    // --- Effekt für leeres Suchfeld (bleibt) ---
    effect(() => {
      if (this.searchControl.value === '') {
        this.closeSearchOverlay();
        this.searchResults.set([]);
      }
    });

    // --- Breakpoint Observer Logik ---
    if (isPlatformBrowser(this.platformId)) { // BreakpointObserver nur im Browser sinnvoll
      const breakpointSubscription = this.breakpointObserver.observe([
        Breakpoints.XSmall,
        Breakpoints.Small,
        `(max-width: ${this.getMobileBreakpoint()}px)` // Dein SCSS Breakpoint
      ]).pipe(
        // distinctUntilChanged((prev, curr) => prev.matches === curr.matches) // Kann nützlich sein
      ).subscribe(result => {
        const wasMobile = this.isMobileScreen();
        this.isMobileScreen.set(result.matches);
        // console.log('Mobile screen:', this.isMobileScreen());
        if (wasMobile && !this.isMobileScreen() && this.isMobileMenuOpen) {
          // Wenn von Mobile zu Desktop gewechselt wird und Menü offen ist -> schließen
          this.closeMobileMenu();
        }
        if (this.isMobileScreen() && this.isMiniCartOpen$()) {
            // Wenn zu Mobile gewechselt wird und Mini-Cart offen ist -> schließen
            this.uiStateService.closeMiniCart();
        }
        this.cdr.detectChanges(); // Wichtig, damit das Template die Änderung von isMobileScreen mitbekommt
      });
      this.subscriptions.add(breakpointSubscription);
    }
  }

  // Hilfsmethode, um den SCSS Breakpoint-Wert zu bekommen
  private getMobileBreakpoint(): number {
    // Dieser Wert sollte idealerweise aus einer globalen Konfiguration kommen.
    // Für jetzt nehmen wir den Wert aus deiner header.component.scss
    return 1024;
  }

  ngOnInit(): void {
    this.setupSearchDebounce();
    this.setupRouteListener();
  }

  ngOnDestroy(): void {
     this.subscriptions.unsubscribe(); // Löst alle hinzugefügten Abos
     // this.destroy$.next(); // Nicht mehr nötig, wenn subscriptions verwendet wird
     // this.destroy$.complete();
  }

  private setupSearchDebounce(): void {
    const searchSub = this.searchControl.valueChanges.pipe(
      filter(term => {
          if (!term || term.length <= 2) {
              this.searchResults.set([]);
              // this.closeSearchOverlay(); // Wird durch effect() oben gehandhabt
              this.isSearchOverlayVisible.set(false); // Sicherstellen, dass es hier auch geschlossen wird
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
      switchMap(term =>
        this.shopifyService.searchProducts(term as string, 8)
          .pipe(
            // tap(results => console.log('Search results:', results)),
            catchError(err => {
              console.error('Fehler bei Produktsuche:', err);
              this.searchError.set('Fehler bei der Suche.');
              this.isSearchLoading.set(false);
              this.searchResults.set([]);
              return EMPTY;
            })
          )
      )
    ).subscribe(results => {
      this.searchResults.set(results ?? []);
      this.isSearchLoading.set(false);
      if (!results || results.length === 0) {
        if (!this.searchError()) {
            // this.searchError.set('Keine Produkte gefunden.'); // Redundand, da bereits im catchError
        }
      } else {
         this.searchError.set(null);
      }
    });
    this.subscriptions.add(searchSub);
  }

  clearSearch(): void {
    this.searchControl.setValue('');
    this.searchResults.set([]); // Auch hier Ergebnisse leeren
    this.closeSearchOverlay();
  }

  closeSearchOverlay(): void {
    this.isSearchOverlayVisible.set(false);
    this.isSearchLoading.set(false);
    this.searchError.set(null);
  }

  onSearchResultClick(): void {
    this.clearSearch(); // Schließt Overlay und leert Suche
  }

  private setupRouteListener(): void {
    const routeSub = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.closeSearchOverlay();
      this.closeMobileMenu();
      this.uiStateService.closeLoginOverlay(); // Auch Login-Overlay bei Navigation schließen
      this.uiStateService.closeMiniCart();    // Auch Mini-Cart bei Navigation schließen
    });
    this.subscriptions.add(routeSub);
  }

  toggleLoginOverlay(event?: MouseEvent): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.uiStateService.toggleLoginOverlay();
    if (this.isMobileMenuOpen) this.closeMobileMenu(); // Mobile Menü schließen, wenn Login geöffnet wird
  }

  onCartIconMouseEnter(): void {
    if (!this.isMobileScreen()) { // +++ NUR auf Desktop ausführen +++
      this.uiStateService.openMiniCart();
    }
  }

  onCartIconMouseLeave(): void {
    if (!this.isMobileScreen()) { // +++ NUR auf Desktop ausführen +++
      this.uiStateService.startCloseTimeout(300); // Standard-Timeout, 500ms ist recht lang
    }
  }

  // Klick auf Warenkorb-Icon:
  // Das <a>-Tag im Template hat routerLink="/warenkorb".
  // Für Mobile ist das das gewünschte Verhalten.
  // Für Desktop öffnet der MouseEnter das Mini-Cart, der Klick führt dann auch zur Seite,
  // was in Ordnung ist oder angepasst werden könnte, falls der Klick nur das Mini-Cart offen halten soll,
  // ohne Navigation (dann müsste man den Klick-Handler hier anpassen und preventDefault).
  // Für den Moment belassen wir es so, dass der Klick immer navigiert.

  async performLogout(): Promise<void> {
    this.closeMobileMenu(); // Wichtig
    try {
      await this.authService.logout();
      // Navigation zur Homepage nach Logout
      this.router.navigate(['/'], { queryParams: { loggedOut: 'true' } });
    } catch (error) {
      console.error('Fehler beim Logout:', error);
      // Hier könnte man dem Nutzer eine Fehlermeldung anzeigen
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
    if (!this.isMobileMenuOpen) { // Wenn Menü geschlossen wird
      this.navItems.forEach(item => item.isExpanded = false); // Alle Submenüs schließen
    }
  }

  closeMobileMenu(): void {
    if (this.isMobileMenuOpen) {
      this.isMobileMenuOpen = false;
       if (isPlatformBrowser(this.platformId)) {
          this.renderer.removeStyle(document.body, 'overflow');
       }
       this.navItems.forEach(item => item.isExpanded = false); // Alle Submenüs schließen
    }
  }

  toggleSubmenu(item: NavItem): void {
    // Schließe andere offene Submenüs, bevor ein neues geöffnet wird (optional)
    // this.navItems.filter(i => i !== item).forEach(i => i.isExpanded = false);
    item.isExpanded = !item.isExpanded;
  }
}