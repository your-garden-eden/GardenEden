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
  WooCommerceMetaData,
} from '../../core/services/woocommerce.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';
import {
  navItems,
  NavItem,
  NavSubItem,
} from '../../core/data/navigation.data';

// +++ NEU: LoadingSpinnerComponent importieren +++
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

// Swiper Imports
import Swiper from 'swiper';
import { Autoplay } from 'swiper/modules';

@Component({
  selector: 'app-home',
  standalone: true,
  // +++ NEU: LoadingSpinnerComponent zu den Imports hinzufügen +++
  imports: [CommonModule, ProductCardComponent, TranslocoModule, RouterModule, LoadingSpinnerComponent],
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

  private readonly FETCH_BESTSELLER_COUNT = 20;
  private readonly DISPLAY_BESTSELLER_COUNT = 10;

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

  private filterProductsWithNoImageArray(products: WooCommerceProduct[]): WooCommerceProduct[] {
    if (!products) return [];
    return products.filter(product => product.images && product.images.length > 0 && product.images[0]?.src);
  }

  private filterProductsByStockStatus(products: WooCommerceProduct[]): WooCommerceProduct[] {
    if (!products) return [];
    return products.filter(product => product.stock_status === 'instock');
  }

  private async verifyImageLoad(url: string): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) return false;
    return new Promise((resolve) => {
      if (!url || typeof url !== 'string') {
        resolve(false);
        return;
      }
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  async loadBestsellers(): Promise<void> {
    this.isLoadingBestsellers.set(true);
    this.errorBestsellers.set(null);
    this.bestsellerProducts.set([]);

    let httpApiParams = new HttpParams()
      .set('orderby', 'popularity')
      .set('order', 'desc');

    try {
      const response = await new Promise<WooCommerceProductsResponse>((resolve, reject) => {
        this.woocommerceService
          .getProducts(undefined, this.FETCH_BESTSELLER_COUNT, 1, httpApiParams)
          .pipe(take(1))
          .subscribe({
            next: res => resolve(res),
            error: err => reject(err)
          });
      });

      let candidateProducts = this.filterProductsWithNoImageArray(response.products);
      candidateProducts = this.filterProductsByStockStatus(candidateProducts);

      if (candidateProducts.length === 0) {
        this.bestsellerProducts.set([]);
        this.isLoadingBestsellers.set(false);
        this.cdr.markForCheck();
        return;
      }

      const verificationPromises = candidateProducts.map(p => this.verifyImageLoad(p.images[0].src));
      const verificationResults = await Promise.allSettled(verificationPromises);

      const verifiedAndInStockProducts: WooCommerceProduct[] = [];
      candidateProducts.forEach((product, index) => {
        const result = verificationResults[index];
        if (result.status === 'fulfilled' && result.value === true) {
          verifiedAndInStockProducts.push(product);
        }
      });

      this.bestsellerProducts.set(verifiedAndInStockProducts.slice(0, this.DISPLAY_BESTSELLER_COUNT));
      
      this.isLoadingBestsellers.set(false);
      this.cdr.markForCheck();

    } catch (err) {
      console.error('HomeComponent: Bestseller Fehler:', err);
      this.errorBestsellers.set(
        this.translocoService.translate('home.errorLoadingBestsellers')
      );
      this.bestsellerProducts.set([]);
      this.isLoadingBestsellers.set(false);
      this.cdr.markForCheck();
    }
  }

  private prepareSubCategorySliderItems(): void {
    let allSubItems: NavSubItem[] = [];
    navItems.forEach(mainItem => {
      if (mainItem.subItems && mainItem.subItems.length > 0) {
        allSubItems = allSubItems.concat(mainItem.subItems);
      }
    });
    const shuffled = this.shuffleArray(allSubItems);
    this.shuffledSubCategoryItems.set(shuffled.slice(0, 56));
    this.cdr.markForCheck();
    if (isPlatformBrowser(this.platformId) && this.swiperContainer?.nativeElement && this.shuffledSubCategoryItems().length > 0) {
        setTimeout(() => this.initSwiper(), 0);
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
        speed: 3000,
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
    return product.images && product.images.length > 0 && product.images[0]?.src
      ? product.images[0].src
      : undefined;
  }

  extractPriceRange(product: WooCommerceProduct): { min: string, max: string } | null {
    if (product.type === 'variable') {
      if (product.price_html) {
        const rangeMatch = product.price_html.match(/([\d.,]+)[^\d.,<]*?(?:–|-)[^\d.,<]*?([\d.,]+)/);
        if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
          return {
            min: rangeMatch[1].replace(',', '.'),
            max: rangeMatch[2].replace(',', '.')
          };
        }
        const singlePriceMatch = product.price_html.match(/([\d.,]+)/);
        if (singlePriceMatch && singlePriceMatch[1]) {
          const priceVal = singlePriceMatch[1].replace(',', '.');
          return { min: priceVal, max: priceVal };
        }
      }
      if (product.price) {
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
    }
    return '€';
  }
}