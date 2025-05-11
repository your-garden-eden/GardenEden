import { inject, Injectable } from "@angular/core";
import { Translation, TranslocoLoader } from "@ngneat/transloco";
import { HttpClient } from "@angular/common/http";
import { environment } from "../environments/environment"; // <--- HIER IMPORT HINZUFÜGEN

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
    private http = inject(HttpClient);

    getTranslation(lang: string) {
        // Jetzt sollte environment bekannt sein
        return this.http.get<Translation>(`${environment.baseUrl}/assets/i18n/${lang}.json`);
    }
}