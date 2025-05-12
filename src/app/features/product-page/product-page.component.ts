// /src/app/features/product-page/product-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy, computed, Signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, CurrencyPipe, Location } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Observable, of, from, Subscription, combineLatest, EMPTY } from 'rxjs';
import { switchMap, tap, catchError, map, filter, distinctUntilChanged, startWith } from 'rxjs/operators';

import { ShopifyService, Product, ShopifyImage } from '../../core/services/shopify.service';
import { CartService } from '../../shared/services/cart.service';
import { WishlistService } from '../../shared/services/wishlist.service';
import { AuthService } from '../../shared/services/auth.service';
import { ImageTransformPipe } from '../../shared/pipes/image-transform.pipe';
import { FormatPricePipe } from '../../shared/pipes/format-price.pipe';
import { SafeHtmlPipe } from '../../shared/pipes/safe-html.pipe';

import { TranslocoModule, TranslocoService } from '@ngneat/transloco';

@Component({
  selector: 'app-product-page',
  standalone: true,
  imports: [ CommonModule, RouterLink, ImageTransformPipe, FormatPricePipe, SafeHtmlPipe, TranslocoModule ],
  templateUrl: './product-page.component.html',
  styleUrls: ['./product-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe]
})
export class ProductPageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private shopifyService = inject(ShopifyService);
  private titleService = inject(Title);
  private cdr = inject(ChangeDetectorRef);
  private location = inject(Location);
  private cartService = inject(CartService);
  private wishlistService = inject(WishlistService);
  private authService = inject(AuthService);
  private translocoService = inject(TranslocoService);

  product: WritableSignal<Product | null> = signal(null);
  isLoading: WritableSignal<boolean> = signal(true);
  error: WritableSignal<string | null> = signal(null);
  private errorKey: WritableSignal<string | null> = signal(null);

  selectedImage: WritableSignal<ShopifyImage | null | undefined> = signal(null);
  isAddingToCart: WritableSignal<boolean> = signal(false);
  addToCartError: WritableSignal<string | null> = signal(null);
  private addToCartErrorKey: WritableSignal<string | null> = signal(null);

  readonly isOnWishlist: Signal<boolean> = computed(() => {
      const handle = this.product()?.handle;
      return handle ? this.wishlistService.isOnWishlist(handle) : false;
  });

  isLoggedIn: WritableSignal<boolean> = signal(false);
  private subscriptions = new Subscription();
  private productHandleFromRoute: string | null = null;

  ngOnInit(): void {
    const authSub = this.authService.isLoggedIn().subscribe(loggedIn => {
        this.isLoggedIn.set(loggedIn);
        this.cdr.markForCheck();
    });
    this.subscriptions.add(authSub);

    const handle$ = this.route.paramMap.pipe(
      map(params => params.get('handle')),
      distinctUntilChanged(),
      tap(handle => {
        this.productHandleFromRoute = handle;
        this.resetStateAndLoadInitialTitle();
      })
    );

    const productDataLoadingSub = handle$.pipe(
      filter((handle): handle is string => {
        if (!handle) {
          this.setErrorStateAndTitle('productPage.errorNoHandle', 'productPage.errorTitle');
          return false;
        }
        return true;
      }),
      switchMap(handle =>
        from(this.shopifyService.getProductByHandle(handle)).pipe(
          tap(productData => {
            this.isLoading.set(false);
            if (productData) {
              this.product.set(productData);
              this.selectedImage.set(productData.images?.edges?.[0]?.node);
              this.errorKey.set(null);
              this.error.set(null);
              // Titel wird durch langSub aktualisiert, sobald Produkt da ist
            } else if (!this.errorKey()) {
              this.setErrorStateAndTitle('productPage.errorNotFound', 'productPage.notFoundTitle');
            }
            this.cdr.markForCheck();
          }),
          catchError(err => {
            console.error(`Error loading product ${handle}:`, err);
            this.setErrorStateAndTitle('productPage.errorLoadingProduct', 'productPage.errorTitle');
            return of(null);
          })
        )
      )
    ).subscribe(); // Daten werden im tap gesetzt, hier nur den Stream aktivieren
    this.subscriptions.add(productDataLoadingSub);


    const langSub = this.translocoService.langChanges$.pipe(
      startWith(this.translocoService.getActiveLang()),
      tap(() => {
        this.updatePageTitleOnLangChange(); // Diese Methode prüft intern product() und errorKey()
        if (this.errorKey()) {
          this.error.set(this.translocoService.translate(this.errorKey()!));
        }
        if (this.addToCartErrorKey()) {
          this.addToCartError.set(this.translocoService.translate(this.addToCartErrorKey()!));
        }
      })
    ).subscribe(() => {
      this.cdr.markForCheck();
    });
    this.subscriptions.add(langSub);
  }
  
  private updatePageTitleOnLangChange(): void {
    const currentProduct = this.product();
    const currentErrorKey = this.errorKey();

    if (currentProduct) {
      const pageTitle = this.translocoService.translate('productPage.pageTitle', { productName: currentProduct.title });
      this.titleService.setTitle(pageTitle);
    } else if (currentErrorKey) {
      let errorTitleKeyToUse = 'productPage.errorTitle'; // Default
      if (currentErrorKey === 'productPage.errorNotFound') {
        errorTitleKeyToUse = 'productPage.notFoundTitle';
      } else if (currentErrorKey === 'productPage.errorNoHandle') {
        errorTitleKeyToUse = 'productPage.errorTitle';
      } else if (currentErrorKey === 'productPage.errorLoadingProduct') {
        errorTitleKeyToUse = 'productPage.errorTitle';
      }
      const errorName = this.translocoService.translate(errorTitleKeyToUse);
      const pageTitle = this.translocoService.translate('productPage.pageTitleError', { errorName: errorName });
      this.titleService.setTitle(pageTitle);
    } else if (this.productHandleFromRoute === null && !this.isLoading()) { 
        // Fall, wenn kein Handle und kein Produkt und kein Fehler, aber Laden ist fertig (sollte durch filter oben abgefangen werden)
        // Aber zur Sicherheit:
        const errorName = this.translocoService.translate('productPage.errorTitle'); // Generischer Fehlertitel
        const pageTitle = this.translocoService.translate('productPage.pageTitleError', { errorName: errorName });
        this.titleService.setTitle(pageTitle);
    }
    // Wenn isLoading true ist, wird der Titel durch die Fehlerbehandlung oder nach dem Laden gesetzt.
  }

  private resetStateAndLoadInitialTitle(): void {
    this.isLoading.set(true);
    this.product.set(null);
    this.error.set(null);
    this.errorKey.set(null);
    this.selectedImage.set(null);
    this.addToCartError.set(null);
    this.addToCartErrorKey.set(null);
    this.isAddingToCart.set(false);
    // Der Titel wird reaktiv durch den langSub und productDataLoadingSub gesetzt.
  }

  private setErrorStateAndTitle(errorMsgKey: string, errorTitleKeyForInterpolation: string): void {
    this.errorKey.set(errorMsgKey);
    this.error.set(this.translocoService.translate(errorMsgKey)); // UI-Fehler sofort setzen
    this.isLoading.set(false);
    
    // Seitentitel für den Fehlerfall setzen
    const errorName = this.translocoService.translate(errorTitleKeyForInterpolation);
    const pageTitle = this.translocoService.translate('productPage.pageTitleError', { errorName: errorName });
    this.titleService.setTitle(pageTitle);
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
      this.subscriptions.unsubscribe();
  }

  selectImage(imageNode: ShopifyImage | null | undefined): void {
    if (imageNode) {
        this.selectedImage.set(imageNode);
    }
  }

  get firstAvailableVariantId(): string | null {
    const productData = this.product();
    if (!productData?.variants?.edges) { return null; }
    const availableVariant = productData.variants.edges.find(edge => edge.node.availableForSale);
    return availableVariant?.node?.id ?? null;
  }

  async addToCart(): Promise<void> {
    const variantId = this.firstAvailableVariantId;
    if (!variantId) {
      this.addToCartErrorKey.set('productPage.errorVariantNotAvailable');
      this.addToCartError.set(this.translocoService.translate(this.addToCartErrorKey()!));
      this.cdr.markForCheck();
      return;
    }
    this.isAddingToCart.set(true);
    this.addToCartError.set(null);
    this.addToCartErrorKey.set(null);
    try {
      await this.cartService.addLine(variantId, 1);
    } catch (error) {
      console.error(`ProductPage: Error adding variant ${variantId} to cart:`, error);
      this.addToCartErrorKey.set('productPage.errorAddingToCart');
      this.addToCartError.set(this.translocoService.translate(this.addToCartErrorKey()!));
    } finally {
      this.isAddingToCart.set(false);
      this.cdr.markForCheck();
    }
  }

  async toggleWishlist(): Promise<void> {
    const handle = this.product()?.handle;
    if (!handle) { return; }
    if (!this.isLoggedIn()) { return; }
    try {
      if (this.isOnWishlist()) {
        await this.wishlistService.removeFromWishlist(handle);
      } else {
        await this.wishlistService.addToWishlist(handle);
      }
    } catch (error) {
        console.error("Error toggling wishlist:", error);
    }
  }

  goBack(): void {
    this.location.back();
  }
}