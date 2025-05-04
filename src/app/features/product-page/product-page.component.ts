// /src/app/features/product-page/product-page.component.ts
// BASIEREND AUF DEINER FEHLERFREIEN VERSION + CART-LOGIK

import { Component, OnInit, inject, signal, WritableSignal, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, CurrencyPipe, Location } from '@angular/common'; // Location importieren, CurrencyPipe behalten
import { Title } from '@angular/platform-browser';
import { Observable, of, from, Subscription } from 'rxjs';
import { switchMap, tap, catchError, map } from 'rxjs/operators';

import { ShopifyService, Product, ShopifyImage } from '../../core/services/shopify.service';
import { CartService } from '../../shared/services/cart.service'; // CartService importieren
// Pipes importieren
import { ImageTransformPipe } from '../../shared/pipes/image-transform.pipe';
import { FormatPricePipe } from '../../shared/pipes/format-price.pipe';
import { SafeHtmlPipe } from '../../shared/pipes/safe-html.pipe';

@Component({
  selector: 'app-product-page',
  standalone: true,
  imports: [ // Imports aus deiner Version
    CommonModule,
    RouterLink,
    ImageTransformPipe,
    FormatPricePipe,
    SafeHtmlPipe
    // CurrencyPipe hier NICHT importiert
  ],
  templateUrl: './product-page.component.html',
  styleUrl: './product-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe] // CurrencyPipe über providers bereitgestellt (wie in deiner Version)
})
export class ProductPageComponent implements OnInit, OnDestroy {
  // Services injizieren
  private route = inject(ActivatedRoute);
  private shopifyService = inject(ShopifyService);
  private titleService = inject(Title);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private location = inject(Location);
  private cartService = inject(CartService); // CartService hinzugefügt

  // Signals (wie in deiner Version)
  product: WritableSignal<Product | null> = signal(null);
  isLoading: WritableSignal<boolean> = signal(true);
  error: WritableSignal<string | null> = signal(null);
  selectedImage: WritableSignal<ShopifyImage | null | undefined> = signal(null);
  isAddingToCart: WritableSignal<boolean> = signal(false);
  addToCartError: WritableSignal<string | null> = signal(null);
  isOnWishlist: WritableSignal<boolean> = signal(false);

  private routeSubscription?: Subscription;

  ngOnInit(): void {
    this.routeSubscription?.unsubscribe();
    this.routeSubscription = this.route.paramMap.pipe(
      map(params => params.get('handle')),
      tap(handle => {
         // Reset state
         this.isLoading.set(true);
         this.product.set(null);
         this.error.set(null);
         this.selectedImage.set(null);
         this.addToCartError.set(null); // Fehler zurücksetzen
         this.isAddingToCart.set(false); // Ladezustand zurücksetzen
         console.log(`ProductPage: Loading product with handle: ${handle}`);
       }),
      switchMap(handle => {
          if (!handle) { this.error.set('Kein Produkt-Handle angegeben.'); return of(null); }
          return from(this.shopifyService.getProductByHandle(handle)).pipe(
             catchError(err => { console.error(/*...*/); this.error.set('Fehler beim Laden des Produkts.'); return of(null); })
          );
      })
    ).subscribe((productData: Product | null) => {
        if (productData) {
            this.product.set(productData);
            this.selectedImage.set(productData.images?.edges?.[0]?.node);
            this.titleService.setTitle(`${productData.title} - Your Garden Eden`);
            this.error.set(null);
            console.log('Produktdaten geladen:', productData);
        } else if (!this.error()) {
            this.error.set('Produkt nicht gefunden.');
            this.titleService.setTitle('Produkt nicht gefunden - Your Garden Eden');
        }
        this.isLoading.set(false);
        this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
      this.routeSubscription?.unsubscribe();
  }

  selectImage(imageNode: ShopifyImage | null | undefined): void {
    if (imageNode) {
        this.selectedImage.set(imageNode);
    }
  }

  // --- NEU: Getter für erste verfügbare Variante ---
  get firstAvailableVariantId(): string | null {
    const productData = this.product();
    if (!productData?.variants?.edges) { return null; }
    const availableVariant = productData.variants.edges.find(edge => edge.node.availableForSale);
    return availableVariant?.node?.id ?? null;
  }
  // --- ENDE NEU ---

  // --- NEU: addToCart Methode implementiert ---
  async addToCart(): Promise<void> {
    const variantId = this.firstAvailableVariantId;
    if (!variantId) {
      this.addToCartError.set('Produktvariante nicht verfügbar oder nicht ausgewählt.');
      return;
    }
    this.isAddingToCart.set(true);
    this.addToCartError.set(null);
    try {
      await this.cartService.addLine(variantId, 1);
      console.log(`ProductPage: Variant ${variantId} added successfully.`);
      // Optional: Erfolgsfeedback
    } catch (error) {
      console.error(`ProductPage: Error adding variant ${variantId} to cart:`, error);
      this.addToCartError.set('Fehler beim Hinzufügen zum Warenkorb.');
    } finally {
      this.isAddingToCart.set(false);
      this.cdr.markForCheck(); // Wichtig für UI Update bei OnPush
    }
  }
  // --- ENDE NEU ---

  // Dummy Wishlist-Logik (wie in deiner Version)
  toggleWishlist(): void {
    this.isOnWishlist.update(current => !current);
    console.log('Wishlist getoggled (Dummy)');
   }

  // goBack Methode (wie in deiner Version)
  goBack(): void {
    this.location.back();
  }
}