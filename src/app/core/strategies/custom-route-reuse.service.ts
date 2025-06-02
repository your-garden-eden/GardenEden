// src/app/core/strategies/custom-route-reuse.strategy.ts
import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

@Injectable({
  providedIn: 'root' // Macht den Service automatisch als Singleton verfügbar
})
export class CustomRouteReuseStrategy implements RouteReuseStrategy {

  // Speichert die "detached" Routen-Handles
  private storedRoutes: { [key: string]: DetachedRouteHandle } = {};

  /**
   * Bestimmt, ob diese Route später wiederverwendet werden soll.
   * Wird aufgerufen, wenn von einer Route wegnavigiert wird.
   */
  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    // Wir wollen detachen, wenn in den Routen-Daten 'reuseComponent: true' gesetzt ist.
    const shouldDetach = !!route.data && route.data['reuseComponent'];
    // console.log('[RouteReuseStrategy] shouldDetach for', this.getRouteKey(route), ':', shouldDetach);
    return shouldDetach;
  }

  /**
   * Speichert die detached Route.
   * Wird nur aufgerufen, wenn shouldDetach true zurückgegeben hat.
   */
  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle): void {
    if (route.data && route.data['reuseComponent']) {
      const key = this.getRouteKey(route);
      // console.log('[RouteReuseStrategy] Storing route for key:', key);
      this.storedRoutes[key] = handle;
    }
  }

  /**
   * Bestimmt, ob eine zuvor gespeicherte Route wieder angehängt werden soll.
   * Wird aufgerufen, wenn zu einer Route hinnavigiert wird.
   */
  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    const key = this.getRouteKey(route);
    const canAttach = !!route.data && !!route.data['reuseComponent'] && !!this.storedRoutes[key];
    // console.log('[RouteReuseStrategy] shouldAttach for', key, ':', canAttach, 'Stored keys:', Object.keys(this.storedRoutes));
    return canAttach;
  }

  /**
   * Ruft die gespeicherte Route ab.
   * Wird nur aufgerufen, wenn shouldAttach true zurückgegeben hat.
   */
  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const key = this.getRouteKey(route);
    if (!route.data || !route.data['reuseComponent'] || !this.storedRoutes[key]) {
      // console.log('[RouteReuseStrategy] Retrieve: No stored route for key or reuse not configured:', key);
      return null;
    }
    // console.log('[RouteReuseStrategy] Retrieving stored route for key:', key);
    const handle = this.storedRoutes[key];
    // WICHTIG: Entferne die Route aus dem Speicher, nachdem sie abgerufen wurde,
    // wenn sie nur einmal wiederverwendet werden soll oder wenn Parameteränderungen
    // einen Neuladen erfordern würden und die shouldReuseRoute unten das nicht abfängt.
    // Für einfache Szenarien kann sie drin bleiben, wenn shouldReuseRoute korrekt ist.
    // delete this.storedRoutes[key]; // Optional, abhängig vom genauen Verhalten
    return handle;
  }

  /**
   * Bestimmt, ob dieselbe Route (Komponente) wiederverwendet werden soll, wenn sich Parameter ändern.
   * Diese Methode ist entscheidend dafür, ob ngOnInit etc. erneut aufgerufen wird,
   * wenn man z.B. von /product-list/A nach /product-list/B navigiert.
   */
  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    // Standardverhalten: Routen wiederverwenden, wenn die RouteConfig gleich ist.
    // Das bedeutet, wenn du von /product-list/slugA zu /product-list/slugB navigierst,
    // wird dieselbe Komponenteninstanz wiederverwendet und ngOnInit NICHT erneut aufgerufen.
    // Das ist oft gewünscht, da deine ProductListPageComponent bereits auf paramMap-Änderungen reagiert.
    const shouldReuse = future.routeConfig === curr.routeConfig;
    // console.log(
    //   '[RouteReuseStrategy] shouldReuseRoute for future:', this.getRouteKey(future),
    //   'curr:', this.getRouteKey(curr), ':', shouldReuse
    // );
    return shouldReuse;
  }

  /**
   * Generiert einen eindeutigen Schlüssel für eine Route basierend auf ihrem Pfad.
   * Pfade mit unterschiedlichen Parametern (z.B. /product-list/cat1 vs /product-list/cat2)
   * erzeugen unterschiedliche Schlüssel.
   */
  private getRouteKey(route: ActivatedRouteSnapshot): string {
    // Wir verwenden den pathFromRoot, um einen eindeutigen Schlüssel für die Route inklusive ihrer Parameter zu bekommen.
    // Ohne die Parameter würden wir /product-list/catA und /product-list/catB nicht unterscheiden.
    let key = route.pathFromRoot
      .filter(snapshot => snapshot.url && snapshot.url.length > 0)
      .map(snapshot => snapshot.url.join('/'))
      .join('/');

    // Fallback, falls oben leer ist (z.B. Root-Route ohne Kinder mit Pfad)
    if (!key && route.routeConfig && route.routeConfig.path !== undefined) {
      key = route.routeConfig.path;
    }

    // Wenn route.data.reuseKey explizit gesetzt ist, diesen verwenden
    if(route.data && route.data['reuseKey']) {
        key = route.data['reuseKey'];
    }
    // console.log(`[RouteReuseStrategy] Generated key for route: ${key || 'undefined_key'}`);
    return key || 'undefined_key'; // Fallback für leeren Schlüssel
  }
}