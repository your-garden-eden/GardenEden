import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface NewsArticle {
    source: { id: string | null; name: string; };
    author: string | null;
    title: string;
    description: string | null;
    url: string;
    urlToImage: string | null;
    publishedAt: string;
    content: string | null;
}

interface NewsApiResponse { articles: NewsArticle[]; }
interface NewsApiError { error: string; }

@Injectable({
  providedIn: 'root'
})
export class NewsService {
  private http = inject(HttpClient);
  private functionsUrl = environment.firebase.functionsUrl;
  private newsFunctionPath = '/getGardenNews';

  getNews(): Observable<NewsArticle[] | null> {
    if (!this.functionsUrl) {
        console.error("NewsService: Firebase Functions Basis-URL (functionsUrl) ist nicht in environment.ts konfiguriert!");
        return of(null);
    }
    const fullUrl = this.functionsUrl.endsWith('/')
                  ? this.functionsUrl + this.newsFunctionPath.substring(1)
                  : this.functionsUrl + this.newsFunctionPath;

    return this.http.get<NewsApiResponse | NewsApiError>(fullUrl).pipe(
      tap(response => console.log("NewsService: Rohantwort von Cloud Function:", response)),
      map(response => {
        if (response && typeof response === 'object' && 'articles' in response) {
          console.log("NewsService: News erfolgreich verarbeitet.");
          return response.articles;
        }
        if (response && typeof response === 'object' && 'error' in response) {
            console.error("NewsService: Fehler von Cloud Function empfangen:", response.error);
        } else {
            console.error("NewsService: Unerwartete Antwort von Cloud Function:", response);
        }
        return null;
      }),
      catchError((error: HttpErrorResponse) => {
        console.error(`NewsService: HTTP Fehler beim Abrufen von ${fullUrl}:`, {
            status: error.status,
            message: error.message,
            error: error.error
        });
        return of(null);
      })
    );
  }
}