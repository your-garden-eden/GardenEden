// /src/app/features/product-list/product-list.component.ts
import { Component, OnInit, OnDestroy, inject, signal, WritableSignal, ChangeDetectionStrategy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core'; // ChangeDetectorRef
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Subscription, of, from } from 'rxjs';
import { switchMap, tap, catchError, finalize, map, take } from 'rxjs/operators';

import { ShopifyService, Product, PageInfo, CollectionQueryResult } from '../../core/services/shopify.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';
import { navItems, NavItem, NavSubItem } from '../../core/data/navigation.data';

// Transloco
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [
    CommonModule,
    ProductCardComponent,
    RouterModule,
    TranslocoModule // TranslocoModule hinzugefügt
  ],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductListComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private shopifyService = inject(ShopifyService);
  private titleService = inject(Title);
  private router = inject(Router);
  private translocoService = inject(TranslocoService); // TranslocoService injiziert
  private cdr = inject(ChangeDetectorRef); // ChangeDetectorRef injiziert

  products: WritableSignal<Product[]> = signal([]);
  collectionTitle: WritableSignal<string | null> = signal(null);
  isLoading: WritableSignal<boolean> = signal(true);
  isLoadingMore: WritableSignal<boolean> = signal(false);
  error: WritableSignal<string | null> = signal(null);
  pageInfo: WritableSignal<PageInfo> = signal({ hasNextPage: false, endCursor: null });
  collectionHandle: string | null = null;
  mainCategoryLink: WritableSignal<string | null> = signal(null);
  mainCategoryLabel: WritableSignal<string | null> = signal(null); // Wird jetzt übersetzt gesetzt

  private _loadMoreTriggerEl?: ElementRef<HTMLDivElement>;
  @ViewChild('loadMoreTrigger') set loadMoreTrigger(el: ElementRef<HTMLDivElement> | undefined) {
    this._loadMoreTriggerEl = el;
    if (el && this.pageInfo().hasNextPage && !this.isLoadingMore()) {
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
  private langChangeSubscription?: Subscription; // Für Sprachwechsel
  private readonly PRODUCTS_PER_PAGE = 12;

  // Temporäre Speicherung der Navigationsdaten für den Sprachwechsel
  private currentFoundSubItem: NavSubItem | undefined;
  private currentMainCategoryNavItem: NavItem | undefined;
  private shopifyCollectionTitle: string | null = null; // Titel von Shopify, falls kein navItem existiert

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.pipe(
      map(params => params.get('slug')),
      tap(slug => {
        this.collectionHandle = slug;
        this.resetState();
      }),
      switchMap(slug => {
        if (!slug) {
          this.error.set(this.translocoService.translate('productList.errorNoSlug'));
          this.isLoading.set(false);
          this.titleService.setTitle(`${this.translocoService.translate('productList.errorPageTitle')} - Your Garden Eden`);
          return of(null);
        }

        const categoryInfo = this.findMainCategoryInfoForSubItemLink(`/product-list/${slug}`);
        if (categoryInfo) {
          this.mainCategoryLink.set(categoryInfo.mainCategoryLink);
          // Label wird unten zusammen mit collectionTitle gesetzt nach Sprachprüfung
          this.currentMainCategoryNavItem = navItems.find(item => item.link === categoryInfo.mainCategoryLink);
        }

        return from(this.shopifyService.getProductsByCollectionHandle(slug, this.PRODUCTS_PER_PAGE, null)).pipe(
          catchError(error => {
            console.error(`Fehler beim Laden der Produkte für Slug ${slug}:`, error);
            this.error.set(this.translocoService.translate('productList.errorLoadingProducts'));
            this.updateTitlesAfterLanguageChangeOrError(); // Titel setzen basierend auf Fallbacks
            this.isLoading.set(false);
            return of(null);
          })
        );
      })
    ).subscribe((result: CollectionQueryResult | null) => {
        if (this.error() && !result) {
            this.isLoading.set(false);
            return;
        }

        this.shopifyCollectionTitle = result?.title ?? null; // Shopify-Titel speichern
        this.updateTitlesAfterLanguageChangeOrError(result); // Titel setzen

        if (result) {
            const initialProducts = result.products.edges.map(edge => edge.node);
            this.products.set(initialProducts);
            this.pageInfo.set(result.products.pageInfo);
            this.error.set(null);
        } else if (!this.error()) {
            this.products.set([]);
            this.pageInfo.set({ hasNextPage: false, endCursor: null });
        }
        this.isLoading.set(false);
        if (this.loadMoreTriggerElement && this.pageInfo().hasNextPage && !this.isLoadingMore()) {
             this.setupIntersectionObserver(this.loadMoreTriggerElement.nativeElement);
        }
    });

    this.langChangeSubscription = this.translocoService.langChanges$.subscribe(() => {
        this.updateTitlesAfterLanguageChangeOrError();
        if (this.error() === this.translocoService.translate('productList.errorNoSlug') ||
            this.error() === this.translocoService.translate('productList.errorLoadingProducts')) {
            // Wenn ein Fehler besteht, der bereits übersetzt wurde, aktualisiere ihn
            if (this.error() === this.translocoService.translate('productList.errorNoSlug')) {
                this.error.set(this.translocoService.translate('productList.errorNoSlug'));
            } else {
                 this.error.set(this.translocoService.translate('productList.errorLoadingProducts'));
            }
        }
        this.cdr.detectChanges();
    });
  }

  private resetState(): void {
    this.isLoading.set(true);
    this.products.set([]);
    this.collectionTitle.set(null);
    this.error.set(null);
    this.pageInfo.set({ hasNextPage: false, endCursor: null });
    this.isLoadingMore.set(false);
    this.mainCategoryLink.set(null);
    this.mainCategoryLabel.set(null);
    this.currentFoundSubItem = undefined;
    this.currentMainCategoryNavItem = undefined;
    this.shopifyCollectionTitle = null;
    this.disconnectObserver();
  }

  private updateTitlesAfterLanguageChangeOrError(shopifyResult?: CollectionQueryResult | null): void {
    let displayTitle: string | null = null;
    let mainCatLabel: string | null = null;

    if (this.collectionHandle) {
        const expectedLink = `/product-list/${this.collectionHandle}`;
        this.currentFoundSubItem = this.findSubItemByLink(expectedLink); // Im State speichern

        if (this.currentFoundSubItem?.i18nId) {
            displayTitle = this.translocoService.translate(this.currentFoundSubItem.i18nId);
        } else if (this.shopifyCollectionTitle) { // Fallback zum Shopify Titel
            displayTitle = this.shopifyCollectionTitle;
        } else if (shopifyResult?.title) { // Fallback zum Shopify Titel vom aktuellen Call
             displayTitle = shopifyResult.title;
        } else { // Letzter Fallback zum Handle
            displayTitle = this.collectionHandle;
        }
    }
    const finalTitle = displayTitle ?? this.translocoService.translate('productList.defaultTitle');
    this.collectionTitle.set(finalTitle);
    this.titleService.setTitle(`${finalTitle} - Your Garden Eden`);

    if (this.currentMainCategoryNavItem?.i18nId) {
        mainCatLabel = this.translocoService.translate(this.currentMainCategoryNavItem.i18nId);
    } else if (this.currentMainCategoryNavItem?.label) {
        mainCatLabel = this.currentMainCategoryNavItem.label; // Fallback
    }
    this.mainCategoryLabel.set(mainCatLabel);
  }


  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.langChangeSubscription?.unsubscribe();
    this.disconnectObserver();
  }

  private setupIntersectionObserver(targetElement: HTMLElement): void {
     if (this.intersectionObserver) {
         this.intersectionObserver.disconnect();
     }
     const options = { root: null, rootMargin: '0px 0px 300px 0px', threshold: 0.1 };
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
        if (this.loadMoreTriggerElement?.nativeElement) {
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
      } else if (result) {
          this.pageInfo.update(pi => ({ ...pi, hasNextPage: false }));
          this.disconnectObserver();
      }
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

  private findMainCategoryInfoForSubItemLink(subItemLink: string): { mainCategoryLink: string, mainCategoryLabelI18nKey: string } | null {
    for (const mainItem of navItems) {
      if (mainItem.subItems) {
        const foundSubItem = mainItem.subItems.find(subItem => subItem.link === subItemLink);
        if (foundSubItem && mainItem.link && mainItem.link.startsWith('/category/')) {
          return {
            mainCategoryLink: mainItem.link,
            mainCategoryLabelI18nKey: mainItem.i18nId // Wichtig: i18nId der Hauptkategorie zurückgeben
          };
        }
      }
    }
    return null;
  }
}