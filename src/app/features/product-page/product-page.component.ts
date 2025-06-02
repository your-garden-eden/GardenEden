// /src/app/features/product-page/product-page.component.ts
import {
  Component, OnInit, inject, signal, WritableSignal, ChangeDetectionStrategy,
  ChangeDetectorRef, OnDestroy, computed, Signal, effect, AfterViewInit,
  PLATFORM_ID, // KORRIGIERT: PLATFORM_ID importiert
  untracked    // KORRIGIERT: untracked importiert
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, CurrencyPipe, Location, NgClass, isPlatformBrowser } from '@angular/common'; // isPlatformBrowser importiert
import { Title, Meta, MetaDefinition } from '@angular/platform-browser'; // MetaDefinition importiert
import { Subscription, of, combineLatest, EMPTY, forkJoin, BehaviorSubject, Observable } from 'rxjs'; // Observable importiert
import {
  switchMap, tap, catchError, map, filter, distinctUntilChanged, startWith, take, finalize
} from 'rxjs/operators';

import {
  WoocommerceService, WooCommerceProduct, WooCommerceImage,
  WooCommerceAttribute, WooCommerceProductVariation, WooCommerceMetaData, WooCommerceCategory
} from '../../core/services/woocommerce.service';
import { CartService } from '../../shared/services/cart.service';
import { WishlistService } from '../../shared/services/wishlist.service';
import { AuthService, WordPressUser } from '../../shared/services/auth.service';
import { UiStateService } from '../../shared/services/ui-state.service';
import { ImageTransformPipe } from '../../shared/pipes/image-transform.pipe';
import { FormatPricePipe } from '../../shared/pipes/format-price.pipe';
import { SafeHtmlPipe } from '../../shared/pipes/safe-html.pipe';

import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { FormsModule } from '@angular/forms';


interface SelectedOptions {
  [attributeSlug: string]: string;
}

