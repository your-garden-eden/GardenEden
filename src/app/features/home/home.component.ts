// /src/app/features/home/home.component.ts
import {
  Component,
  OnInit,
  inject,
  signal,
  ChangeDetectionStrategy,
  WritableSignal,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  PLATFORM_ID,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { TranslocoService, TranslocoModule } from '@ngneat/transloco';
import { Subscription, of } from 'rxjs';
import { catchError, finalize, take, map } from 'rxjs/operators';
import { RouterModule } from '@angular/router';
import { HttpParams } from '@angular/common/http';

import {
  WoocommerceService,
  WooCommerceProduct,
  WooCommerceProductsResponse,
  WooCommerceMetaData, // Importiert
} from '../../core/services/woocommerce.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';
import {
  navItems,
  NavItem,
  NavSubItem,
} from '../../core/data/navigation.data';

// Swiper Imports
import Swiper from 'swiper';
import { Autoplay } from 'swiper/modules';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, ProductCardComponent, TranslocoModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit, OnDestroy, AfterViewInit {
  private woocommerceService = inject(WoocommerceService);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private platformId = inject(PLATFORM_ID);
  private cdr = inject(ChangeDetectorRef);
  private subscriptions = new Subscription();

  bestsellerProducts: WritableSignal<WooCommerceProduct[]> = signal([]);
  isLoadingBestsellers: WritableSignal<boolean> = signal(false);
  errorBestsellers: WritableSignal<string | null> = signal(null);

  shuffledSubCategoryItems: WritableSignal<NavSubItem[]> = signal([]);

  @ViewChild('subCategorySwiper') swiperContainer!: ElementRef<HTMLElement>;
  private swiperInstance: Swiper | null = null;

  private readonly BESTSELLER_COUNT = 8;

  constructor() {}

  ngOnInit(): void {
    this.loadBestsellers();
    this.updateTitle();
    this.prepareSubCategorySliderItems();

    const langSub = this.translocoService.langChanges$.subscribe(() => {
      this.updateTitle();
      if (this.errorBestsellers()) {
        this.errorBestsellers.set(
          this.translocoService.translate('home.errorLoadingBestsellers')
        );
      }
      this.cdr.markForCheck();
    });
    this.subscriptions.add(langSub);
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      Promise.resolve().then(() => this.initSwiper());
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.swiperInstance) {
      this.swiperInstance.destroy(true, true);
    }
  }

  private updateTitle(): void {
    const title = this.translocoService.translate('home.title');
    this.titleService.setTitle(title);
  }

  loadBestsellers(): void {
    this.isLoadingBestsellers.set(true);
    this.errorBestsellers.set(null);
    this.bestsellerProducts.set([]);

    let httpApiParams = new HttpParams();
    httpApiParams = httpApiParams.set('orderby', 'total_sales');
    httpApiParams = httpApiParams.set('order', 'desc');

    const bestsellerSub = this.woocommerceService
      .getProducts(
        undefined,
        this.BESTSELLER_COUNT,
        1,
        httpApiParams
      )
      .pipe(
        take(1),
        catchError(err => {
          console.error('HomeComponent: Bestseller Fehler:', err);
          this.errorBestsellers.set(
            this.translocoService.translate('home.errorLoadingBestsellers')
          );
          return of({ products: [], totalPages: 0, totalCount: 0 } as WooCommerceProductsResponse);
        }),
        map((response: WooCommerceProductsResponse) => response.products),
        finalize(() => {
          this.isLoadingBestsellers.set(false);
          this.cdr.markForCheck();
        })
      )
      .subscribe((products: WooCommerceProduct[]) => {
        this.bestsellerProducts.set(products);
      });
    this.subscriptions.add(bestsellerSub);
  }

  private prepareSubCategorySliderItems(): void {
    let allSubItems: NavSubItem[] = [];
    navItems.forEach(mainItem => {
      if (mainItem.subItems && mainItem.subItems.length > 0) {
        allSubItems = allSubItems.concat(mainItem.subItems);
      }
    });
    const shuffled = this.shuffleArray(allSubItems);
    this.shuffledSubCategoryItems.set(shuffled.slice(0, 15));
    this.cdr.markForCheck();
    if (isPlatformBrowser(this.platformId) && this.swiperContainer?.nativeElement && this.shuffledSubCategoryItems().length > 0) {
        this.initSwiper();
    }
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  getIconPath(filename: string | undefined): string | null {
    return filename ? `assets/icons/categories/${filename}` : null;
  }

  private initSwiper(): void {
    if (this.swiperInstance) {
        this.swiperInstance.destroy(true, true);
        this.swiperInstance = null;
    }
    if (this.swiperContainer?.nativeElement && this.shuffledSubCategoryItems().length > 0) {
      this.swiperInstance = new Swiper(this.swiperContainer.nativeElement, {
        modules: [Autoplay],
        loop: true,
        slidesPerView: 'auto',
        spaceBetween: 20,
        centeredSlides: false,
        grabCursor: true,
        autoplay: {
          delay: 1,
          disableOnInteraction: false,
          pauseOnMouseEnter: true,
        },
        speed: 5000,
        freeMode: true,
        breakpoints: {
          320: { spaceBetween: 15 },
          768: { spaceBetween: 20 },
        },
      });
    }
  }

  getProductLink(product: WooCommerceProduct): string {
    return `/product/${product.slug}`;
  }

  getProductImage(product: WooCommerceProduct): string | undefined {
    return product.images && product.images.length > 0
      ? product.images[0].src
      : undefined;
  }

  // NEUE METHODEN für ProductCard
  extractPriceRange(product: WooCommerceProduct): { min: string, max: string } | null {
    if (product.type === 'variable') {
      if (product.price_html) {
        // Verbesserter Regex, um verschiedene Währungsformate und "ab"-Texte zu berücksichtigen
        const rangeMatch = product.price_html.match(/([\d.,]+)[^\d.,<]*?(?:–|-)[^\d.,<]*?([\d.,]+)/);
        if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
          return { 
            min: rangeMatch[1].replace(',', '.'), 
            max: rangeMatch[2].replace(',', '.') 
          };
        }
        // Regex für einzelnen Preis (z.B. "Ab 19,99€" oder nur "19,99€")
        const singlePriceMatch = product.price_html.match(/([\d.,]+)/);
        if (singlePriceMatch && singlePriceMatch[1]) {
          const priceVal = singlePriceMatch[1].replace(',', '.');
          return { min: priceVal, max: priceVal };
        }
      }
      if (product.price) { // Fallback auf product.price, wenn price_html nicht passt
        return { min: product.price, max: product.price };
      }
    }
    return null;
  }

  getProductCurrencySymbol(product: WooCommerceProduct): string {
    const currencyMeta = product.meta_data?.find(m => m.key === '_currency_symbol');
    if (currencyMeta?.value) return currencyMeta.value as string;
    
    if (product.price_html) {
      if (product.price_html.includes('€')) return '€';
      if (product.price_html.includes('$')) return '$';
      // Hier weitere Währungssymbole bei Bedarf hinzufügen
    }
    return '€'; // Standard-Fallback
  }
}