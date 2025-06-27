// src/app/shared/components/filter/price-range-slider/price-range-slider.component.ts
import {
  Component, Input, Output, EventEmitter, ElementRef, inject, OnChanges,
  SimpleChanges, ChangeDetectionStrategy, Renderer2, ChangeDetectorRef, ViewChild, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

@Component({
  selector: 'app-price-range-slider',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './price-range-slider.component.html',
  styleUrls: ['./price-range-slider.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceRangeSliderComponent implements OnChanges, OnDestroy {
  private elRef = inject(ElementRef);
  private renderer = inject(Renderer2);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('sliderTrack') sliderTrackEl!: ElementRef<HTMLDivElement>;

  @Input() min = 0;
  @Input() max = 1000;
  @Input() step = 1;
  @Input() initialMin: number | null = null;
  @Input() initialMax: number | null = null;
  @Input() currencySymbol = '€';

  @Output() valueChange = new EventEmitter<{ min: number | null; max: number | null }>();

  public _minValue: number | null = null;
  public _maxValue: number | null = null;

  private valueChanged = new Subject<void>();
  private dragging: 'min' | 'max' | null = null;
  private unlistenFuncs: (() => void)[] = [];

  constructor() {
    this.valueChanged.pipe(debounceTime(400)).subscribe(() => {
      this.emitValueChange();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialMin'] || changes['initialMax']) {
      this._minValue = this.initialMin;
      this._maxValue = this.initialMax;
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.removeGlobalListeners();
    this.valueChanged.complete();
  }

  get minPosPercent(): number {
    const minVal = this._minValue ?? this.min;
    return ((minVal - this.min) / (this.max - this.min)) * 100;
  }

  get maxPosPercent(): number {
    const maxVal = this._maxValue ?? this.max;
    return ((maxVal - this.min) / (this.max - this.min)) * 100;
  }

  get progressLeft(): string { return `${this.minPosPercent}%`; }
  get progressWidth(): string { return `${this.maxPosPercent - this.minPosPercent}%`; }

  startDrag(event: MouseEvent | TouchEvent, handle: 'min' | 'max'): void {
    if (this.dragging) return;
    event.preventDefault();

    if (this._minValue === null) this._minValue = this.min;
    if (this._maxValue === null) this._maxValue = this.max;
    
    this.dragging = handle;
    
    if ('touches' in event) {
      this.unlistenFuncs.push(this.renderer.listen('document', 'touchmove', this.onDrag.bind(this), { passive: false }));
      this.unlistenFuncs.push(this.renderer.listen('document', 'touchend', this.stopDrag.bind(this)));
    } else {
      this.unlistenFuncs.push(this.renderer.listen('document', 'mousemove', this.onDrag.bind(this)));
      this.unlistenFuncs.push(this.renderer.listen('document', 'mouseup', this.stopDrag.bind(this)));
    }
  }

  onDrag(event: MouseEvent | TouchEvent): void {
    if (!this.dragging) return;
    event.preventDefault();

    const trackRect = this.sliderTrackEl.nativeElement.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const pos = clientX - trackRect.left;
    let percent = (pos / trackRect.width) * 100;
    percent = Math.max(0, Math.min(100, percent));

    let newValue = this.min + (percent / 100) * (this.max - this.min);
    newValue = Math.round(newValue / this.step) * this.step;

    if (this.dragging === 'min') {
      this._minValue = Math.min(newValue, this._maxValue as number);
    } else {
      this._maxValue = Math.max(newValue, this._minValue as number);
    }
    
    this.cdr.markForCheck();
  }

  stopDrag(): void {
    if (this.dragging) this.emitValueChange();
    this.dragging = null;
    this.removeGlobalListeners();
  }

  onModelChange(): void {
    if (this._minValue !== null && this._maxValue !== null && this._minValue > this._maxValue) {
      this._maxValue = this._minValue;
    }
    this.valueChanged.next();
  }

  private emitValueChange(): void {
    this.valueChange.emit({ min: this._minValue, max: this._maxValue });
  }

  private removeGlobalListeners(): void {
    this.unlistenFuncs.forEach(unlisten => unlisten());
    this.unlistenFuncs = [];
  }
}