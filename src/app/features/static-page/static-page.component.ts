// /src/app/features/static-page/static-page.component.ts
import { Component, OnInit, inject, signal, WritableSignal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { MarkdownModule } from 'ngx-markdown'; // Import für das Template

@Component({
  selector: 'app-static-page',
  standalone: true,
  // --- NEU: MarkdownModule hier importieren! ---
  imports: [CommonModule, MarkdownModule],
  templateUrl: './static-page.component.html',
  styleUrl: './static-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StaticPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private titleService = inject(Title); // TitleService injizieren

  // Signal für den Pfad zur Markdown-Datei
  markdownSource: WritableSignal<string | null> = signal(null);
  isLoading: WritableSignal<boolean> = signal(true);
  error: WritableSignal<string | null> = signal(null);

  ngOnInit(): void {
    // Dateinamen aus den Routendaten lesen
    const contentFileName = this.route.snapshot.data['contentFile'];

    if (contentFileName) {
      // Pfad zur Markdown-Datei im assets-Ordner erstellen
      const filePath = `assets/content/${contentFileName}`;
      this.markdownSource.set(filePath);
      this.error.set(null);
      console.log(`StaticPageComponent: Lade Inhalt von ${filePath}`);

      // Seitentitel aus Route setzen (optional, da schon im Routing definiert)
      // this.titleService.setTitle(this.route.snapshot.title);

    } else {
      console.error('StaticPageComponent: Kein contentFile in Routendaten gefunden!');
      this.error.set('Der anzuzeigende Inhalt konnte nicht ermittelt werden.');
      this.markdownSource.set(null);
      this.titleService.setTitle('Fehler - Your Garden Eden');
    }

    this.isLoading.set(false); // Logik ist fertig, Laden übernimmt ngx-markdown
  }

  // --- NEU: Event-Handler für ngx-markdown (optional aber nützlich) ---

  // Wird aufgerufen, wenn ngx-markdown den Inhalt erfolgreich geladen hat
  onMarkdownLoad() {
    console.log('StaticPageComponent: Markdown-Inhalt geladen für', this.markdownSource());
    // Hier könnte man z.B. interne Links anpassen, wenn nötig
  }

  // Wird aufgerufen, wenn ngx-markdown einen Fehler beim Laden hat (z.B. Datei nicht gefunden)
  onMarkdownError(error: any) {
    console.error('StaticPageComponent: Fehler beim Laden der Markdown-Datei:', this.markdownSource(), error);
    this.error.set(`Fehler beim Laden des Inhalts (${this.markdownSource()}). Bitte versuchen Sie es später erneut.`);
    // Optional: Fehler an einen Logging-Service senden
  }
}