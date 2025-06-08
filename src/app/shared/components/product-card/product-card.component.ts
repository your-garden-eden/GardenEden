import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoModule],
  templateUrl: './product-card.component.html',
  styleUrls: ['./product-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductCardComponent {
  @Input({ required: true }) productName!: string;
  
  @Input() priceHtml?: string;
  @Input() singlePrice?: string;
  @Input() currencySymbol?: string = '€';
  @Input() pricePrefix?: string;

  @Input() imageUrl?: string;
  @Input({ required: true }) productLink!: string;
  @Input() onSale?: boolean = false;
  @Input() regularPrice?: string;
  
  @Input() isLazy: boolean = false;
  @Input() stockStatus?: 'instock' | 'outofstock' | 'onbackorder' = 'instock';
  
  @Input() isVariable?: boolean = false;
  @Input() priceRange?: { min: string, max: string } | null = null;

  constructor() {}

  get displayPrice(): string {
    if (this.isVariable && this.priceRange) {
      const min = parseFloat(this.priceRange.min);
      const max = parseFloat(this.priceRange.max);
      const symbol = this.currencySymbol || '';

      if (isNaN(min) || isNaN(max)) {
        return this.priceHtml || `${this.pricePrefix || ''}${this.singlePrice || ''}${symbol}`;
      }

      if (min === max) {
        return `${this.pricePrefix || ''}${min.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${symbol}`;
      }
      return `${this.pricePrefix || ''}${min.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${symbol} - ${max.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${symbol}`;
    }
    if (this.priceHtml) {
        return this.priceHtml;
    }
    if (this.singlePrice) {
      const single = parseFloat(this.singlePrice);
      if (!isNaN(single)) {
        return `${this.pricePrefix || ''}${single.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${this.currencySymbol || ''}`;
      }
    }
    return '';
  }
}