@Component({
  selector: 'app-product-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ImageTransformPipe,
    FormatPricePipe,
    SafeHtmlPipe,
    TranslocoModule,
    FormsModule,
    NgClass
  ],
  templateUrl: './product-page.component.html',
  styleUrls: ['./product-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
})
export class ProductPageComponent implements OnInit, OnDestroy, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private woocommerceService = inject(WoocommerceService);
  public cartService = inject(CartService);
  public wishlistService = inject(WishlistService);
  public authService = inject(AuthService);
  private uiStateService = inject(UiStateService);
  private titleService = inject(Title);
  private metaService = inject(Meta);
  private translocoService = inject(TranslocoService);
  private location = inject(Location);
  private platformId = inject(PLATFORM_ID);
  private cdr = inject(ChangeDetectorRef);
  private currencyPipe = inject(CurrencyPipe);


  product: WritableSignal<WooCommerceProduct | null> = signal(null);
  variations: WritableSignal<WooCommerceProductVariation[]> = signal([]);
  variationAttributes: WritableSignal<WooCommerceAttribute[]> = signal([]);
  selectedOptions: WritableSignal<SelectedOptions> = signal({});

  currentSelectedVariation: Signal<WooCommerceProductVariation | null> = computed(() => {
    const productData = this.product();
    const allVariations = this.variations();
    const currentSelections = this.selectedOptions();
    if (!productData || productData.type !== 'variable' || allVariations.length === 0 || Object.keys(currentSelections).length === 0) {
      return null;
    }
    const allAttributesSelected = this.variationAttributes().every(attr => currentSelections[this.getAttributeTrackKey(attr)]);
    if (!allAttributesSelected && this.variationAttributes().length > 0) {
        return null;
    }
    return allVariations.find(variation =>
      variation.attributes.every(attr => {
        const selectedOptionKey = this.variationAttributes().find(va => va.id === attr.id || va.name === attr.name);
        if (!selectedOptionKey) return false;
        const trackKey = this.getAttributeTrackKey(selectedOptionKey);
        const selectedOptionSlugInUI = currentSelections[trackKey];
        const variationOptionSlug = (attr.option || '').toLowerCase().replace(/\s+/g, '-');
        return selectedOptionSlugInUI === variationOptionSlug;
      })
    ) || null;
  });

  currencySymbol: Signal<string> = computed(() => {
    const p = this.product();
    const v = this.currentSelectedVariation();
    if (v && v.price_html && v.price_html.includes('€')) return '€';
    if (v && v.price_html && v.price_html.includes('$')) return '$';
    if (p && p.price_html && p.price_html.includes('€')) return '€';
    if (p && p.price_html && p.price_html.includes('$')) return '$';
    return this.getProductCurrencySymbolFromCode(this.getProductCurrencyCode(p)) || '€';
  });

  displayPriceFormatted: Signal<string> = computed(() => {
    const selectedVar = this.currentSelectedVariation();
    const product = this.product();
    const lang = this.translocoService.getActiveLang() || 'de-DE';
    const currencyCode = this.getProductCurrencyCode(product);

    let priceToFormat: string | undefined;
    let priceHtmlToUse: string | undefined;

    if (selectedVar) {
      priceHtmlToUse = selectedVar.price_html;
      priceToFormat = selectedVar.price;
    } else if (product) {
      priceHtmlToUse = product.price_html;
      priceToFormat = product.price;
    }

    if (priceHtmlToUse && (priceHtmlToUse.includes('€') || priceHtmlToUse.includes('$') || priceHtmlToUse.includes(currencyCode))) {
      return priceHtmlToUse;
    }

    if (priceToFormat) {
      const numPrice = parseFloat(priceToFormat);
      if (!isNaN(numPrice)) {
        try {
            return this.currencyPipe.transform(numPrice, currencyCode, 'symbol', '1.2-2', lang) || '';
        } catch (e) {
            return `${numPrice.toFixed(2)}${this.getProductCurrencySymbolFromCode(currencyCode)}`;
        }
      }
    }
    return product?.price_html || '';
  });

  displayRegularPriceFormatted: Signal<string | undefined> = computed(() => {
    const selectedVar = this.currentSelectedVariation();
    const mainProduct = this.product();
    const lang = this.translocoService.getActiveLang() || 'de-DE';
    let currencyCode = this.getProductCurrencyCode(mainProduct);

    let currentPriceNumStr: string | undefined;
    let regularPriceNumStr: string | undefined;
    let isOnSaleFlag: boolean | undefined;

    if (selectedVar) {
        currentPriceNumStr = selectedVar.price;
        regularPriceNumStr = selectedVar.regular_price;
        isOnSaleFlag = selectedVar.on_sale;
    } else if (mainProduct) {
        currentPriceNumStr = mainProduct.price;
        regularPriceNumStr = mainProduct.regular_price;
        isOnSaleFlag = mainProduct.on_sale;
    }

    if (isOnSaleFlag && regularPriceNumStr && regularPriceNumStr !== currentPriceNumStr) {
      const numRegPrice = parseFloat(regularPriceNumStr);
      if (!isNaN(numRegPrice)) {
        try {
            const formatted = this.currencyPipe.transform(numRegPrice, currencyCode, 'symbol', '1.2-2', lang);
            return formatted === null ? undefined : formatted;
        } catch (e) {
            return `${numRegPrice.toFixed(2)}${this.getProductCurrencySymbolFromCode(currencyCode)}`;
        }
      }
    }
    return undefined;
  });

  displayOnSale: Signal<boolean> = computed(() => {
    return this.currentSelectedVariation()?.on_sale ?? this.product()?.on_sale ?? false;
  });

  selectedImage: WritableSignal<WooCommerceImage | null | undefined> = signal(null);
  isLoading: WritableSignal<boolean> = signal(true);
  error: WritableSignal<string | null> = signal(null);
  private errorKey: WritableSignal<string | null> = signal(null);
  isAddingToCart: WritableSignal<boolean> = signal(false);
  addToCartError: WritableSignal<string | null> = signal(null);
  private addToCartErrorKey: WritableSignal<string | null> = signal(null);

  readonly isOnWishlist: Signal<boolean> = computed(() => {
    const slug = this.product()?.slug; // Beachte: Produkt-Slug wird hier verwendet, nicht der Routen-Parameter-Name
    return slug ? this.wishlistService.isOnWishlist(slug) : false;
  });

  readonly isLoggedIn$: Observable<boolean> = this.authService.isLoggedIn$;
  private subscriptions = new Subscription();
  private productSlugFromRoute: string | null = null; // Diese Variable speichert den Wert aus der Route

  constructor() {
    effect(() => {
      const currentVar = this.currentSelectedVariation();
      const mainProduct = this.product();
      untracked(() => {
        if (currentVar && currentVar.image && currentVar.image.src) {
          this.selectedImage.set(currentVar.image);
        } else if (mainProduct && mainProduct.images && mainProduct.images.length > 0) {
          this.selectedImage.set(mainProduct.images[0]);
        } else {
          this.selectedImage.set(null);
        }
      });
      this.cdr.markForCheck();
    });
  }

  ngOnInit(): void {
    const authSub = this.authService.isLoggedIn$.subscribe((loggedIn: boolean) => {
      console.log('ProductPage: User loggedIn status in ngOnInit:', loggedIn);
      this.cdr.markForCheck();
    });
    this.subscriptions.add(authSub);

    const handle$ = this.route.paramMap.pipe(
      // ***** KORREKTUR HIER: Zurück zu 'handle' oder an deinen Routenparameter anpassen *****
      map(params => params.get('handle')), // Angenommen, dein Routenparameter heißt 'handle'
      distinctUntilChanged(),
      tap(routeParamValue => { // Umbenannt zu routeParamValue für Klarheit
        console.log('ProductPageComponent Route Param from URL:', routeParamValue);
        this.productSlugFromRoute = routeParamValue; // Speichert den Wert aus der Route
        this.resetStateAndLoadInitialTitle();
      })
    );

    const productDataLoadingSub = handle$.pipe(
      filter((paramValue): paramValue is string => { // Umbenannt zu paramValue
        if (!paramValue) {
          this.setErrorStateAndTitle('productPage.errorNoHandle', 'productPage.errorTitle');
          return false;
        }
        return true;
      }),
      switchMap(actualSlugToLoad => // Umbenannt zu actualSlugToLoad
        this.woocommerceService.getProductBySlug(actualSlugToLoad).pipe( // Verwende den Wert aus der Route
          switchMap(productData => {
            if (!productData) {
              this.setErrorStateAndTitle('productPage.errorNotFound', 'productPage.notFoundTitle');
              return of(null);
            }
            this.product.set(productData);
            this.updatePageTitleAndMeta(productData);
            if (productData.type === 'variable' && productData.variations && productData.variations.length > 0) {
              return this.woocommerceService.getProductVariations(productData.id).pipe(
                tap(variationsData => {
                  this.variations.set(variationsData);
                  this.prepareVariationAttributes(productData, variationsData);
                }),
                map(() => productData)
              );
            } else {
              this.variations.set([]);
              this.variationAttributes.set([]);
              return of(productData);
            }
          }),
          catchError(err => {
            console.error(`Error loading product with slug/handle ${actualSlugToLoad}:`, err);
            this.setErrorStateAndTitle('productPage.errorLoadingProduct', 'productPage.errorTitle');
            this.variations.set([]);
            this.variationAttributes.set([]);
            return of(null);
          }),
          finalize(() => {
            this.isLoading.set(false);
            if (!this.product() && !this.errorKey()) {
                this.setErrorStateAndTitle('productPage.errorNotFound', 'productPage.notFoundTitle');
            }
            this.cdr.markForCheck();
          })
        )
      )
    ).subscribe(() => {
        this.cdr.markForCheck();
    });
    this.subscriptions.add(productDataLoadingSub);

    const langSub = this.translocoService.langChanges$.pipe(
        startWith(this.translocoService.getActiveLang()),
    ).subscribe(() => {
      this.updatePageTitleAndMeta(this.product());
      if (this.errorKey()) { this.error.set(this.translocoService.translate(this.errorKey()!)); }
      if (this.addToCartErrorKey()) { this.addToCartError.set(this.translocoService.translate(this.addToCartErrorKey()!)); }
      this.cdr.markForCheck();
    });
    this.subscriptions.add(langSub);
  }

  ngAfterViewInit(): void {
    // Deine Logik hier
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private prepareVariationAttributes(product: WooCommerceProduct, variationsData: WooCommerceProductVariation[]): void {
    if (product.type !== 'variable' || !product.attributes) return;
    const attributesForSelection = product.attributes.filter(attr => attr.variation);
    this.variationAttributes.set(attributesForSelection);
    const initialSelected: SelectedOptions = {};
    if (product.default_attributes && product.default_attributes.length > 0) {
        product.default_attributes.forEach(defAttr => {
            const attrDefinition = attributesForSelection.find(a => a.id === defAttr.id || a.name === defAttr.name);
            if (attrDefinition) {
                initialSelected[this.getAttributeTrackKey(attrDefinition)] = defAttr.option;
            }
        });
    } else if (variationsData.length > 0 && attributesForSelection.length > 0) {
        const firstPurchasableVariation = variationsData.find(v => v.purchasable && v.stock_status === 'instock');
        const firstVariationToUse = firstPurchasableVariation || variationsData[0];
        if (firstVariationToUse && firstVariationToUse.attributes) {
            attributesForSelection.forEach(attrDef => {
                const matchingVarAttr = firstVariationToUse.attributes.find(va => va.id === attrDef.id || va.name === attrDef.name);
                if (matchingVarAttr) {
                    initialSelected[this.getAttributeTrackKey(attrDef)] = matchingVarAttr.option;
                }
            });
        }
    }
    this.selectedOptions.set(initialSelected);
  }

  onOptionSelect(attributeIdentifier: string, optionValue: string): void {
    this.selectedOptions.update(current => ({ ...current, [attributeIdentifier]: optionValue }));
    this.addToCartError.set(null);
    this.addToCartErrorKey.set(null);
  }

  isOptionSelected(attributeIdentifier: string, optionValue: string): boolean {
    return this.selectedOptions()[attributeIdentifier] === optionValue;
  }

  getOptionsForAttribute(attribute: WooCommerceAttribute): string[] {
    return attribute.options;
  }

  getNormalizedOptionValue(optionString: string): string {
    return optionString.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
  }

  private updatePageTitleAndMeta(productData: WooCommerceProduct | null = this.product()): void {
    const currentErrorKey = this.errorKey();
    const defaultDescription = this.translocoService.translate('general.defaultMetaDescription');

    if (productData) {
      const pageTitle = this.translocoService.translate('productPage.pageTitle', { productName: productData.name });
      this.titleService.setTitle(pageTitle);
      const descriptionContent = productData.short_description || productData.description || pageTitle || defaultDescription;
      this.metaService.updateTag({ name: 'description', content: descriptionContent } as MetaDefinition);
    } else if (currentErrorKey) {
      let errorTitleKeyToUse = 'productPage.errorTitle';
      if (currentErrorKey === 'productPage.errorNotFound') errorTitleKeyToUse = 'productPage.notFoundTitle';
      const errorName = this.translocoService.translate(errorTitleKeyToUse);
      const pageTitle = this.translocoService.translate('productPage.pageTitleError', { errorName });
      this.titleService.setTitle(pageTitle);
      this.metaService.updateTag({ name: 'description', content: pageTitle } as MetaDefinition);
    } else if (!this.isLoading() && !this.productSlugFromRoute) {
        const errorName = this.translocoService.translate('productPage.errorTitle');
        const errorPageTitle = this.translocoService.translate('productPage.pageTitleError', { errorName });
        this.titleService.setTitle(errorPageTitle);
        this.metaService.updateTag({ name: 'description', content: errorPageTitle } as MetaDefinition);
    }
  }

  private resetStateAndLoadInitialTitle(): void {
    this.isLoading.set(true); this.product.set(null); this.variations.set([]);
    this.variationAttributes.set([]); this.selectedOptions.set({});
    this.error.set(null); this.errorKey.set(null);
    this.addToCartError.set(null); this.addToCartErrorKey.set(null);
    this.isAddingToCart.set(false);
    this.selectedImage.set(null);
  }

  private setErrorStateAndTitle(errorMsgKey: string, errorTitleKeyForInterpolation: string): void {
    this.errorKey.set(errorMsgKey);
    this.error.set(this.translocoService.translate(errorMsgKey));
    this.isLoading.set(false);
    this.updatePageTitleAndMeta(null);
    this.cdr.markForCheck();
  }

  selectImageOnClick(imageNode: WooCommerceImage | null | undefined): void {
    if (imageNode) { this.selectedImage.set(imageNode); }
  }

  async addToCart(): Promise<void> {
    const productData = this.product();
    if (!productData) return;
    let productIdToAdd = productData.id;
    let variationIdToAdd: number | undefined;
    const quantityToAdd = 1;
    if (productData.type === 'variable') {
      const selectedVar = this.currentSelectedVariation();
      if (!selectedVar) {
        this.addToCartErrorKey.set('productPage.errorSelectVariant');
        this.addToCartError.set(this.translocoService.translate(this.addToCartErrorKey()!));
        this.cdr.markForCheck(); return;
      }
      if (selectedVar.stock_status !== 'instock' || !selectedVar.purchasable) {
        this.addToCartErrorKey.set('productPage.errorVariantNotAvailable');
        this.addToCartError.set(this.translocoService.translate(this.addToCartErrorKey()!));
        this.cdr.markForCheck(); return;
      }
      variationIdToAdd = selectedVar.id;
    } else {
      if (productData.stock_status !== 'instock' || !productData.purchasable) {
        this.addToCartErrorKey.set('productPage.errorProductNotAvailable');
        this.addToCartError.set(this.translocoService.translate(this.addToCartErrorKey()!));
        this.cdr.markForCheck(); return;
      }
    }
    this.isAddingToCart.set(true);
    this.addToCartError.set(null); this.addToCartErrorKey.set(null);
    try {
      await this.cartService.addItem(productIdToAdd, quantityToAdd, variationIdToAdd);
      this.uiStateService.openMiniCartWithTimeout();
    } catch (error) {
      console.error(`ProductPage: Error adding to cart:`, error);
      this.addToCartErrorKey.set('productPage.errorAddingToCart');
      this.addToCartError.set(this.translocoService.translate(this.addToCartErrorKey()!));
    } finally {
      this.isAddingToCart.set(false);
      this.cdr.markForCheck();
    }
  }

  async toggleWishlist(): Promise<void> {
    const productSlug = this.product()?.slug; // Produkt-Slug für Wishlist-Funktion
    const productName = this.product()?.name || '';
    const isLoggedIn = this.authService.getCurrentUserValue() !== null;

    if (!productSlug) return;
    if (!isLoggedIn) {
        this.uiStateService.showGlobalError(this.translocoService.translate('wishlist.errorNotLoggedInProductPage'));
        this.uiStateService.openLoginOverlay();
        return;
    }
    this.isLoading.set(true);
    try {
      if (this.isOnWishlist()) {
        await this.wishlistService.removeFromWishlist(productSlug);
      } else {
        await this.wishlistService.addToWishlist(productSlug);
      }
    } catch (error) {
        console.error("Error toggling wishlist from product page:", error);
        this.uiStateService.showGlobalError(this.translocoService.translate('wishlist.errorGeneral'));
    } finally {
        this.isLoading.set(false);
        this.cdr.markForCheck();
    }
  }

  goBack(): void { this.location.back(); }

  getAttributeTrackKey(attribute: WooCommerceAttribute): string {
    const slug = attribute.slug || attribute.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
    return slug.startsWith('pa_') ? slug : `pa_${slug}`;
  }

  getProductCurrencyCode(product: WooCommerceProduct | null): string {
    if (!product) return 'EUR';
    const currencyCodeMeta = product.meta_data?.find(m => m.key === '_currency');
    if (currencyCodeMeta?.value && typeof currencyCodeMeta.value === 'string' && currencyCodeMeta.value.length === 3) {
        return currencyCodeMeta.value.toUpperCase();
    }
    if (product.price_html) {
      if (product.price_html.includes('€')) return 'EUR';
      if (product.price_html.includes('$')) return 'USD';
    }
    return 'EUR';
  }

  private getProductCurrencySymbolFromCode(code: string): string {
    if (code === 'EUR') return '€';
    if (code === 'USD') return '$';
    return code;
  }
}