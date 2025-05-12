// /src/app/features/product-list/product-list.component.ts
import { Component, OnInit, OnDestroy, inject, signal, WritableSignal, ChangeDetectionStrategy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Subscription, of, from, combineLatest, Observable } from 'rxjs';
import { switchMap, tap, catchError, finalize, map, take, distinctUntilChanged, startWith } from 'rxjs/operators';

import { ShopifyService, Product, PageInfo, CollectionQueryResult } from '../../core/services/shopify.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';
import { navItems, NavItem, NavSubItem } from '../../core/data/navigation.data';

import { TranslocoModule, TranslocoService } from '@ngneat/transloco';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [
    CommonModule,
    ProductCardComponent,
    RouterModule,
    TranslocoModule
  ],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductListComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private shopifyService = inject(ShopifyService);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);

  products: WritableSignal<Product[]> = signal([]);
  collectionTitle: WritableSignal<string | null> = signal(null);
  mainCategoryLabel: WritableSignal<string | null> = signal(null);

  isLoading: WritableSignal<boolean> = signal(true);
  isLoadingMore: WritableSignal<boolean> = signal(false);
  error: WritableSignal<string | null> = signal(null);
  pageInfo: WritableSignal<PageInfo> = signal({ hasNextPage: false, endCursor: null });
  collectionHandle: string | null = null;
  mainCategoryLink: WritableSignal<string | null> = signal(null);

  @ViewChild('loadMoreTrigger') private loadMoreTriggerEl?: ElementRef<HTMLDivElement>;
  private intersectionObserver?: IntersectionObserver;
  private subscriptions = new Subscription();
  private readonly PRODUCTS_PER_PAGE = 12;

  private currentFoundSubItem: NavSubItem | undefined;
  private currentMainCategoryNavItem: NavItem | undefined;
  private shopifyCollectionTitleFromLoad: string | null = null;

  ngOnInit(): void {
    const paramMap$ = this.route.paramMap.pipe(
      map(params => params.get('slug')),
      distinctUntilChanged(),
      tap(slug => {
        this.collectionHandle = slug;
        this.resetState();
        this.isLoading.set(true);
      })
    );

    const languageChange$ = this.translocoService.langChanges$.pipe(
      startWith(this.translocoService.getActiveLang())
    );

    const dataLoadingSubscription = paramMap$.pipe(
      switchMap(slug => {
        if (!slug) {
          const errorMsg = this.translocoService.translate('productList.errorNoSlug');
          this.error.set(errorMsg);
          this.isLoading.set(false);
          const errorPageTitleText = this.translocoService.translate('productList.errorPageTitle');
          this.titleService.setTitle(`${errorPageTitleText} - Your Garden Eden`); // Suffix hier
          this.collectionTitle.set(errorPageTitleText);
          this.cdr.detectChanges();
          return of(null as CollectionQueryResult | null);
        }

        const categoryInfo = this.findMainCategoryInfoForSubItemLink(`/product-list/${slug}`);
        this.mainCategoryLink.set(categoryInfo?.mainCategoryLink ?? null);
        this.currentMainCategoryNavItem = categoryInfo ? navItems.find(item => item.link === categoryInfo.mainCategoryLink) : undefined;
        this.currentFoundSubItem = this.findSubItemByLink(`/product-list/${slug}`);

        return from(this.shopifyService.getProductsByCollectionHandle(slug, this.PRODUCTS_PER_PAGE, null)).pipe(
          tap(result => {
            this.shopifyCollectionTitleFromLoad = result?.title ?? null;
          }),
          catchError(error => {
            console.error(`Fehler beim Laden der Produkte für Slug ${slug}:`, error);
            this.error.set(this.translocoService.translate('productList.errorLoadingProducts'));
            this.isLoading.set(false);
            this.cdr.detectChanges();
            return of(null);
          })
        );
      })
    ).subscribe(result => {
      if (result) {
        const initialProducts = result.products.edges.map(edge => edge.node);
        this.products.set(initialProducts);
        this.pageInfo.set(result.products.pageInfo);
        this.error.set(null);
        if (this.loadMoreTriggerEl?.nativeElement && this.pageInfo().hasNextPage && !this.isLoadingMore()) {
          this.setupIntersectionObserver(this.loadMoreTriggerEl.nativeElement);
        }
      } else if (!this.error() && this.collectionHandle) {
        this.products.set([]);
        this.pageInfo.set({ hasNextPage: false, endCursor: null });
      }
      this.isLoading.set(false);
      this.cdr.detectChanges();
    });
    this.subscriptions.add(dataLoadingSubscription);

    const titleAndLabelSubscription = languageChange$.pipe(
      switchMap(lang => {
        let h1Title$: Observable<string>;
        if (this.currentFoundSubItem?.i18nId) {
          h1Title$ = this.translocoService.selectTranslate(this.currentFoundSubItem.i18nId, {}, lang);
        } else if (this.shopifyCollectionTitleFromLoad) {
          h1Title$ = of(this.shopifyCollectionTitleFromLoad);
        } else if (this.collectionHandle) {
          h1Title$ = of(this.collectionHandle);
        } else {
          h1Title$ = this.translocoService.selectTranslate('productList.defaultTitle', {}, lang);
        }

        let breadcrumbLabel$: Observable<string | null> = of(null);
        if (this.currentMainCategoryNavItem?.i18nId) {
          breadcrumbLabel$ = this.translocoService.selectTranslate(this.currentMainCategoryNavItem.i18nId, {}, lang).pipe(startWith(null));
        } else if (this.currentMainCategoryNavItem?.label) {
          breadcrumbLabel$ = of(this.currentMainCategoryNavItem.label);
        }
        
        return combineLatest([h1Title$.pipe(startWith(this.collectionTitle() || null)), breadcrumbLabel$]);
      })
    ).subscribe(([translatedH1Title, translatedBreadcrumbLabel]) => {
      if (translatedH1Title && translatedH1Title !== this.collectionTitle()) {
        this.collectionTitle.set(translatedH1Title);
      }
      
      // Seitentitel (<title>) wieder mit festem Suffix setzen
      const currentH1 = this.collectionTitle() || this.collectionHandle || this.translocoService.translate('productList.defaultTitle');
      this.titleService.setTitle(`${currentH1} - Your Garden Eden`); // SUFFIX WIEDER HIER

      this.mainCategoryLabel.set(translatedBreadcrumbLabel);
      this.cdr.detectChanges();
    });
    this.subscriptions.add(titleAndLabelSubscription);
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
    this.shopifyCollectionTitleFromLoad = null;
    this.disconnectObserver();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
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
        if (this.loadMoreTriggerEl?.nativeElement) {
            this.intersectionObserver.unobserve(this.loadMoreTriggerEl.nativeElement);
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
      this.cdr.detectChanges();
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
            mainCategoryLabelI18nKey: mainItem.i18nId
          };
        }
      }
    }
    return null;
  }
}