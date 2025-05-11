// /src/app/features/static-page/static-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, ChangeDetectionStrategy, OnDestroy, ChangeDetectorRef } from '@angular/core'; // OnDestroy, ChangeDetectorRef
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Data } from '@angular/router'; // Data importieren
import { Title } from '@angular/platform-browser';
import { MarkdownModule } from 'ngx-markdown';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco'; // Transloco importieren
import { Subscription } from 'rxjs'; // Subscription importieren

@Component({
  selector: 'app-static-page',
  standalone: true,
  imports: [CommonModule, MarkdownModule, TranslocoModule], // TranslocoModule ist schon da
  templateUrl: './static-page.component.html',
  styleUrl: './static-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StaticPageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private titleService = inject(Title);
  private translocoService = inject(TranslocoService); // TranslocoService injizieren
  private cdr = inject(ChangeDetectorRef); // ChangeDetectorRef injizieren

  markdownSource: WritableSignal<string | null> = signal(null);
  isLoading: WritableSignal<boolean> = signal(true); // Wird jetzt initial auf true gesetzt
  error: WritableSignal<string | null> = signal(null);

  private baseContentFileName: string | null = null;
  private langChangeSubscription: Subscription | undefined;
  private routeDataSubscription: Subscription | undefined;


  ngOnInit(): void {
    // Route-Daten und Sprachänderungen abonnieren
    this.routeDataSubscription = this.route.data.subscribe((data: Data) => {
      this.baseContentFileName = data['contentFile'];
      this.loadContentForCurrentLanguage();
    });

    this.langChangeSubscription = this.translocoService.langChanges$.subscribe(() => {
      this.loadContentForCurrentLanguage();
    });
  }

  ngOnDestroy(): void {
    this.langChangeSubscription?.unsubscribe();
    this.routeDataSubscription?.unsubscribe();
  }

  private loadContentForCurrentLanguage(): void {
    this.isLoading.set(true);
    this.markdownSource.set(null); // Quelle zurücksetzen, um Neuladen zu erzwingen
    this.error.set(null);
    this.cdr.detectChanges(); // Wichtig, damit ngx-markdown das src-Update mitbekommt

    if (this.baseContentFileName) {
      const currentLang = this.translocoService.getActiveLang();
      const filePath = `assets/content/${this.baseContentFileName}.${currentLang}.md`;
      this.markdownSource.set(filePath); // ngx-markdown wird versuchen, dies zu laden
      console.log(`StaticPageComponent: Versuche Inhalt zu laden von ${filePath}`);

      // Seitentitel (könnte auch über i18n Keys pro Seite gehen, aber für jetzt aus Route oder Fallback)
      // Die Titel werden idealerweise auch über die Routenkonfiguration via Transloco gesetzt.
      // Hier nur ein Fallback, falls der Titel nicht über die Route kommt.
      const pageTitleKey = this.route.snapshot.data['titleKey'] || `staticPage.${this.baseContentFileName}.title`;
      const translatedTitle = this.translocoService.translate(pageTitleKey,
        { page: this.baseContentFileName }, // Fallback, falls titleKey nicht existiert
        this.translocoService.getDefaultLang() // Fallback-Sprache
      );
      this.titleService.setTitle(`${translatedTitle} - Your Garden Eden`);

    } else {
      console.error('StaticPageComponent: Kein baseContentFileName verfügbar.');
      this.error.set(this.translocoService.translate('staticPage.error.noContentFile'));
      this.titleService.setTitle(`${this.translocoService.translate('staticPage.error.genericTitle')} - Your Garden Eden`);
    }
    // Das eigentliche Laden des Markdown-Inhalts und das Setzen von isLoading = false
    // geschieht nun implizit durch die ngx-markdown Komponente und ihre (load)/(error) Events.
    // Wir setzen isLoading initial und es wird durch onMarkdownLoad oder onMarkdownError beeinflusst.
  }


  onMarkdownLoad() {
    console.log('StaticPageComponent: Markdown-Inhalt geladen für', this.markdownSource());
    this.isLoading.set(false);
    this.error.set(null); // Fehler zurücksetzen bei Erfolg
    this.cdr.detectChanges();
  }

  onMarkdownError(errorEvent: any) {
    const requestedFile = this.markdownSource();
    console.error(`StaticPageComponent: Fehler beim Laden der Markdown-Datei: ${requestedFile}`, errorEvent);

    // Versuche Fallback zur Standardsprache, wenn nicht schon Standardsprache
    const currentLang = this.translocoService.getActiveLang();
    const defaultLang = this.translocoService.getDefaultLang();

    if (this.baseContentFileName && currentLang !== defaultLang) {
      const fallbackFilePath = `assets/content/${this.baseContentFileName}.${defaultLang}.md`;
      if (requestedFile !== fallbackFilePath) { // Verhindere Endlosschleife, wenn auch Fallback fehlschlägt
        console.warn(`StaticPageComponent: Versuche Fallback zu ${fallbackFilePath}`);
        this.markdownSource.set(fallbackFilePath);
        this.cdr.detectChanges(); // ngx-markdown erneut anstoßen
        return; // onMarkdownLoad/Error wird erneut ausgelöst
      }
    }
    // Wenn Fallback auch fehlschlägt oder nicht möglich war
    this.error.set(this.translocoService.translate('staticPage.error.loadingFailed', { file: requestedFile }));
    this.isLoading.set(false);
    this.cdr.detectChanges();
  }
}