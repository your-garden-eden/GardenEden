import { Component, OnInit, inject, signal, ChangeDetectionStrategy, WritableSignal, OnDestroy, AfterViewInit, ElementRef, ViewChild, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { TranslocoService, TranslocoModule } from '@ngneat/transloco';
import { Subscription } from 'rxjs';
import { RouterModule } from '@angular/router';

import { ShopifyService, Product } from '../../core/services/shopify.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';
import { navItems, NavItem, NavSubItem } from '../../core/data/navigation.data';

// Swiper Imports
import Swiper from 'swiper';
import { Autoplay } from 'swiper/modules';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    ProductCardComponent,
    TranslocoModule,
    RouterModule
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent implements OnInit, OnDestroy, AfterViewInit {

  private shopifyService = inject(ShopifyService);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private platformId = inject(PLATFORM_ID);
  private cdr = inject(ChangeDetectorRef);
  private langChangeSubscription!: Subscription;

  bestsellerProducts: WritableSignal<Product[]> = signal([]);
  isLoadingBestsellers: WritableSignal<boolean> = signal(false);
  errorBestsellers: WritableSignal<string | null> = signal(null);

  shuffledSubCategoryItems: WritableSignal<NavSubItem[]> = signal([]);

  @ViewChild('subCategorySwiper') swiperContainer!: ElementRef<HTMLElement>;
  private swiperInstance: Swiper | null = null;

  constructor() {}

  ngOnInit(): void {
    this.loadBestsellers();
    this.updateTitle();
    this.prepareSubCategorySliderItems();

    this.langChangeSubscription = this.translocoService.langChanges$.subscribe(() => {
      this.updateTitle();
      if (this.errorBestsellers()) {
        this.errorBestsellers.set(this.translocoService.translate('home.errorLoadingBestsellers'));
      }
    });
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.initSwiper();
    }
  }

  ngOnDestroy(): void {
    if (this.langChangeSubscription) {
      this.langChangeSubscription.unsubscribe();
    }
    if (this.swiperInstance) {
      this.swiperInstance.destroy(true, true);
    }
  }

  private updateTitle(): void {
    const title = this.translocoService.translate('home.title');
    this.titleService.setTitle(title);
  }

  async loadBestsellers(): Promise<void> {
    this.isLoadingBestsellers.set(true);
    this.errorBestsellers.set(null);
    this.bestsellerProducts.set([]);
    try {
      const products = await this.shopifyService.getProductsSortedByBestSelling(10);
      this.bestsellerProducts.set(products ?? []);
    } catch (err) {
      console.error('HomeComponent: Bestseller Fehler:', err);
      this.errorBestsellers.set(this.translocoService.translate('home.errorLoadingBestsellers'));
    } finally {
      this.isLoadingBestsellers.set(false);
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
    this.shuffledSubCategoryItems.set(shuffled);
    this.cdr.detectChanges();
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
    if (this.swiperContainer && this.swiperContainer.nativeElement && this.shuffledSubCategoryItems().length > 0) {
      if (this.swiperInstance) {
        this.swiperInstance.destroy(true, true);
        this.swiperInstance = null;
      }

      this.swiperInstance = new Swiper(this.swiperContainer.nativeElement, {
        modules: [Autoplay],
        loop: true,
        slidesPerView: 'auto',
        spaceBetween: 20, // Dieser Wert wird für Desktop ggf. im Breakpoint überschrieben
        centeredSlides: false, // Wichtig für den "randlosen" Effekt, wenn slidesPerView: 'auto'
        grabCursor: true,
        autoplay: {
          delay: 0,
          disableOnInteraction: false,
        },
        speed: 4000,
        breakpoints: { // Hier nur noch spaceBetween anpassen, slidesPerView ist 'auto'
          320: { spaceBetween: 15 },
          768: { spaceBetween: 20 }, // Ggf. etwas mehr Space auf Desktop
        }
      });
    } else {
      console.warn('Swiper konnte nicht initialisiert werden. Container nicht bereit oder keine Slider-Items.');
    }
  }
}