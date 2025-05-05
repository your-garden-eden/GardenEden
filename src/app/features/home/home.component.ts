import { Component, OnInit, inject, signal, ChangeDetectionStrategy, WritableSignal, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';

import { ShopifyService, Product } from '../../core/services/shopify.service';
import { NewsService, NewsArticle } from '../../core/services/news.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, ProductCardComponent, DatePipe],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent implements OnInit, OnDestroy {

  private shopifyService = inject(ShopifyService);
  private newsService = inject(NewsService);

  bestsellerProducts: WritableSignal<Product[]> = signal([]);
  isLoadingBestsellers: WritableSignal<boolean> = signal(false);
  errorBestsellers: WritableSignal<string | null> = signal(null);

  newsArticles: WritableSignal<NewsArticle[]> = signal([]);
  isLoadingNews: WritableSignal<boolean> = signal(false);
  errorNews: WritableSignal<string | null> = signal(null);

  private newsSubscription: Subscription | null = null;

  ngOnInit(): void {
    this.loadBestsellers();
    this.loadNews();
  }

  ngOnDestroy(): void {
      this.newsSubscription?.unsubscribe();
  }

  async loadBestsellers(): Promise<void> {
    this.isLoadingBestsellers.set(true);
    this.errorBestsellers.set(null);
    this.bestsellerProducts.set([]);
    try {
      const products = await this.shopifyService.getProductsSortedByBestSelling(15);
      if (products && products.length > 0) {
        this.bestsellerProducts.set(products);
      } else {
         this.bestsellerProducts.set([]);
      }
    } catch (err) {
      console.error('HomeComponent: Fehler beim Laden der Bestseller:', err);
      this.errorBestsellers.set('Fehler beim Laden der Bestseller.');
    } finally {
      this.isLoadingBestsellers.set(false);
    }
  }

  loadNews(): void {
    this.isLoadingNews.set(true);
    this.errorNews.set(null);
    this.newsArticles.set([]);
    this.newsSubscription = this.newsService.getNews().subscribe({
        next: (articles) => {
            if (articles && articles.length > 0) {
                this.newsArticles.set(articles);
            } else {
                this.newsArticles.set([]);
                console.log('HomeComponent: Keine News-Artikel erhalten.');
            }
            this.isLoadingNews.set(false);
        },
        error: (err) => {
            console.error('HomeComponent: Fehler beim Abonnieren der News:', err);
            this.errorNews.set('Fehler beim Laden der Garten-News.');
            this.isLoadingNews.set(false);
        }
    });
  }
}