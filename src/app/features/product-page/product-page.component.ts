// src/app/features/product-page/product-page.component.ts
import {
  Component, OnInit, inject, signal, WritableSignal, ChangeDetectionStrategy,
  ChangeDetectorRef, OnDestroy, computed, Signal, effect, PLATFORM_ID, untracked, isDevMode
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, CurrencyPipe, Location, isPlatformBrowser, DOCUMENT } from '@angular/common';
import { Meta } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { startWith } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';

import {
  WoocommerceService, WooCommerceProduct, WooCommerceImage,
  WooCommerceAttribute, WooCommerceProductVariation
} from '../../core/services/woocommerce.service';
import { CartService } from '../../shared/services/cart.service';
import { WishlistService } from '../../shared/services/wishlist.service';
import { AuthService } from '../../shared/services/auth.service';
import { UiStateService } from '../../shared/services/ui-state.service';
import { SafeHtmlPipe } from '../../shared/pipes/safe-html.pipe';

import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { FormsModule } from '@angular/forms';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { TrackingService } from '../../core/services/tracking.service';
import { JsonLdService, Schema } from '../../core/services/json-ld.service';
import { SeoService } from '../../core/services/seo.service'; // HINZUGEFÜGT

interface SelectedOptions {
  [attributeSlug: string]: string;
}

