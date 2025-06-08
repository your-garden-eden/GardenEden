// /src/app/transloco-loader.ts
import { inject, Injectable } from "@angular/core";
import { Translation, TranslocoLoader } from "@ngneat/transloco";
import { HttpClient } from "@angular/common/http";

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
    private http = inject(HttpClient);

    getTranslation(lang: string) {
        // ÄNDERUNG: Wir entfernen die Abhängigkeit von environment.baseUrl
        // und verwenden einen relativen Pfad. Der neue Interceptor wird dies auf dem Server abfangen.
        return this.http.get<Translation>(`/assets/i18n/${lang}.json`);
    }
}