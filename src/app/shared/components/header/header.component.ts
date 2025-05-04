// /src/app/shared/components/header/header.component.ts
import { Component, inject, Renderer2, Inject, PLATFORM_ID, OnDestroy, Signal } from '@angular/core'; // Signal hinzugefügt
import { RouterModule, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Observable, Subscription } from 'rxjs'; // Observable für currentUser$
import { User } from '@angular/fire/auth';
import { AuthService } from '../../../shared/services/auth.service';
import { CartService } from '../../../shared/services/cart.service'; // CartService importieren
import { UiStateService } from '../../../shared/services/ui-state.service';
import { navItems, NavItem } from '../../../core/data/navigation.data'; // NavItem für toggleSubmenu

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule
   ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent implements OnDestroy {
  // --- Services ---
  public authService = inject(AuthService);
  public cartService = inject(CartService); // CartService injizieren
  private uiStateService = inject(UiStateService);
  private router = inject(Router);
  private renderer = inject(Renderer2);
  @Inject(PLATFORM_ID) private platformId = inject(PLATFORM_ID);

  // --- Observables & Signale ---
  currentUser$: Observable<User | null> = this.authService.authState$;

  // --- HIER DIE ÄNDERUNG ---
  // itemCount$ ist jetzt ein Signal<number> vom CartService
  itemCount$: Signal<number> = this.cartService.cartItemCount;
  // --- ENDE DER ÄNDERUNG ---

  // --- Zustand ---
  isMobileMenuOpen = false;

  // --- Navigation (Importiert) ---
  public navItems = navItems;

  // --- Subscription für Aufräumarbeiten (optional) ---
  private uiStateSubscription: Subscription | undefined; // Beispiel


  // --- Methoden für Login Overlay (Hover) ---
  openLoginOverlayOnEnter(): void {
    console.log('Header: Mouse entered Login Icon - Opening Overlay');
    this.uiStateService.openLoginOverlay();
  }

  closeLoginOverlayOnLeave(): void {
    console.log('Header: Mouse left Login Icon - (Overlay remains open)');
  }
  // --- ENDE NEU ---


  async performLogout(): Promise<void> {
    this.closeMobileMenu();
    try {
      await this.authService.logout();
      this.router.navigate(['/']);
      console.log('Logout erfolgreich.');
    } catch (error) {
      console.error('Fehler beim Logout:', error);
    }
  }

  onCartIconMouseEnter(): void {
    // Dummy oder echte Implementierung
    // this.uiStateService.cancelCloseTimeout();
    // this.uiStateService.openMiniCart();
    console.log('UiStateService: Cart mouse enter (Dummy)');
  }

  onCartIconMouseLeave(): void {
    // Dummy oder echte Implementierung
    // this.uiStateService.startCloseTimeout();
     console.log('UiStateService: Cart mouse leave (Dummy)');
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    if (isPlatformBrowser(this.platformId)) {
        if (this.isMobileMenuOpen) {
            this.renderer.addClass(document.body, 'body-no-scroll');
        } else {
            this.renderer.removeClass(document.body, 'body-no-scroll');
            this.navItems.forEach(item => item.isExpanded = false);
        }
    }
    console.log('Mobile menu toggled:', this.isMobileMenuOpen);
  }

  closeMobileMenu(): void {
    if (this.isMobileMenuOpen) {
      this.isMobileMenuOpen = false;
       if (isPlatformBrowser(this.platformId)) {
          this.renderer.removeClass(document.body, 'body-no-scroll');
       }
       this.navItems.forEach(item => item.isExpanded = false);
       console.log('Mobile menu closed');
    }
  }

  toggleSubmenu(item: NavItem): void {
    item.isExpanded = !item.isExpanded;
  }

  ngOnDestroy(): void {
     this.uiStateSubscription?.unsubscribe();
     console.log('HeaderComponent destroyed.');
  }
}