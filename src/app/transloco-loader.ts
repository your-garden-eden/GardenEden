// /src/app/transloco-loader.ts
// KORREKTUR START: HttpClient durch HttpBackend ersetzt, um zirkuläre Abhängigkeiten zu beheben.
import { inject, Injectable } from "@angular/core";
import { Translation, TranslocoLoader } from "@ngneat/transloco";
import { HttpClient, HttpBackend } from "@angular/common/http";
// KORREKTUR ENDE

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
    // KORREKTUR START: Wir erstellen eine "saubere" HttpClient-Instanz, die Interceptors umgeht.
    private http: HttpClient;

    constructor(private handler: HttpBackend) {
        this.http = new HttpClient(handler);
    }
    // KORREKTUR ENDE

    getTranslation(lang: string) {
        // Diese Anfrage verwendet jetzt den HttpClient ohne Interceptors und verursacht keine zirkuläre Abhängigkeit mehr.
        return this.http.get<Translation>(`/assets/i18n/${lang}.json`);
    }
}