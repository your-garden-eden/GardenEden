import { Pipe, PipeTransform, inject, SecurityContext } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'safeHtml',
  standalone: true
})
export class SafeHtmlPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeHtml {
    if (value === null || value === undefined) {
      return ''; // Leeren String zurückgeben, wenn Wert null oder undefined ist
    }
    // Sanitize HTML und markiere es als sicher
    // SecurityContext.HTML ist wichtig!
     return this.sanitizer.sanitize(SecurityContext.HTML, value) || '';
    // Alternativ, wenn man dem HTML 100% vertraut (nicht empfohlen für User-Input!):
    // return this.sanitizer.bypassSecurityTrustHtml(value);
  }
}