import { Component, OnInit, inject, signal, ChangeDetectionStrategy, WritableSignal, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common'; // DecimalPipe hinzugefügt
import { Subscription } from 'rxjs';

import { ShopifyService, Product } from '../../core/services/shopify.service';
import { NewsService, NewsArticle } from '../../core/services/news.service';
import { WeatherService, WeatherData } from '../../core/services/weather.service';
import { ProductCardComponent } from '../../shared/components/product-card/product-card.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, ProductCardComponent, DatePipe, DecimalPipe], // DecimalPipe hinzugefügt
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent implements OnInit, OnDestroy {

  private shopifyService = inject(ShopifyService);
  private newsService = inject(NewsService);
  private weatherService = inject(WeatherService);

  bestsellerProducts: WritableSignal<Product[]> = signal([]);
  isLoadingBestsellers: WritableSignal<boolean> = signal(false);
  errorBestsellers: WritableSignal<string | null> = signal(null);

  newsArticles: WritableSignal<NewsArticle[]> = signal([]);
  isLoadingNews: WritableSignal<boolean> = signal(false);
  errorNews: WritableSignal<string | null> = signal(null);

  weatherData: WritableSignal<WeatherData | null> = signal(null);
  isLoadingWeather: WritableSignal<boolean> = signal(false);
  errorWeather: WritableSignal<string | null> = signal(null);

  private newsSubscription: Subscription | null = null;
  private weatherSubscription: Subscription | null = null;

  ngOnInit(): void {
    this.loadBestsellers();
    this.loadNews();
    this.loadWeatherData();
  }

  ngOnDestroy(): void {
      this.newsSubscription?.unsubscribe();
      this.weatherSubscription?.unsubscribe();
  }

  async loadBestsellers(): Promise<void> {
    this.isLoadingBestsellers.set(true);
    this.errorBestsellers.set(null);
    this.bestsellerProducts.set([]);
    try {
      const products = await this.shopifyService.getProductsSortedByBestSelling(15);
      this.bestsellerProducts.set(products ?? []);
    } catch (err) {
      console.error('HomeComponent: Bestseller Fehler:', err);
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
            this.newsArticles.set(articles ?? []);
            if (!articles) console.log('HomeComponent: Keine News erhalten.');
            this.isLoadingNews.set(false);
        },
        error: (err) => {
            console.error('HomeComponent: News Fehler:', err);
            this.errorNews.set('Fehler beim Laden der Garten-News.');
            this.isLoadingNews.set(false);
        }
    });
  }

  loadWeatherData(): void {
    this.isLoadingWeather.set(true);
    this.errorWeather.set(null);
    this.weatherData.set(null);
    this.weatherSubscription = this.weatherService.getCurrentWeather().subscribe({
      next: (data) => {
        this.weatherData.set(data);
        if (!data) console.log('HomeComponent: Keine Wetterdaten erhalten.');
        this.isLoadingWeather.set(false);
      },
      error: (err) => {
        console.error('HomeComponent: Wetter Fehler:', err);
        this.errorWeather.set('Fehler beim Laden der Wetterdaten.');
        this.isLoadingWeather.set(false);
      }
    });
  }
}