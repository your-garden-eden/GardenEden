import { Component, inject, OnInit, WritableSignal, signal, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule, TranslocoService, LangDefinition } from '@ngneat/transloco';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslocoModule
  ],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent implements OnInit {
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);

  currentYear = new Date().getFullYear();

  availableLangsSignal: WritableSignal<{ id: string; label: string }[]> = signal([]);
  activeLang: WritableSignal<string> = signal(this.translocoService.getActiveLang());

  ngOnInit(): void {
    const rawLangs = this.translocoService.getAvailableLangs();
    const langsArray = Array.isArray(rawLangs) ? rawLangs : [rawLangs as LangDefinition];

    const formattedLangs = langsArray.map(lang => {
      if (typeof lang === 'string') {
        let label = lang.toUpperCase();
        if (lang === 'de') label = 'Deutsch';
        if (lang === 'en') label = 'English';
        if (lang === 'hr') label = 'Hrvatski';
        return { id: lang, label: label };
      }
      return { id: lang.id, label: lang.label || lang.id.toUpperCase() };
    });
    this.availableLangsSignal.set(formattedLangs as {id: string; label: string}[]);

    this.translocoService.langChanges$.subscribe(currentLang => {
        this.activeLang.set(currentLang);
        this.cdr.detectChanges();
    });
  }

  changeLanguage(langId: string): void {
    if (langId) {
        this.translocoService.setActiveLang(langId);
    }
  }
}