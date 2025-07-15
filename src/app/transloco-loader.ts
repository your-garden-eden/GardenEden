// /src/app/transloco-loader.ts
import { Injectable } from "@angular/core";
import { Translation, TranslocoLoader } from "@ngneat/transloco";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
    constructor(private http: HttpClient) {}

    getTranslation(lang: string): Observable<Translation> {
        // Der Pfad MUSS relativ sein, damit Angulars HttpClient auf dem Server
        // die Anfrage korrekt auflösen kann (relativ zur Server-URL).
        return this.http.get<Translation>(`/assets/i18n/${lang}.json`);
    }
}