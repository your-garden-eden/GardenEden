// src/app/core/services/search-state.service.ts
import { Injectable, signal, WritableSignal, computed, inject } from '@angular/core';
import { Subject, of, from, firstValueFrom } from 'rxjs';
import { debounceTime, switchMap, catchError, tap, filter, map } from 'rxjs/operators';
import { HttpParams } from '@angular/common/http';
import { WoocommerceService, WooCommerceProduct, WooCommerceProductsResponse } from './woocommerce.service';
import { FilterStateService } from './filter-state.service';
import { TranslocoService } from '@ngneat/transloco';
import { NavSubItem, navItems } from '../data/navigation.data'; // HINZUGEFÜGT

export interface SearchState {
  searchTerm: string;
  searchResults: readonly WooCommerceProduct[];
  matchingCategories: readonly NavSubItem[]; // HINZUGEFÜGT
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMoreResults: boolean;
}

const initialState: SearchState = {
  searchTerm: '',
  searchResults: [],
  matchingCategories: [], // HINZUGEFÜGT
  isLoading: false,
  isLoadingMore: false,
  error: null,
  hasMoreResults: false,
};

@Injectable({
  providedIn: 'root',
})
export class SearchStateService {
  private woocommerceService = inject(WoocommerceService);
  private translocoService = inject(TranslocoService);
  private filterStateService = inject(FilterStateService);

  private state: WritableSignal<SearchState> = signal(initialState);

  public readonly searchResults = computed(() => this.state().searchResults);
  public readonly matchingCategories = computed(() => this.state().matchingCategories); // HINZUGEFÜGT
  public readonly isLoading = computed(() => this.state().isLoading);
  public readonly isLoadingMore = computed(() => this.state().isLoadingMore);
  public readonly error = computed(() => this.state().error);
  public readonly hasMoreResults = computed(() => this.state().hasMoreResults);
  public readonly searchTerm = computed(() => this.state().searchTerm);

  public readonly searchTrigger$ = new Subject<string | null>();

  private currentPage = 1;
  private readonly SEARCH_RESULTS_PER_PAGE = 30;

  constructor() {
    this.setupSearchPipeline();
  }
  
  public applyFiltersAndSearch(): void {
    this.searchTrigger$.next(this.searchTerm());
  }

  public async loadMore(): Promise<void> {
    const currentState = this.state();
    if (currentState.isLoading || currentState.isLoadingMore || !currentState.hasMoreResults) return;
    this.state.update(s => ({ ...s, isLoadingMore: true }));
    this.currentPage++;
    
    const categorySlug = this.filterStateService.selectedCategorySlug();
    const filterParams = this.filterStateService.getFilterParams();
    
    try {
      const category = categorySlug ? await firstValueFrom(this.woocommerceService.getCategoryBySlug(categorySlug)) : undefined;
      await firstValueFrom(this.fetchProducts(currentState.searchTerm, this.currentPage, category?.id, filterParams));
    } catch (error) {
       console.error('Error during loadMore:', error);
    }
  }

  private setupSearchPipeline(): void {
    this.searchTrigger$.pipe(
      debounceTime(400),
      tap(term => {
        const cleanTerm = (term ?? '').trim();
        this.currentPage = 1;
        const matchingCats = this.findMatchingCategories(cleanTerm); // Kategorien hier finden
        this.state.update(s => ({
            ...initialState,
            searchTerm: cleanTerm,
            matchingCategories: matchingCats, // Kategorien im State setzen
            isLoading: cleanTerm.length >= 3,
            error: null,
        }));
      }),
      filter(term => (term ?? '').length >= 3),
      switchMap(term => {
        this.state.update(s => ({ ...s, isLoading: true }));
        const filterParams = this.filterStateService.getFilterParams();
        const categorySlug = this.filterStateService.selectedCategorySlug();
        
        if (!categorySlug) {
          return this.fetchProducts(term!, 1, undefined, filterParams);
        } else {
          return this.woocommerceService.getCategoryBySlug(categorySlug).pipe(
            switchMap(category => {
              if (!category) {
                throw new Error(`Category with slug '${categorySlug}' not found.`);
              }
              return this.fetchProducts(term!, 1, category.id, filterParams)
            }),
            catchError(err => {
              console.error(`SearchStateService: Fehler in der Such-Pipeline:`, err);
              this.state.update(s => ({ ...s, isLoading: false, searchResults: [], error: this.translocoService.translate('header.searchError') }));
              return of(null);
            })
          );
        }
      })
    ).subscribe();
  }

  private findMatchingCategories(term: string): NavSubItem[] {
    if (term.length < 3) return [];

    const lowerCaseTerm = term.toLowerCase();
    const allSubItems: NavSubItem[] = navItems.flatMap(item => item.subItems || []);
    
    return allSubItems.filter(subItem => 
      this.translocoService.translate(subItem.i18nId).toLowerCase().includes(lowerCaseTerm)
    );
  }

  private fetchProducts(term: string, page: number, categoryId?: number, otherParams?: HttpParams) {
    let params = otherParams || new HttpParams();
    params = params.set('search', term);
    
    return this.woocommerceService.getProducts(categoryId, this.SEARCH_RESULTS_PER_PAGE, page, params).pipe(
      tap((response: WooCommerceProductsResponse) => {
        const filteredProducts = this.filterProductsWithImages(response.products);
        this.state.update(s => ({
          ...s,
          searchResults: page === 1 ? filteredProducts : [...s.searchResults, ...filteredProducts],
          isLoading: false,
          isLoadingMore: false,
          hasMoreResults: (s.searchResults.length + filteredProducts.length) < response.totalCount,
        }));
      }),
      catchError(err => {
        console.error('SearchStateService: Fehler bei Produktsuche:', err);
        this.state.update(s => ({
          ...s,
          isLoading: false,
          isLoadingMore: false,
          error: this.translocoService.translate('header.searchError'),
        }));
        return of(null);
      })
    );
  }

  private filterProductsWithImages(products: WooCommerceProduct[]): WooCommerceProduct[] {
    if (!products) return [];
    return products.filter(product => product.images?.[0]?.src);
  }
}