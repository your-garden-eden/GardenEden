// /src/app/core/guards/auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router'; // ActivatedRouteSnapshot, RouterStateSnapshot hinzugefügt für korrekte Signatur
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { AuthService } from '../../shared/services/auth.service'; // Pfad prüfen und sicherstellen, dass es die neue Version ist

// Korrekte Signatur für CanActivateFn
export const authGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot, // Parameter hinzugefügt
  state: RouterStateSnapshot   // Parameter hinzugefügt
): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Zugriff auf das isLoggedIn$ Observable
  return authService.isLoggedIn$.pipe( // GEÄNDERT: isLoggedIn() zu isLoggedIn$
    take(1), // Nimm den ersten emittierten Wert und beende dann das Observable für den Guard
    map(isUserLoggedIn => { // Umbenannt für Klarheit im Vergleich zu 'isLoggedIn' aus dem Service
      if (isUserLoggedIn) {
        console.log('AuthGuard: User is logged in, access granted.');
        return true; // Zugriff erlaubt
      } else {
        console.log('AuthGuard: User is not logged in, redirecting to /');
        // Optional: returnUrl speichern, um nach dem Login dorthin zurückzukehren
        // return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
        return router.parseUrl('/'); // Zur Startseite umleiten, wie von dir gewünscht
      }
    })
  );
};