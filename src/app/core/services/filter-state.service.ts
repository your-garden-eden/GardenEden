// src/app/core/services/filter-state.service.ts
import { Injectable, signal, computed, effect } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { NavItem, NavSubItem, navItems } from '../data/navigation.data';

/**
 * Definiert die Struktur des globalen Filterzustands.
 * Der Slug wird verwendet, da er in der statischen Navigation verfügbar ist.
 */
export interface FilterState {
  priceRange: {
    min: number | null;
    max: number | null;
  };
  inStockOnly: boolean;
  selectedCategorySlug: string | null;
}

/**
 * Eine abgeflachte, vereinheitlichte Struktur, die für das Dropdown-Menü geeignet ist.
 * `isMainCategory` dient zur visuellen Unterscheidung (z.B. Einrückung oder Fettdruck).
 * `slug` ist `null` für Hauptkategorien, da sie nicht direkt auswählbar sind.
 */
export interface FilterCategoryOption {
  label: string;
  i18nId: string;
  isMainCategory: boolean;
  slug: string | null;
}

/**
 * Service zur zentralen Verwaltung des Zustands von Produktfiltern.
 * Er agiert als "Single Source of Truth" für alle Filter-Einstellungen in der Anwendung.
 */
@Injectable({
  providedIn: 'root',
})
export class FilterStateService {
  // --- PRIVATE STATE ---
  private readonly state = signal<FilterState>({
    priceRange: { min: null, max: null },
    inStockOnly: false,
    selectedCategorySlug: null,
  });

  // --- PUBLIC READ-ONLY SIGNALS ---
  public readonly priceRange = computed(() => this.state().priceRange);
  public readonly inStockOnly = computed(() => this.state().inStockOnly);
  public readonly selectedCategorySlug = computed(() => this.state().selectedCategorySlug);

  // Verarbeitet die statischen Navigationsdaten in eine flache Liste für das Dropdown.
  public readonly categoryOptions = computed<FilterCategoryOption[]>(() => {
    const options: FilterCategoryOption[] = [];
    navItems.forEach(item => {
      // Nur Hauptkategorien mit Unterpunkten hinzufügen, die zu echten Produktlisten führen
      if (item.subItems && item.subItems.length > 0) {
        options.push({
          label: item.label,
          i18nId: item.i18nId,
          isMainCategory: true,
          slug: null, // Hauptkategorien sind nicht auswählbar, dienen nur als Überschrift
        });
        item.subItems.forEach(subItem => {
          // Extrahiere den Slug aus dem Link
          const slug = subItem.link.split('/product-list/').pop();
          if (slug) {
            options.push({
              label: subItem.label,
              i18nId: subItem.i18nId,
              isMainCategory: false,
              slug: slug,
            });
          }
        });
      }
    });
    return options;
  });

  public readonly activeFilterCount = computed(() => {
    const currentState = this.state();
    let count = 0;
    if (currentState.priceRange.min !== null || currentState.priceRange.max !== null) {
      count++;
    }
    if (currentState.inStockOnly) {
      count++;
    }
    if (currentState.selectedCategorySlug !== null) {
      count++;
    }
    return count;
  });


  constructor() {
    effect(() => {
      console.log('[FilterStateService] State changed:', this.state());
    });
  }

  // --- PUBLIC ACTION METHODS ---
  public setPriceRange(min: number | null, max: number | null): void {
    this.state.update((current) => ({
      ...current,
      priceRange: { min, max },
    }));
  }

  public setInStockOnly(value: boolean): void {
    this.state.update((current) => ({
      ...current,
      inStockOnly: value,
    }));
  }

  public selectCategory(slug: string | null): void {
    this.state.update((current) => ({
      ...current,
      selectedCategorySlug: slug,
    }));
  }

  public resetFilters(): void {
    this.state.set({
      priceRange: { min: null, max: null },
      inStockOnly: false,
      selectedCategorySlug: null,
    });
  }

  // --- UTILITY METHODS ---
  public getFilterParams(): HttpParams {
    let params = new HttpParams();
    const currentState = this.state();

    if (currentState.priceRange.min !== null) {
      params = params.set('min_price', currentState.priceRange.min.toString());
    }
    if (currentState.priceRange.max !== null) {
      params = params.set('max_price', currentState.priceRange.max.toString());
    }
    if (currentState.inStockOnly) {
      params = params.set('stock_status', 'instock');
    }
    
    // Wichtig: Die Kategorie wird hier absichtlich NICHT hinzugefügt.
    // Der aufrufende Service ist dafür verantwortlich, den 'selectedCategorySlug'
    // in eine ID zu übersetzen und dem Parameter-Objekt hinzuzufügen.
    return params;
  }
}