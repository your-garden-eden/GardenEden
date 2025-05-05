import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface WeatherData {
  locationName: string;
  country: string;
  tempCelsius: number;
  description: string;
  iconUrl: string;
  lastUpdated: string;
}

interface WeatherApiError { error: string; }

@Injectable({
  providedIn: 'root'
})
export class WeatherService {
  private http = inject(HttpClient);
  private functionsUrl = environment.firebase.functionsUrl;
  private weatherFunctionPath = '/getWeatherData';

  getCurrentWeather(location?: string): Observable<WeatherData | null> {
    if (!this.functionsUrl) {
      console.error("WeatherService: Firebase Functions Basis-URL nicht konfiguriert!");
      return of(null);
    }

    const fullUrl = this.functionsUrl.endsWith('/')
                  ? this.functionsUrl + this.weatherFunctionPath.substring(1)
                  : this.functionsUrl + this.weatherFunctionPath;

    let params = new HttpParams();
    if (location) {
      params = params.set('location', location);
    }

    return this.http.get<WeatherData | WeatherApiError>(fullUrl, { params }).pipe(
      tap(response => console.log("WeatherService: Rohantwort von CF:", response)),
      map(response => {
        if (response && typeof response === 'object' && 'tempCelsius' in response) {
          return response as WeatherData;
        }
        if (response && typeof response === 'object' && 'error' in response) {
          console.error("WeatherService: Fehler von CF empfangen:", response.error);
        } else {
          console.error("WeatherService: Unerwartete Antwort von CF:", response);
        }
        return null;
      }),
      catchError((error: HttpErrorResponse) => {
        console.error(`WeatherService: HTTP Fehler bei ${fullUrl}:`, {
            status: error.status,
            message: error.message,
            error: error.error
        });
        return of(null);
      })
    );
  }
}