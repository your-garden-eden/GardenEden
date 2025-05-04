import { Component, OnInit, OnDestroy, inject, signal, WritableSignal, ChangeDetectionStrategy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Subscription, of, from } from 'rxjs';
import { switchMap, tap, catchError, finalize, map, take } from 'rxjs/operators';

import { ShopifyService, Product, PageInfo, CollectionQueryResult } from '../../core/services/shopify.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';

// --- NEU: Import der Navigationsdaten ---
import { navItems, NavSubItem } from '../../core/data/navigation.data'; // Pfad prüfen!

// --- ENTFERNT: Veraltete manuelle Titel-Map ---
// const MANUAL_CATEGORY_TITLES: { [key: string]: string } = { /* ... deine Titel ... */ };

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, ProductCardComponent],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductListComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private shopifyService = inject(ShopifyService);
  private titleService = inject(Title);
  private router = inject(Router);

  // --- Signals ---
  products: WritableSignal<Product[]> = signal([]);
  collectionTitle: WritableSignal<string | null> = signal(null); // Wird jetzt aus navItems befüllt
  isLoading: WritableSignal<boolean> = signal(true);
  isLoadingMore: WritableSignal<boolean> = signal(false);
  error: WritableSignal<string | null> = signal(null);
  pageInfo: WritableSignal<PageInfo> = signal({ hasNextPage: false });
  collectionHandle: string | null = null;

  // --- ViewChild & Observer ---
  private _loadMoreTriggerEl?: ElementRef<HTMLDivElement>;
  @ViewChild('loadMoreTrigger') set loadMoreTrigger(el: ElementRef<HTMLDivElement> | undefined) {
    console.log('ViewChild loadMoreTrigger setter called. Element:', el);
    this._loadMoreTriggerEl = el;
    if (el && this.pageInfo().hasNextPage) {
      console.log('Trigger Element found AND hasNextPage is true. Setting up observer.');
      this.setupIntersectionObserver(el.nativeElement);
    } else if (!this.pageInfo().hasNextPage && this.intersectionObserver) {
      console.log('Disconnecting observer because element removed or no next page.');
      this.disconnectObserver();
    }
  }
  get loadMoreTriggerElement(): ElementRef<HTMLDivElement> | undefined {
    return this._loadMoreTriggerEl;
  }
  private intersectionObserver?: IntersectionObserver;
  private routeSubscription?: Subscription;
  private readonly PRODUCTS_PER_PAGE = 12;

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.pipe(
      map(params => params.get('slug')),
      tap(slug => {
        console.log('ProductListComponent: Neuer Slug erkannt:', slug);
        this.collectionHandle = slug; // Slug speichern
        this.isLoading.set(true);
        this.products.set([]);
        this.collectionTitle.set(null); // Titel zurücksetzen
        this.error.set(null);
        this.pageInfo.set({ hasNextPage: false });
        this.isLoadingMore.set(false);
        this.disconnectObserver();
      }),
      switchMap(slug => {
        if (!slug) {
          this.error.set('Keine Kennung für die Produktliste angegeben.');
          this.isLoading.set(false);
          this.titleService.setTitle('Fehler - Your Garden Eden');
          return of(null); // Observable zurückgeben, das null emittiert
        }
        // Produkte von Shopify laden
        return from(this.shopifyService.getProductsByCollectionHandle(slug, this.PRODUCTS_PER_PAGE, null)).pipe(
          // Fehler hier abfangen, damit wir den Titel auch bei Fehlern setzen können
          catchError(error => {
            console.error(`Fehler beim Laden der Produkte für Slug ${slug}:`, error);
            this.error.set('Fehler beim Laden der Produkte.');
            // Titel trotzdem versuchen zu setzen (Fallback auf Slug)
            const fallbackTitle = this.findSubItemByLink(`/product-list/${slug}`)?.label ?? slug;
            this.collectionTitle.set(fallbackTitle);
            this.titleService.setTitle(`${fallbackTitle} - Your Garden Eden`);
            this.isLoading.set(false);
            return of(null); // Null zurückgeben, um die Pipe fortzusetzen
          })
        );
      })
    ).subscribe((result: CollectionQueryResult | null) => {
        // Wird nur aufgerufen, wenn kein Fehler im catchError oben aufgetreten ist
        // oder wenn catchError null zurückgibt
        if (this.error()) {
            // Wenn ein Fehler im catchError gesetzt wurde, hier nichts mehr tun
            return;
        }

        let displayTitle: string | null = null;
        if (this.collectionHandle) {
            const expectedLink = `/product-list/${this.collectionHandle}`;
            const foundSubItem = this.findSubItemByLink(expectedLink);

            // Priorität 1: Label aus navItems
            displayTitle = foundSubItem?.label ?? null;

            // Priorität 2: Titel von Shopify (nur wenn kein Label gefunden)
            if (!displayTitle && result?.title) {
                displayTitle = result.title;
            }

            // Priorität 3: Slug (letzter Fallback)
            if (!displayTitle) {
                displayTitle = this.collectionHandle;
            }
        }

        // Titel setzen (oder Standardwert, falls alles fehlschlägt)
        const finalTitle = displayTitle ?? 'Produkte';
        this.collectionTitle.set(finalTitle);
        this.titleService.setTitle(`${finalTitle} - Your Garden Eden`);

        if (result) {
            // Erfolgreich geladen
            const initialProducts = result.products.edges.map(edge => edge.node);
            this.products.set(initialProducts);
            this.pageInfo.set(result.products.pageInfo);
            this.error.set(null);
            console.log('Initial load complete. Title:', finalTitle, 'hasNextPage:', result.products.pageInfo.hasNextPage);
            // Observer Setup wird durch ViewChild Setter getriggert
        } else if (!this.error()) {
            // Kein Ergebnis, aber auch kein expliziter Fehler (z.B. leere Collection)
            console.warn(`Keine Produkte für Slug ${this.collectionHandle} gefunden oder Collection leer.`);
            // Titel wurde bereits gesetzt
            this.products.set([]);
            this.pageInfo.set({ hasNextPage: false });
        }

        this.isLoading.set(false); // Ladevorgang beenden
    });
}


  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.disconnectObserver();
  }

  private setupIntersectionObserver(targetElement: HTMLElement): void {
     if (this.intersectionObserver) {
         this.intersectionObserver.disconnect();
     }
     console.log('Setting up IntersectionObserver for:', targetElement);
     const options = { root: null, rootMargin: '0px 0px 300px 0px', threshold: 0 };
     this.intersectionObserver = new IntersectionObserver((entries) => {
       entries.forEach(entry => {
         if (entry.isIntersecting && this.pageInfo().hasNextPage && !this.isLoadingMore()) {
           this.loadMoreProducts();
         }
       });
     }, options);
     this.intersectionObserver.observe(targetElement);
  }

  private disconnectObserver(): void {
      if (this.intersectionObserver) {
        this.intersectionObserver.disconnect();
        this.intersectionObserver = undefined;
      }
  }

  loadMoreProducts(): void {
    if (!this.pageInfo().hasNextPage || !this.collectionHandle || this.isLoadingMore()) { return; }
    console.log('Load more products... Cursor:', this.pageInfo().endCursor);
    this.isLoadingMore.set(true);
    from(this.shopifyService.getProductsByCollectionHandle(this.collectionHandle, this.PRODUCTS_PER_PAGE, this.pageInfo().endCursor))
    .pipe(
      take(1),
      catchError(error => {
        console.error('Fehler beim Nachladen weiterer Produkte:', error);
        this.error.set('Fehler beim Nachladen.'); // Fehler setzen, aber nicht global anzeigen?
        this.isLoadingMore.set(false); // Wichtig: Ladeanzeige auch bei Fehler beenden
        return of(null); // Null zurückgeben, damit subscribe aufgerufen wird
      }),
      finalize(() => {
        // Finalize wird *nach* catchError oder normalem Abschluss aufgerufen
        // isLoadingMore wird im catchError schon behandelt oder im subscribe
      })
    )
    .subscribe((result: CollectionQueryResult | null) => {
      console.log('Load more result:', result ? `${result.products.edges.length} products` : 'null');
      if (result && result.products.edges.length > 0) {
        const newProducts = result.products.edges.map(edge => edge.node);
        this.products.update(currentProducts => [...currentProducts, ...newProducts]); // Spread-Syntax ist moderner
        this.pageInfo.set(result.products.pageInfo);
        console.log('More products loaded. hasNextPage:', this.pageInfo().hasNextPage);
        if (!this.pageInfo().hasNextPage) {
          this.disconnectObserver();
        }
      } else if (result) {
          // Keine weiteren Produkte von Shopify erhalten
          this.pageInfo.update(pi => ({ ...pi, hasNextPage: false }));
          this.disconnectObserver();
      }
      // Fehlerfall wird im catchError behandelt
      this.isLoadingMore.set(false); // Ladeanzeige hier sicher beenden
    });
  }

  trackByProductId(index: number, product: Product): string {
    return product.id;
  }

  // --- NEUE HILFSMETHODE zum Finden des SubItems ---
  private findSubItemByLink(link: string): NavSubItem | undefined {
    for (const item of navItems) {
      if (item.subItems) {
        const found = item.subItems.find(subItem => subItem.link === link);
        if (found) {
          return found;
        }
      }
    }
    return undefined; // Nicht gefunden
  }
}