// /src/app/features/maintenance/maintenance.component.ts
import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, Inject, PLATFORM_ID, WritableSignal, signal } from '@angular/core';
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
export class MaintenanceComponent implements OnInit {
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

    this.translocoService.langChanges$.subscribe(currentLang => {
        this.activeLang.set(currentLang);
        this.cdr.markForCheck();
    });
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
}