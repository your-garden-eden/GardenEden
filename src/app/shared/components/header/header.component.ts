// /src/app/shared/components/header/header.component.ts
import { Component, inject, Renderer2, Inject, PLATFORM_ID, OnDestroy, Signal } from '@angular/core'; // Signal hinzugefügt, OnDestroy war schon da
import { RouterModule, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Observable, Subscription } from 'rxjs'; // Subscription hinzugefügt
import { User } from '@angular/fire/auth';
import { AuthService } from '../../../shared/services/auth.service';
import { CartService } from '../../../shared/services/cart.service'; // CartService importieren
import { UiStateService } from '../../../shared/services/ui-state.service'; // UiStateService importieren
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
export class HeaderComponent implements OnDestroy { // OnDestroy implementieren
  // --- Services ---
  public authService = inject(AuthService);
  public cartService = inject(CartService); // CartService injiziert
  private uiStateService = inject(UiStateService); // UiStateService injiziert
  private router = inject(Router);
  private renderer = inject(Renderer2);
  @Inject(PLATFORM_ID) private platformId = inject(PLATFORM_ID);

  // --- Observables & Signale ---
  currentUser$: Observable<User | null> = this.authService.authState$;
  itemCount$: Signal<number> = this.cartService.cartItemCount; // Nutzt Signal vom CartService

  // --- Zustand ---
  isMobileMenuOpen = false;

  // --- Navigation (Importiert) ---
  public navItems = navItems;

  // --- Subscription für Aufräumarbeiten (optional) ---
  private uiStateSubscription: Subscription | undefined; // Beispiel


  // --- Methoden für Login Overlay (Hover) ---
  openLoginOverlayOnEnter(): void {
    console.log('Header: Mouse entered Login Icon - Opening Overlay');
    this.uiStateService.openLoginOverlay(); // Ruft Service auf
    // Ggf. andere Timeouts (z.B. Mini-Cart) abbrechen, falls nötig
    this.uiStateService.cancelCloseTimeout();
  }

  closeLoginOverlayOnLeave(): void {
    // Aktuell keine Aktion hier, Overlay schließt nur bei Klick daneben, etc.
    console.log('Header: Mouse left Login Icon - (Overlay remains open)');
  }
  // --- ENDE Methoden für Login Overlay ---


  // --- Methoden für Mini-Cart (Hover mit Timeout) ---
  onCartIconMouseEnter(): void {
    console.log('Header: Cart mouse enter - Opening Mini Cart');
    this.uiStateService.openMiniCart(); // Ruft Service auf
     // Schließe Login-Overlay, wenn Warenkorb geöffnet wird
     this.uiStateService.closeLoginOverlay();
  }

  onCartIconMouseLeave(): void {
    console.log('Header: Cart mouse leave - Starting close timeout');
    this.uiStateService.startCloseTimeout(); // Startet Timeout zum Schließen im Service
  }
  // --- ENDE Mini-Cart Methoden ---


  async performLogout(): Promise<void> {
    this.closeMobileMenu(); // Mobile Menü schließen
    try {
      await this.authService.logout();
      this.router.navigate(['/']);
      console.log('Logout erfolgreich.');
    } catch (error) {
      console.error('Fehler beim Logout:', error);
    }
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    if (isPlatformBrowser(this.platformId)) {
        if (this.isMobileMenuOpen) {
            this.renderer.addClass(document.body, 'body-no-scroll');
        } else {
            this.renderer.removeClass(document.body, 'body-no-scroll');
            this.navItems.forEach(item => item.isExpanded = false); // Submenüs schließen
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
       this.navItems.forEach(item => item.isExpanded = false); // Submenüs schließen
       console.log('Mobile menu closed');
    }
  }

  toggleSubmenu(item: NavItem): void {
    item.isExpanded = !item.isExpanded;
  }

  // --- ngOnDestroy für Aufräumarbeiten ---
  ngOnDestroy(): void {
     this.uiStateSubscription?.unsubscribe(); // Beispielhaft
     console.log('HeaderComponent destroyed.');
  }
  // --- ENDE ngOnDestroy ---
}