@Component({
  selector: 'app-product-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    SafeHtmlPipe,
    TranslocoModule,
    FormsModule,
    LoadingSpinnerComponent,
  ],
  templateUrl: './product-page.component.html',
  styleUrls: ['./product-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe],
})
export class ProductPageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private woocommerceService = inject(WoocommerceService);
  public cartService = inject(CartService);
  public wishlistService = inject(WishlistService);
  public authService = inject(AuthService);
  private uiStateService = inject(UiStateService);
  private metaService = inject(Meta);
  private translocoService = inject(TranslocoService);
  private location = inject(Location);
  private cdr = inject(ChangeDetectorRef);
  private currencyPipe = inject(CurrencyPipe);
  private trackingService = inject(TrackingService);
  private jsonLdService = inject(JsonLdService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private seoService = inject(SeoService); // HINZUGEFÜGT
  
  product: WritableSignal<WooCommerceProduct | null> = signal(null);
  variations: WritableSignal<WooCommerceProductVariation[]> = signal([]);
  variationAttributes: WritableSignal<WooCommerceAttribute[]> = signal([]);
  selectedOptions: WritableSignal<SelectedOptions> = signal({});
  isDescriptionExpanded: WritableSignal<boolean> = signal(false);
  
  selectedImage: WritableSignal<WooCommerceImage | null | undefined> = signal(null);
  isLoading: WritableSignal<boolean> = signal(true);
  error: WritableSignal<string | null> = signal(null);
  private errorKey: WritableSignal<string | null> = signal(null);

  isAddingToCart: WritableSignal<boolean> = signal(false);
  isTogglingWishlist: WritableSignal<boolean> = signal(false);
  addToCartError: WritableSignal<string | null> = signal(null);
  private addToCartErrorKey: WritableSignal<string | null> = signal(null);
  
  public canShare: WritableSignal<boolean> = signal(false);

  // HINZUGEFÜGT: Signal für den dynamischen alt-Text
  public imageAltText: Signal<string> = computed(() => {
    const product = this.product();
    if (!product) {
      // Sinnvoller Fallback, bis das Produkt geladen ist
      return this.translocoService.translate('general.loadingText');
    }
    const categoryName = product.categories?.[0]?.name;
    return this.seoService.generateImageAltText(product.name, categoryName);
  });

  currentSelectedVariation: Signal<WooCommerceProductVariation | null> = computed(() => {
    const productData = this.product();
    const allVariations = this.variations();
    const currentSelections = this.selectedOptions();
    if (!productData || productData.type !== 'variable' || allVariations.length === 0 || Object.keys(currentSelections).length === 0) return null;
    const allAttributesSelected = this.variationAttributes().every(attr => currentSelections[this.getAttributeTrackKey(attr)]);
    if (!allAttributesSelected && this.variationAttributes().length > 0) return null;
    return allVariations.find(variation => variation.attributes.every(attr => {
        const selectedOptionKey = this.variationAttributes().find(va => va.id === attr.id || va.name === attr.name);
        if (!selectedOptionKey) return false;
        const trackKey = this.getAttributeTrackKey(selectedOptionKey);
        const selectedOptionSlugInUI = currentSelections[trackKey];
        const variationOptionSlug = this.getNormalizedOptionValue(attr.option);
        return selectedOptionSlugInUI === variationOptionSlug;
      })) || null;
  });
  displayPriceFormatted: Signal<string> = computed(() => {
    const selectedVar = this.currentSelectedVariation();
    const product = this.product();
    const lang = this.translocoService.getActiveLang() || 'de-DE';
    const currencyCode = this.getProductCurrencyCode(product);
    let priceToFormat: string | undefined, priceHtmlToUse: string | undefined;
    if (selectedVar) { priceHtmlToUse = selectedVar.price_html; priceToFormat = selectedVar.price; }
    else if (product) { priceHtmlToUse = product.price_html; priceToFormat = product.price; }
    if (priceHtmlToUse && (priceHtmlToUse.includes('€') || priceHtmlToUse.includes('$') || priceHtmlToUse.includes(currencyCode))) return priceHtmlToUse;
    if (priceToFormat) {
      const numPrice = parseFloat(priceToFormat);
      if (!isNaN(numPrice)) { try { return this.currencyPipe.transform(numPrice, currencyCode, 'symbol', '1.2-2', lang) || ''; } catch (e) { return `${numPrice.toFixed(2)}${this.getProductCurrencySymbolFromCode(currencyCode)}`; } }
    }
    return product?.price_html || '';
  });
  displayRegularPriceFormatted: Signal<string | undefined> = computed(() => {
    const selectedVar = this.currentSelectedVariation();
    const mainProduct = this.product();
    const lang = this.translocoService.getActiveLang() || 'de-DE';
    let currencyCode = this.getProductCurrencyCode(mainProduct);
    let currentPriceNumStr: string | undefined, regularPriceNumStr: string | undefined;
    let isOnSaleFlag: boolean | undefined;
    if (selectedVar) { currentPriceNumStr = selectedVar.price; regularPriceNumStr = selectedVar.regular_price; isOnSaleFlag = selectedVar.on_sale; }
    else if (mainProduct) { currentPriceNumStr = mainProduct.price; regularPriceNumStr = mainProduct.regular_price; isOnSaleFlag = mainProduct.on_sale; }
    if (isOnSaleFlag && regularPriceNumStr && regularPriceNumStr !== currentPriceNumStr) {
      const numRegPrice = parseFloat(regularPriceNumStr);
      if (!isNaN(numRegPrice)) { try { const formatted = this.currencyPipe.transform(numRegPrice, currencyCode, 'symbol', '1.2-2', lang); return formatted === null ? undefined : formatted; } catch (e) { return `${numRegPrice.toFixed(2)}${this.getProductCurrencySymbolFromCode(currencyCode)}`; } }
    }
    return undefined;
  });
  displayOnSale: Signal<boolean> = computed(() => this.currentSelectedVariation()?.on_sale ?? this.product()?.on_sale ?? false);
  public isLoggedIn: Signal<boolean> = toSignal(this.authService.isLoggedIn$, { initialValue: false });
  readonly isOnWishlist: Signal<boolean> = computed(() => {
    const product = this.product();
    if (!product) return false;
    const selectedVar = this.currentSelectedVariation();
    if (product.type === 'variable' && selectedVar) return this.wishlistService.wishlistProductIds().has(`${product.id}_${selectedVar.id}`);
    return this.wishlistService.wishlistProductIds().has(`${product.id}_0`);
  });

  private subscriptions = new Subscription();

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
    const dataSub = this.route.data.subscribe(({ product }) => {
      this.isLoading.set(true);
      this.resetState();

      if (product) {
        this.product.set(product);
        this.updateMetadataAndSchema(product);
        this.trackingService.trackViewItem(product);
        if (product.type === 'variable' && product.variations && product.variations.length > 0) {
          this.loadVariations(product.id, product);
        } else {
          this.variations.set([]);
          this.variationAttributes.set([]);
          this.isLoading.set(false);
        }
      } else {
        this.errorKey.set('productPage.errorNotFound');
        this.error.set(this.translocoService.translate(this.errorKey()!));
        this.isLoading.set(false);
      }
      this.cdr.markForCheck();
    });
    this.subscriptions.add(dataSub);

    const langSub = this.translocoService.langChanges$.pipe(startWith(this.translocoService.getActiveLang()))
      .subscribe(() => {
        if (this.errorKey()) this.error.set(this.translocoService.translate(this.errorKey()!));
        if (this.addToCartErrorKey()) this.addToCartError.set(this.translocoService.translate(this.addToCartErrorKey()!));
        this.cdr.markForCheck();
      });
    this.subscriptions.add(langSub);
    
    if (isPlatformBrowser(this.platformId)) {
      this.canShare.set(!!navigator.share);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.jsonLdService.removeSchema('product');
  }
  
  async shareProduct(): Promise<void> {
    const product = this.product();
    if (!product || !isPlatformBrowser(this.platformId)) {
      return;
    }

    // ACHTUNG: Hier muss ein neuer Translation-Key hinzugefügt werden.
    const shareText = this.translocoService.translate('productPage.share.discoveredAt', { productName: product.name });

    const shareData: ShareData = {
      title: product.name,
      text: shareText,
      url: this.document.location.href
    };

    try {
      if (this.canShare()) {
        await navigator.share(shareData);
        this.trackingService.trackShare(product.name, this.document.location.href);
      }
    } catch (err) {
      if (isDevMode()) {
        console.error('Error sharing product:', err);
      }
    }
  }
  
  private loadVariations(productId: number, productData: WooCommerceProduct): void {
      this.woocommerceService.getProductVariations(productId).subscribe({
          next: variationsData => {
              this.variations.set(variationsData);
              this.prepareVariationAttributes(productData, variationsData);
              this.isLoading.set(false);
              this.cdr.markForCheck();
          },
          error: err => {
              if (isDevMode()) console.error("Failed to load variations", err);
              this.isLoading.set(false);
              this.cdr.markForCheck();
          }
      });
  }

  private updateMetadataAndSchema(product: WooCommerceProduct): void {
    const defaultDescription = this.translocoService.translate('general.defaultMetaDescription');
    const rawDescription = product.short_description || product.description || defaultDescription;
    const cleanedDescription = this._stripHtml(rawDescription).substring(0, 155);
    this.metaService.updateTag({ name: 'description', content: cleanedDescription });
    
    const productSchema = this.generateProductSchema(product);
    this.jsonLdService.setSchema('product', productSchema);
  }

  private generateProductSchema(product: WooCommerceProduct): Schema {
    const schema: Schema = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      'name': product.name,
      'description': this._stripHtml(product.short_description || product.description || '').substring(0, 5000),
      'sku': product.sku,
      'image': product.images?.[0]?.src || '',
      'brand': {
        '@type': 'Brand',
        'name': 'Your Garden Eden'
      },
      'offers': {
        '@type': 'Offer',
        'url': product.permalink,
        'priceCurrency': this.getProductCurrencyCode(product),
        'price': product.price ? parseFloat(product.price).toFixed(2) : '0.00',
        'availability': this._mapStockStatusToSchema(product.stock_status),
      }
    };

    if (product.rating_count > 0) {
      schema['aggregateRating'] = {
        '@type': 'AggregateRating',
        'ratingValue': parseFloat(product.average_rating).toFixed(2),
        'reviewCount': product.rating_count
      };
    }

    return schema;
  }
  
  private _mapStockStatusToSchema(status: 'instock' | 'outofstock' | 'onbackorder' | null): string {
    switch (status) {
      case 'instock':
        return 'https://schema.org/InStock';
      case 'outofstock':
        return 'https://schema.org/OutOfStock';
      case 'onbackorder':
        return 'https://schema.org/OnBackorder';
      default:
        return 'https://schema.org/OutOfStock';
    }
  }

  private _stripHtml(html: string): string {
    if (!html) return '';
    return html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
  }
  
  private resetState(): void {
    this.product.set(null);
    this.variations.set([]);
    this.variationAttributes.set([]);
    this.selectedOptions.set({});
    this.error.set(null);
    this.errorKey.set(null);
    this.addToCartError.set(null);
    this.addToCartErrorKey.set(null);
    this.isAddingToCart.set(false);
    this.isTogglingWishlist.set(false);
    this.selectedImage.set(null);
    this.isDescriptionExpanded.set(false);
  }

  toggleDescription(): void { this.isDescriptionExpanded.update(value => !value); }
  selectImageOnClick(imageNode: WooCommerceImage | null | undefined): void { if (imageNode) { this.selectedImage.set(imageNode); } }
  goBack(): void { this.location.back(); }
  
  private prepareVariationAttributes(product: WooCommerceProduct, variationsData: WooCommerceProductVariation[]): void {
    if (product.type !== 'variable' || !product.attributes) return;
    const attributesForSelection = product.attributes.filter(attr => attr.variation);
    this.variationAttributes.set(attributesForSelection);
    const initialSelected: SelectedOptions = {};
    if (product.default_attributes && product.default_attributes.length > 0) {
        product.default_attributes.forEach(defAttr => {
            const attrDefinition = attributesForSelection.find(a => a.id === defAttr.id || a.name === defAttr.name);
            if (attrDefinition) initialSelected[this.getAttributeTrackKey(attrDefinition)] = this.getNormalizedOptionValue(defAttr.option);
        });
    } else if (variationsData.length > 0 && attributesForSelection.length > 0) {
        const firstPurchasableVariation = variationsData.find(v => v.purchasable && v.stock_status === 'instock');
        const firstVariationToUse = firstPurchasableVariation || variationsData[0];
        if (firstVariationToUse && firstVariationToUse.attributes) {
            attributesForSelection.forEach(attrDef => {
                const matchingVarAttr = firstVariationToUse.attributes.find(va => va.id === attrDef.id || va.name === attrDef.name);
                if (matchingVarAttr) initialSelected[this.getAttributeTrackKey(attrDef)] = this.getNormalizedOptionValue(matchingVarAttr.option);
            });
        }
    }
    this.selectedOptions.set(initialSelected);
  }
  onOptionSelect(attributeIdentifier: string, optionValue: string): void { this.selectedOptions.update(current => ({ ...current, [attributeIdentifier]: this.getNormalizedOptionValue(optionValue) })); this.addToCartError.set(null); this.addToCartErrorKey.set(null); }
  isOptionSelected(attributeIdentifier: string, optionValue: string): boolean { return this.selectedOptions()[attributeIdentifier] === this.getNormalizedOptionValue(optionValue); }
  isOptionAvailable(attribute: WooCommerceAttribute, option: string): boolean {
    const allVariations = this.variations(); if (!allVariations || allVariations.length === 0) return true;
    const currentSelections = this.selectedOptions(); const attributeTrackKey = this.getAttributeTrackKey(attribute); const normalizedOption = this.getNormalizedOptionValue(option);
    const matchingVariations = allVariations.filter(variation => {
      if (!variation.purchasable || variation.stock_status !== 'instock') return false;
      return variation.attributes.every(varAttr => {
        const otherAttrDef = this.variationAttributes().find(va => va.id === varAttr.id || va.name === varAttr.name); if (!otherAttrDef) return true;
        const otherTrackKey = this.getAttributeTrackKey(otherAttrDef);
        if (otherTrackKey === attributeTrackKey) return true;
        if (currentSelections[otherTrackKey]) return this.getNormalizedOptionValue(varAttr.option) === currentSelections[otherTrackKey];
        return true;
      });
    });
    return matchingVariations.some(variation => variation.attributes.some(varAttr => { const varAttrTrackKey = this.getAttributeTrackKeyForVariationAttribute(varAttr); return varAttrTrackKey === attributeTrackKey && this.getNormalizedOptionValue(varAttr.option) === normalizedOption; }) );
  }
  getOptionsForAttribute(attribute: WooCommerceAttribute): string[] { return attribute.options; }
  getNormalizedOptionValue(optionString: string): string { if (typeof optionString !== 'string') return ''; return optionString.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, ''); }
  getAttributeTrackKey(attribute: WooCommerceAttribute): string { const slug = attribute.slug || attribute.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, ''); return slug.startsWith('pa_') ? slug : `pa_${slug}`; }
  private getAttributeTrackKeyForVariationAttribute(variationAttribute: { id: number; name: string; option: string; }): string | null { const mainAttribute = this.variationAttributes().find(attr => attr.id === variationAttribute.id || attr.name === variationAttribute.name); return mainAttribute ? this.getAttributeTrackKey(mainAttribute) : null; }
  getProductCurrencyCode(product: WooCommerceProduct | null): string { if (!product) return 'EUR'; const currencyCodeMeta = product.meta_data?.find(m => m.key === '_currency'); if (currencyCodeMeta?.value && typeof currencyCodeMeta.value === 'string' && currencyCodeMeta.value.length === 3) return currencyCodeMeta.value.toUpperCase(); if (product.price_html) { if (product.price_html.includes('€')) return 'EUR'; if (product.price_html.includes('$')) return 'USD'; } return 'EUR'; }
  private getProductCurrencySymbolFromCode(code: string): string { if (code === 'EUR') return '€'; if (code === 'USD') return '$'; return code; }
  async addToCart(): Promise<void> {
    const productData = this.product(); if (!productData) return;
    let productIdToAdd = productData.id; let variationIdToAdd: number | undefined; const quantityToAdd = 1;
    let selectedVar: WooCommerceProductVariation | null = null;
    if (productData.type === 'variable') {
      selectedVar = this.currentSelectedVariation();
      if (!selectedVar) { this.addToCartErrorKey.set('productPage.errorSelectVariant'); this.addToCartError.set(this.translocoService.translate(this.addToCartErrorKey()!)); this.cdr.markForCheck(); return; }
      if (selectedVar.stock_status !== 'instock' || !selectedVar.purchasable) { this.addToCartErrorKey.set('productPage.errorVariantNotAvailable'); this.addToCartError.set(this.translocoService.translate(this.addToCartErrorKey()!)); this.cdr.markForCheck(); return; }
      variationIdToAdd = selectedVar.id;
    } else {
      if (productData.stock_status !== 'instock' || !productData.purchasable) { this.addToCartErrorKey.set('productPage.errorProductNotAvailable'); this.addToCartError.set(this.translocoService.translate(this.addToCartErrorKey()!)); this.cdr.markForCheck(); return; }
    }
    this.trackingService.trackAddToCart(productData, quantityToAdd, selectedVar || undefined);
    this.isAddingToCart.set(true); this.addToCartError.set(null); this.addToCartErrorKey.set(null);
    try {
      await this.cartService.addItem(productIdToAdd, quantityToAdd, variationIdToAdd);
      this.uiStateService.showGlobalSuccess(this.translocoService.translate('productPage.successAddToCart', { productName: productData.name }));
    } catch (error) {
      console.error(`ProductPage: Error adding to cart:`, error);
      this.addToCartErrorKey.set('productPage.errorAddingToCart');
      this.addToCartError.set(this.translocoService.translate(this.addToCartErrorKey()!));
    } finally { this.isAddingToCart.set(false); this.cdr.markForCheck(); }
  }
  async toggleWishlist(): Promise<void> {
    const product = this.product(); if (!product) return;
    if (!this.isLoggedIn()) { this.uiStateService.openLoginOverlay(); return; }
    const selectedVar = this.currentSelectedVariation();
    const productId = product.id; const variationId = product.type === 'variable' && selectedVar ? selectedVar.id : 0;
    this.isTogglingWishlist.set(true); 
    try {
      if (this.isOnWishlist()) await this.wishlistService.removeFromWishlist(productId, variationId);
      else await this.wishlistService.addToWishlist(productId, variationId);
    } catch (error) {
        console.error("Error toggling wishlist from product page:", error);
        this.uiStateService.showGlobalError(this.translocoService.translate('wishlist.errorGeneral'));
    } finally { this.isTogglingWishlist.set(false); this.cdr.markForCheck(); }
  }
}