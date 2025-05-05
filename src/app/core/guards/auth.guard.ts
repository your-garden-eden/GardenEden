// /src/app/core/guards/auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { AuthService } from '../../shared/services/auth.service'; // Pfad prüfen!

export const authGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isLoggedIn().pipe( // Annahme: isLoggedIn() gibt Observable<boolean> zurück
    take(1),
    map(isLoggedIn => {
      if (isLoggedIn) {
        console.log('AuthGuard: User is logged in, access granted.');
        return true; // Zugriff erlaubt
      } else {
        // --- HIER DIE ÄNDERUNG ---
        console.log('AuthGuard: User is not logged in, redirecting to /'); // Log angepasst
        // Umleiten zur Startseite statt zur nicht existierenden Login-Seite
        return router.parseUrl('/'); // Zur Startseite umleiten
        // --- ENDE DER ÄNDERUNG ---
      }
    })
  );
};