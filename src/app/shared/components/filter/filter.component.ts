// src/app/shared/components/filter/filter.component.ts
import { Component, inject, ChangeDetectionStrategy, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@ngneat/transloco';
import { FilterStateService } from '../../../core/services/filter-state.service';
import { PriceRangeSliderComponent } from './price-range-slider/price-range-slider.component';

@Component({
  selector: 'app-filter',
  standalone: true,
  imports: [CommonModule, TranslocoModule, PriceRangeSliderComponent],
  templateUrl: './filter.component.html',
  styleUrls: ['./filter.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterComponent {
  public readonly filterState = inject(FilterStateService);

  @Output()
  applyFilters = new EventEmitter<void>();

  // NEU: Signal zur Steuerung der Dropdown-Höhe
  public categorySelectSize = signal(1);

  onInStockToggle(event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.filterState.setInStockOnly(isChecked);
  }

  onCategoryChange(event: Event): void {
    const selectedSlug = (event.target as HTMLSelectElement).value;
    this.filterState.selectCategory(selectedSlug || null);
    this.onCategoryBlur(); // Dropdown nach Auswahl schließen
  }

  onPriceValueChange(values: { min: number | null; max: number | null }): void {
    this.filterState.setPriceRange(values.min, values.max);
  }

  resetAllFilters(): void {
    this.filterState.resetFilters();
  }

  apply(): void {
    this.applyFilters.emit();
  }

  // NEUE METHODEN für das Dropdown-Verhalten
  onCategoryFocus(): void {
    this.categorySelectSize.set(10);
  }

  onCategoryBlur(): void {
    this.categorySelectSize.set(1);
  }
}