// /src/app/features/product-list/product-list.component.ts
import { Component, OnInit, OnDestroy, inject, signal, WritableSignal, ChangeDetectionStrategy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router'; // RouterModule hinzugefügt
import { CommonModule } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Subscription, of, from } from 'rxjs';
import { switchMap, tap, catchError, finalize, map, take } from 'rxjs/operators';

import { ShopifyService, Product, PageInfo, CollectionQueryResult } from '../../core/services/shopify.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';
import { navItems, NavItem, NavSubItem } from '../../core/data/navigation.data'; // Pfad ggf. prüfen

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, ProductCardComponent, RouterModule], // RouterModule für [routerLink] im Template
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductListComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private shopifyService = inject(ShopifyService);
  private titleService = inject(Title);
  private router = inject(Router);

  // Signals
  products: WritableSignal<Product[]> = signal([]);
  collectionTitle: WritableSignal<string | null> = signal(null);
  isLoading: WritableSignal<boolean> = signal(true);
  isLoadingMore: WritableSignal<boolean> = signal(false);
  error: WritableSignal<string | null> = signal(null);
  pageInfo: WritableSignal<PageInfo> = signal({ hasNextPage: false, endCursor: null }); // endCursor hinzugefügt
  collectionHandle: string | null = null;
  mainCategoryLink: WritableSignal<string | null> = signal(null);
  mainCategoryLabel: WritableSignal<string | null> = signal(null);

  // ViewChild & Observer
  private _loadMoreTriggerEl?: ElementRef<HTMLDivElement>;
  @ViewChild('loadMoreTrigger') set loadMoreTrigger(el: ElementRef<HTMLDivElement> | undefined) {
    this._loadMoreTriggerEl = el;
    if (el && this.pageInfo().hasNextPage && !this.isLoadingMore()) { // isLoadingMore Check hinzugefügt
      this.setupIntersectionObserver(el.nativeElement);
    } else if ((!el || !this.pageInfo().hasNextPage) && this.intersectionObserver) {
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
        this.collectionHandle = slug;
        this.isLoading.set(true);
        this.products.set([]);
        this.collectionTitle.set(null);
        this.error.set(null);
        this.pageInfo.set({ hasNextPage: false, endCursor: null });
        this.isLoadingMore.set(false);
        this.mainCategoryLink.set(null);
        this.mainCategoryLabel.set(null);
        this.disconnectObserver(); // Wichtig: Observer bei jedem Slug-Wechsel zurücksetzen
      }),
      switchMap(slug => {
        if (!slug) {
          this.error.set('Keine Kennung für die Produktliste angegeben.');
          this.isLoading.set(false);
          this.titleService.setTitle('Fehler - Your Garden Eden');
          return of(null);
        }

        const categoryInfo = this.findMainCategoryInfoForSubItemLink(`/product-list/${slug}`);
        if (categoryInfo) {
          this.mainCategoryLink.set(categoryInfo.mainCategoryLink);
          this.mainCategoryLabel.set(categoryInfo.mainCategoryLabel);
        }

        return from(this.shopifyService.getProductsByCollectionHandle(slug, this.PRODUCTS_PER_PAGE, null)).pipe(
          catchError(error => {
            console.error(`Fehler beim Laden der Produkte für Slug ${slug}:`, error);
            this.error.set('Fehler beim Laden der Produkte.');
            const fallbackTitle = this.findSubItemByLink(`/product-list/${slug}`)?.label ?? slug;
            this.collectionTitle.set(fallbackTitle);
            this.titleService.setTitle(`${fallbackTitle} - Your Garden Eden`);
            this.isLoading.set(false);
            return of(null);
          })
        );
      })
    ).subscribe((result: CollectionQueryResult | null) => {
        if (this.error() && !result) { // Wenn Fehler im catchError gesetzt wurde und result null ist
            this.isLoading.set(false); // Sicherstellen, dass isLoading beendet wird
            return;
        }

        let displayTitle: string | null = null;
        if (this.collectionHandle) {
            const expectedLink = `/product-list/${this.collectionHandle}`;
            const foundSubItem = this.findSubItemByLink(expectedLink);
            displayTitle = foundSubItem?.label ?? null;
            if (!displayTitle && result?.title) { displayTitle = result.title; }
            if (!displayTitle) { displayTitle = this.collectionHandle; }
        }
        const finalTitle = displayTitle ?? 'Produkte';
        this.collectionTitle.set(finalTitle);
        this.titleService.setTitle(`${finalTitle} - Your Garden Eden`);

        if (result) {
            const initialProducts = result.products.edges.map(edge => edge.node);
            this.products.set(initialProducts);
            this.pageInfo.set(result.products.pageInfo);
            this.error.set(null); // Fehler zurücksetzen bei Erfolg
        } else if (!this.error()) { // Kein Ergebnis, aber auch kein Fehler
            this.products.set([]);
            this.pageInfo.set({ hasNextPage: false, endCursor: null });
        }
        this.isLoading.set(false);
        // Erneutes Setup des Observers, falls nötig (wird durch den Setter von loadMoreTrigger gehandhabt)
        if (this.loadMoreTriggerElement && this.pageInfo().hasNextPage && !this.isLoadingMore()) {
             this.setupIntersectionObserver(this.loadMoreTriggerElement.nativeElement);
        }
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.disconnectObserver();
  }

  private setupIntersectionObserver(targetElement: HTMLElement): void {
     if (this.intersectionObserver) { // Bestehenden Observer erst trennen
         this.intersectionObserver.disconnect();
     }
     const options = { root: null, rootMargin: '0px 0px 300px 0px', threshold: 0.1 }; // threshold leicht angepasst
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
        if (this.loadMoreTriggerElement?.nativeElement) { // Nur unobserve, wenn Element noch existiert
            this.intersectionObserver.unobserve(this.loadMoreTriggerElement.nativeElement);
        }
        this.intersectionObserver.disconnect();
        this.intersectionObserver = undefined;
      }
  }

  loadMoreProducts(): void {
    if (!this.pageInfo().hasNextPage || !this.collectionHandle || this.isLoadingMore() || !this.pageInfo().endCursor) {
      return;
    }
    this.isLoadingMore.set(true);
    from(this.shopifyService.getProductsByCollectionHandle(this.collectionHandle, this.PRODUCTS_PER_PAGE, this.pageInfo().endCursor))
    .pipe(
      take(1),
      catchError(error => {
        console.error('Fehler beim Nachladen weiterer Produkte:', error);
        // Optional: Kleinen Fehler direkt anzeigen statt global
        // this.error.set('Fehler beim Nachladen.');
        this.isLoadingMore.set(false);
        return of(null);
      })
    )
    .subscribe((result: CollectionQueryResult | null) => {
      if (result && result.products.edges.length > 0) {
        const newProducts = result.products.edges.map(edge => edge.node);
        this.products.update(currentProducts => [...currentProducts, ...newProducts]);
        this.pageInfo.set(result.products.pageInfo);
        if (!result.products.pageInfo.hasNextPage) {
          this.disconnectObserver();
        }
      } else if (result) { // Ergebnis ist da, aber keine Produkte mehr
          this.pageInfo.update(pi => ({ ...pi, hasNextPage: false }));
          this.disconnectObserver();
      }
      // Bei Fehler wird isLoadingMore im catchError behandelt
      this.isLoadingMore.set(false);
    });
  }

  trackByProductId(index: number, product: Product): string {
    return product.id;
  }

  private findSubItemByLink(link: string): NavSubItem | undefined {
    for (const item of navItems) {
      if (item.subItems) {
        const found = item.subItems.find(subItem => subItem.link === link);
        if (found) { return found; }
      }
    }
    return undefined;
  }

  private findMainCategoryInfoForSubItemLink(subItemLink: string): { mainCategoryLink: string, mainCategoryLabel: string } | null {
    for (const mainItem of navItems) {
      if (mainItem.subItems) {
        const foundSubItem = mainItem.subItems.find(subItem => subItem.link === subItemLink);
        if (foundSubItem && mainItem.link && mainItem.link.startsWith('/category/')) {
          return {
            mainCategoryLink: mainItem.link,
            mainCategoryLabel: mainItem.label
          };
        }
      }
    }
    return null;
  }
}