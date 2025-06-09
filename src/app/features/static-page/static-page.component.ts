// /src/app/features/static-page/static-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, ChangeDetectionStrategy, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Data, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { MarkdownModule, MarkdownService } from 'ngx-markdown';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { Subscription, combineLatest, of, Observable } from 'rxjs';
import { distinctUntilChanged, map, filter, tap, startWith, switchMap, catchError } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';

// +++ NEU: LoadingSpinnerComponent importieren +++
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-static-page',
  standalone: true,
  // +++ NEU: LoadingSpinnerComponent zu den Imports hinzufügen +++
  imports: [CommonModule, MarkdownModule, TranslocoModule, RouterLink, LoadingSpinnerComponent],
  templateUrl: './static-page.component.html',
  styleUrl: './static-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StaticPageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService);
  private cdr = inject(ChangeDetectorRef);
  private http = inject(HttpClient);
  private markdownService = inject(MarkdownService);

  markdownFilePath: WritableSignal<string | null> = signal(null);
  markdownContent: WritableSignal<string | null> = signal(null);
  isLoading: WritableSignal<boolean> = signal(true);
  error: WritableSignal<string | null> = signal(null);

  private baseContentFileName: string | null = null;
  private subscriptions = new Subscription();

  ngOnInit(): void {
    const routeData$ = this.route.data.pipe(
        map((data: Data) => data['contentFile'] as string),
        filter(fileName => !!fileName),
        distinctUntilChanged()
    );

    const lang$ = this.translocoService.langChanges$.pipe(
        startWith(this.translocoService.getActiveLang()),
        distinctUntilChanged()
    );

    this.subscriptions.add(
      combineLatest([routeData$, lang$]).pipe(
        tap(([fileName, lang]) => {
          this.baseContentFileName = fileName;
          this.isLoading.set(true);
          this.error.set(null);
          this.markdownContent.set(null);
          // Diese Zeile ist für das `[src]`-Binding von ngx-markdown, wir behalten sie.
          this.markdownFilePath.set(`assets/content/${fileName}.${lang}.md`); 
          this.cdr.detectChanges();
        }),
        switchMap(([fileName, lang]) => this.fetchMarkdownContent(fileName, lang))
      ).subscribe()
    );
  }

  private fetchMarkdownContent(baseFileName: string, lang: string): Observable<string | null> {
    const filePath = `assets/content/${baseFileName}.${lang}.md`;
    
    return this.http.get(filePath, { responseType: 'text' }).pipe(
      tap(content => {
        this.markdownContent.set(content);
        this.isLoading.set(false);
        this.error.set(null);
        this.updateTitle(baseFileName);
        this.cdr.detectChanges();
      }),
      catchError(err => {
        console.error(`StaticPageComponent: FEHLER beim Laden von ${filePath}`, err);
        const defaultLang = this.translocoService.getDefaultLang();
        if (this.baseContentFileName && lang !== defaultLang) {
          console.warn(`StaticPageComponent: Fehler bei ${filePath}. Versuche Fallback zu Sprache: ${defaultLang}`);
          // Wichtig: Wir geben das Observable der rekursiven Funktion zurück
          return this.fetchMarkdownContent(this.baseContentFileName, defaultLang);
        } else {
          console.error(`StaticPageComponent: Fallback zu ${defaultLang} ebenfalls fehlgeschlagen oder war bereits Standardsprache für ${this.baseContentFileName}.`);
          this.error.set(this.translocoService.translate('staticPage.error.loadingFailed', { file: baseFileName }));
          this.isLoading.set(false);
          this.markdownContent.set(null);
          this.updateTitle(this.baseContentFileName, true);
          this.cdr.detectChanges();
          return of(null);
        }
      })
    );
  }

  private updateTitle(baseFileName: string | null, isError: boolean = false): void {
    if (!baseFileName) {
        const errorTitle = this.translocoService.translate('staticPage.error.genericTitle');
        this.titleService.setTitle(`${errorTitle} - Your Garden Eden`);
        return;
    }

    let titleKey: string;
    if (isError) {
        titleKey = 'staticPage.error.genericTitle';
    } else {
        // Wir verwenden `snapshot.data` hier, da es zum Zeitpunkt des Aufrufs bereits aufgelöst sein sollte.
        titleKey = this.route.snapshot.data['titleKey'] || `staticPage.title.${baseFileName}`;
    }
    const translatedTitle = this.translocoService.translate(titleKey);
    this.titleService.setTitle(`${translatedTitle} - Your Garden Eden`);
  }

  onMarkdownLoad(): void {
    // Diese Methode könnte nützlich sein, wenn ngx-markdown selbst einen Lade-Spinner hätte.
    // Für unseren Zweck ist sie erstmal nicht kritisch.
  }

  onMarkdownError(errorEvent: any): void {
    console.error('StaticPageComponent: Fehler beim Rendern des Markdowns durch ngx-markdown:', errorEvent);
    // Hier könnten wir einen alternativen Fehlerstatus setzen.
    this.error.set(this.translocoService.translate('staticPage.error.renderingFailed'));
    this.isLoading.set(false);
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}