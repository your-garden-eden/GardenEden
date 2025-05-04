// /src/app/core/guards/auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { AuthService } from '../../shared/services/auth.service'; // Pfad prüfen!

export const authGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isLoggedIn().pipe(
    take(1), // Nimm nur den ersten Wert (aktueller Status)
    map(isLoggedIn => {
      if (isLoggedIn) {
        console.log('AuthGuard: User is logged in, access granted.');
        return true; // Zugriff erlaubt
      } else {
        console.log('AuthGuard: User is not logged in, redirecting to /login');
        // Umleiten zur Login-Seite
        return router.parseUrl('/login'); // Zugriff verweigert, stattdessen zur Login-Seite
      }
    })
  );
};