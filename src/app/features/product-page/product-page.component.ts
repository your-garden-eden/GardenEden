import { Component, OnInit, inject, signal, WritableSignal, ChangeDetectionStrategy, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, CurrencyPipe, Location } from '@angular/common'; // Location importieren
import { Title } from '@angular/platform-browser';
import { Observable, of, from, Subscription } from 'rxjs';
import { switchMap, tap, catchError, map } from 'rxjs/operators';

import { ShopifyService, Product, ShopifyImage } from '../../core/services/shopify.service';
import { ImageTransformPipe } from '../../shared/pipes/image-transform.pipe';
import { FormatPricePipe } from '../../shared/pipes/format-price.pipe';
import { SafeHtmlPipe } from '../../shared/pipes/safe-html.pipe';

@Component({
  selector: 'app-product-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ImageTransformPipe,
    FormatPricePipe,
    SafeHtmlPipe
  ],
  templateUrl: './product-page.component.html',
  styleUrl: './product-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CurrencyPipe]
})
export class ProductPageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private shopifyService = inject(ShopifyService);
  private titleService = inject(Title);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private location = inject(Location); // Location injizieren

  // Signals
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
      // ... (Rest der Pipe bleibt gleich) ...
       map(params => params.get('handle')),
       tap(handle => { /* Reset Signals */ }),
       switchMap(handle => {
           if (!handle) { /* Fehlerbehandlung */ return of(null); }
           return from(this.shopifyService.getProductByHandle(handle));
       }),
       catchError(err => { /* Fehlerbehandlung */ return of(null); })
    ).subscribe((productData: Product | null) => {
        if (productData) {
            this.product.set(productData);
            this.selectedImage.set(productData.images?.edges?.[0]?.node);
            this.titleService.setTitle(`${productData.title} - Your Garden Eden`);
            this.error.set(null);
            console.log('Produktdaten geladen:', productData);
            const firstVariantPrice = productData.variants?.edges?.[0]?.node?.price;
            console.log('Preis des ersten Variants:', firstVariantPrice);
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

  addToCart(): void { /* ... (Dummy-Logik bleibt vorerst) ... */ }
  toggleWishlist(): void { /* ... (Dummy-Logik bleibt vorerst) ... */ }

  // --- NEUE Methode für Zurück-Button ---
  goBack(): void {
    this.location.back();
  }
  // --- ENDE NEU ---
}