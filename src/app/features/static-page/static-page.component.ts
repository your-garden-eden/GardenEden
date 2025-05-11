// /src/app/features/static-page/static-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, ChangeDetectionStrategy, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Data, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { MarkdownModule } from 'ngx-markdown';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription, combineLatest } from 'rxjs';
import { distinctUntilChanged, map, filter, tap, startWith } from 'rxjs/operators';

@Component({
  selector: 'app-static-page',
  standalone: true,
  imports: [CommonModule, MarkdownModule, TranslocoModule, RouterLink],
  templateUrl: './static-page.component.html',
  styleUrl: './static-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StaticPageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);

  markdownSource: WritableSignal<string | null> = signal(null);
  isLoading: WritableSignal<boolean> = signal(true); // Bleibt true, bis onMarkdownLoad oder onMarkdownError
  error: WritableSignal<string | null> = signal(null);

  private baseContentFileName: string | null = null;
  private subscriptions = new Subscription();

  ngOnInit(): void {
    const routeData$ = this.route.data.pipe(
        map((data: Data) => data['contentFile']),
        filter(fileName => !!fileName),
        distinctUntilChanged()
    );

    const lang$ = this.translocoService.langChanges$.pipe(
        startWith(this.translocoService.getActiveLang()),
        distinctUntilChanged()
    );

    this.subscriptions.add(
      combineLatest([routeData$, lang$]).subscribe(([fileName, lang]) => {
        this.baseContentFileName = fileName;
        this.loadMarkdownContent(fileName, lang);
      })
    );
  }

  private loadMarkdownContent(baseFileName: string, lang: string): void {
    this.isLoading.set(true); // Wichtig: Vor jedem Ladeversuch auf true setzen
    this.error.set(null);
    this.markdownSource.set(null); // Wichtig: Quelle zurücksetzen für Neurenderung
    this.cdr.detectChanges(); // Sofort anwenden, damit @if im Template reagiert

    if (baseFileName) {
      const filePath = `assets/content/${baseFileName}.${lang}.md`;
      console.log(`StaticPageComponent: Setting markdownSource to: ${filePath}`);
      this.markdownSource.set(filePath); // Direkt setzen, das @if im Template sorgt für Neurenderung

      const pageTitleKey = this.route.snapshot.data['titleKey'] || `staticPage.${baseFileName}.title`;
      const translatedTitle = this.translocoService.translate(pageTitleKey,
        { page: baseFileName },
        this.translocoService.getDefaultLang()
      );
      this.titleService.setTitle(`${translatedTitle} - Your Garden Eden`);
    } else {
      console.error('StaticPageComponent: Kein baseContentFileName beim Laden des Inhalts.');
      this.error.set(this.translocoService.translate('staticPage.error.noContentFile'));
      this.titleService.setTitle(`${this.translocoService.translate('staticPage.error.genericTitle')} - Your Garden Eden`);
      this.isLoading.set(false); // Ladevorgang hier beenden
    }
    // isLoading wird durch onMarkdownLoad oder onMarkdownError auf false gesetzt
  }

  onMarkdownLoad(): void {
    const source = this.markdownSource();
    console.log(`StaticPageComponent: Markdown-Inhalt ERFOLGREICH geladen für ${source}`);
    this.isLoading.set(false);
    this.error.set(null);
    this.cdr.detectChanges();
  }

  onMarkdownError(errorEvent: any): void {
    const requestedFile = this.markdownSource(); // Der Pfad, der den Fehler verursacht hat
    console.error(`StaticPageComponent: FEHLER beim Laden der Markdown-Datei: ${requestedFile}`, errorEvent);

    const currentLang = this.translocoService.getActiveLang();
    const defaultLang = this.translocoService.getDefaultLang();

    if (this.baseContentFileName && currentLang !== defaultLang) {
      const fallbackFilePath = `assets/content/${this.baseContentFileName}.${defaultLang}.md`;
      if (requestedFile !== fallbackFilePath) {
        console.warn(`StaticPageComponent: Fehler bei ${requestedFile}. Versuche Fallback zu ${fallbackFilePath}`);
        this.loadMarkdownContent(this.baseContentFileName, defaultLang);
        return;
      } else {
        console.error(`StaticPageComponent: Fallback zu ${fallbackFilePath} ebenfalls fehlgeschlagen.`);
      }
    }

    this.error.set(this.translocoService.translate('staticPage.error.loadingFailed', { file: requestedFile ?? 'unbekannte Datei' }));
    this.isLoading.set(false);
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}