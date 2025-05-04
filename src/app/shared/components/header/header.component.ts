// /src/app/shared/components/header/header.component.ts
import { Component, inject, Renderer2, Inject, PLATFORM_ID, OnDestroy } from '@angular/core'; // OnDestroy hinzugefügt
import { RouterModule, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Observable, Subscription } from 'rxjs'; // Subscription hinzugefügt
import { User } from '@angular/fire/auth';
import { AuthService } from '../../../shared/services/auth.service';
import { CartService } from '../../../shared/services/cart.service';
import { UiStateService } from '../../../shared/services/ui-state.service'; // War schon importiert
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
export class HeaderComponent implements OnDestroy { // OnDestroy implementiert
  // --- Services ---
  public authService = inject(AuthService);
  public cartService = inject(CartService);
  private uiStateService = inject(UiStateService); // War schon injiziert
  private router = inject(Router);
  private renderer = inject(Renderer2);
  @Inject(PLATFORM_ID) private platformId = inject(PLATFORM_ID);

  // --- Observables ---
  currentUser$: Observable<User | null> = this.authService.authState$;
  itemCount$: Observable<number> = this.cartService.itemCount$;

  // --- Zustand ---
  isMobileMenuOpen = false;

  // --- Navigation (Importiert) ---
  public navItems = navItems;

  // --- Subscription für Aufräumarbeiten (optional) ---
  private uiStateSubscription: Subscription | undefined; // Beispiel


  // --- Methoden ---

  // --- NEU: Methoden für Login Overlay (Hover) ---
  openLoginOverlayOnEnter(): void {
    console.log('Header: Mouse entered Login Icon - Opening Overlay');
    this.uiStateService.openLoginOverlay();
    // Ggf. andere Timeouts (z.B. Mini-Cart) abbrechen, falls nötig
    // this.uiStateService.cancelCloseTimeout();
  }

  closeLoginOverlayOnLeave(): void {
    // Aktuell keine Aktion hier, Overlay schließt nur bei Klick daneben,
    // explizitem Schließen-Button-Klick oder erfolgreichem Login.
    // Optional: Timeout starten zum automatischen Schließen.
    console.log('Header: Mouse left Login Icon - (Overlay remains open)');
    // this.uiStateService.startCloseTimeout(); // Beispiel für Timeout zum Schließen
  }
  // --- ENDE NEU ---


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

  onCartIconMouseEnter(): void {
    // Mini-Cart Logik (bleibt vorerst Dummy oder wird implementiert)
    // this.uiStateService.cancelCloseTimeout();
    // this.uiStateService.openMiniCart();
    console.log('UiStateService: Cart mouse enter (Dummy)');

  }

  onCartIconMouseLeave(): void {
     // Mini-Cart Logik (bleibt vorerst Dummy oder wird implementiert)
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
    // Nur ein Submenü gleichzeitig öffnen (optional)
    // this.navItems.forEach(i => { if (i !== item) { i.isExpanded = false; } });
    item.isExpanded = !item.isExpanded;
  }

  // --- NEU: ngOnDestroy für Aufräumarbeiten ---
  ngOnDestroy(): void {
     this.uiStateSubscription?.unsubscribe(); // Beispielhaft
     console.log('HeaderComponent destroyed.');
  }
  // --- ENDE NEU ---
}