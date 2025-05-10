import { Component, OnInit, inject, signal, ChangeDetectionStrategy, WritableSignal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common'; // DecimalPipe war schon da, DatePipe wird jetzt nicht mehr direkt benötigt

import { ShopifyService, Product } from '../../core/services/shopify.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';

@Component({
  selector: 'app-home',
  standalone: true,
  // DatePipe wird nicht mehr benötigt, wenn News wegfallen, aber schadet nicht, wenn es drin bleibt.
  // CommonModule wird für @if, @for etc. benötigt. DecimalPipe ggf. für Produktpreise.
  imports: [CommonModule, ProductCardComponent, DatePipe, DecimalPipe],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent implements OnInit {

  private shopifyService = inject(ShopifyService);

  bestsellerProducts: WritableSignal<Product[]> = signal([]);
  isLoadingBestsellers: WritableSignal<boolean> = signal(false);
  errorBestsellers: WritableSignal<string | null> = signal(null);

  ngOnInit(): void {
    this.loadBestsellers();
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
      this.errorBestsellers.set('Fehler beim Laden der Bestseller.');
    } finally {
      this.isLoadingBestsellers.set(false);
    }
  }
}