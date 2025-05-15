// /src/app/features/maintenance/maintenance.component.ts
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, Inject, PLATFORM_ID, WritableSignal, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { TranslocoModule, TranslocoService, LangDefinition } from '@ngneat/transloco';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-maintenance',
  standalone: true,
  imports: [CommonModule, TranslocoModule, FormsModule],
  templateUrl: './maintenance.component.html',
  styleUrl: './maintenance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MaintenanceComponent implements OnInit, OnDestroy {
  targetDate!: Date;
  days: string = '00';
  hours: string = '00';
  minutes: string = '00';
  seconds: string = '00';
  countdownEnded = false;
  private intervalId: any;

  availableLangsSignal: WritableSignal<{ id: string; label: string }[]> = signal([]);
  activeLang: WritableSignal<string> = signal('');

  constructor(
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object,
    private translocoService: TranslocoService
  ) {}

  ngOnInit(): void {
    this.activeLang.set(this.translocoService.getActiveLang());
    this.setupLanguageOptions();
    this.startCountdown();

    this.translocoService.langChanges$.subscribe(currentLang => {
        this.activeLang.set(currentLang);
        this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private setupLanguageOptions(): void {
    const rawLangs = this.translocoService.getAvailableLangs();
    const langsArray = Array.isArray(rawLangs) ? rawLangs : (typeof rawLangs === 'object' ? Object.keys(rawLangs) : [rawLangs as LangDefinition]);

    const formattedLangs = langsArray.map(langInput => {
      const langId = typeof langInput === 'string' ? langInput : langInput.id;
      let label = langId.toUpperCase();
      switch (langId) {
        case 'de': label = 'Deutsch'; break;
        case 'en': label = 'English'; break;
        case 'hr': label = 'Hrvatski'; break;
        case 'es': label = 'Español'; break; // *** NEU ***
        case 'pl': label = 'Polski'; break;  // *** NEU ***
      }
      return { id: langId, label: label };
    });
    this.availableLangsSignal.set(formattedLangs);
  }

  changeLanguage(langId: string): void {
    if (langId) {
        this.translocoService.setActiveLang(langId);
    }
  }

  private startCountdown(): void {
    this.targetDate = new Date('2025-06-01T00:00:00');
    this.updateCountdown();
    if (isPlatformBrowser(this.platformId)) {
      this.intervalId = setInterval(() => {
        this.updateCountdown();
      }, 1000);
    }
  }

  private updateCountdown(): void {
    const now = new Date().getTime();
    if (!this.targetDate) {
      return;
    }
    const targetTimestamp = this.targetDate.getTime();
    const distance = targetTimestamp - now;

    if (distance <= 0) {
      this.days = '00'; this.hours = '00'; this.minutes = '00'; this.seconds = '00';
      this.countdownEnded = true;
      if (this.intervalId) {
         clearInterval(this.intervalId);
         this.intervalId = null;
       }
    } else {
      const d = Math.floor(distance / (1000 * 60 * 60 * 24));
      const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((distance % (1000 * 60)) / 1000);
      this.days = d.toString().padStart(2, '0');
      this.hours = h.toString().padStart(2, '0');
      this.minutes = m.toString().padStart(2, '0');
      this.seconds = s.toString().padStart(2, '0');
      this.countdownEnded = false;
    }
    this.cdr.markForCheck();
  }
}