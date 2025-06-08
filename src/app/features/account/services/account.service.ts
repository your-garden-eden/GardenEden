// src/app/features/account/services/account.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap, switchMap } from 'rxjs/operators';
import {
  WooCommerceCustomer,
  WooCommerceOrder,
  PaginatedOrdersResponse,
  WooCommerceCustomerUpdatePayload,
  UserAddressesResponse,
  WpUserMeResponse // KORREKTUR: Importiert aus den Models
} from './account.models';
import { AuthService } from '../../../shared/services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AccountService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private wordpressApiUrl = 'https://your-garden-eden-4ujzpfm5qt.live-website.com/wp-json';
  private wooCommerceApiBase = `${this.wordpressApiUrl}/wc/v3`;
  private wpUserApiBase = `${this.wordpressApiUrl}/wp/v2`;
  private customApiBase = `${this.wordpressApiUrl}/your-garden-eden/v1`;

  constructor() { }
  
  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.getStoredToken();
    if (!token) {
      throw new Error('Nicht authentifiziert: Kein Token gefunden.');
    }
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  getWpUserDetails(): Observable<WpUserMeResponse> {
    const token = this.authService.getStoredToken();
    if (!token) {
      return throwError(() => new Error('Nicht authentifiziert: Kein Token für Benutzerdetails gefunden.'));
    }
    const url = `${this.wpUserApiBase}/users/me?context=edit&JWT=${encodeURIComponent(token)}`;
    return this.http.get<WpUserMeResponse>(url).pipe(
      tap(wpUser => console.log('[AccountService] Fetched /users/me response:', wpUser)),
      catchError(err => this.handleError(err, 'getWpUserDetails'))
    );
  }

  getWooCommerceCustomerDetails(customerId: number): Observable<WooCommerceCustomer> {
    const token = this.authService.getStoredToken();
    if (!token) {
      return throwError(() => new Error('Nicht authentifiziert: Kein Token für Kundendetails gefunden.'));
    }
    const url = `${this.wooCommerceApiBase}/customers/${customerId}?JWT=${encodeURIComponent(token)}`;
    return this.http.get<WooCommerceCustomer>(url).pipe(
      tap(customer => console.log('[AccountService] Fetched WooCommerce customer details:', customer)),
      catchError(err => this.handleError(err, 'getWooCommerceCustomerDetails'))
    );
  }

  updateWooCommerceCustomerDetails(customerId: number, data: WooCommerceCustomerUpdatePayload): Observable<WooCommerceCustomer> {
    const headers = this.getAuthHeaders();
    const url = `${this.wooCommerceApiBase}/customers/${customerId}`;
    return this.http.put<WooCommerceCustomer>(url, data, { headers }).pipe(
      tap(customer => console.log('[AccountService] Updated WooCommerce customer details:', customer)),
      catchError(err => this.handleError(err, 'updateWooCommerceCustomerDetails'))
    );
  }
  
  getUserAddresses(): Observable<UserAddressesResponse> {
    const headers = this.getAuthHeaders();
    const url = `${this.customApiBase}/user/addresses`;
    console.log('[AccountService] getUserAddresses an URL:', url);
    return this.http.get<UserAddressesResponse>(url, { headers }).pipe(
      tap(addresses => console.log('[AccountService] Benutzeradressen erfolgreich abgerufen:', addresses)),
      catchError(err => this.handleError(err, 'getUserAddresses'))
    );
  }

  updateUserAddresses(addresses: UserAddressesResponse): Observable<{ success: boolean; message: string }> {
    const headers = this.getAuthHeaders();
    const url = `${this.customApiBase}/user/addresses`;
    console.log('[AccountService] updateUserAddresses an URL:', url);
    return this.http.post<{ success: boolean; message: string }>(url, addresses, { headers }).pipe(
      tap(response => console.log('[AccountService] Benutzeradressen erfolgreich aktualisiert:', response)),
      catchError(err => this.handleError(err, 'updateUserAddresses'))
    );
  }

  getCustomerOrders(
    userId: number,
    paramsIn: { page?: number; per_page?: number; status?: string; orderby?: string; order?: 'asc' | 'desc'; [key: string]: any } = {}
  ): Observable<PaginatedOrdersResponse> {
    const token = this.authService.getStoredToken();
    if (!token) {
      return throwError(() => new Error('Nicht authentifiziert: Kein Token für Bestellhistorie gefunden.'));
    }
    let queryParams: { [param: string]: string | string[] } = {
        customer: userId.toString(),
        JWT: encodeURIComponent(token)
    };
    if (paramsIn.page) queryParams['page'] = paramsIn.page.toString();
    if (paramsIn.per_page) queryParams['per_page'] = paramsIn.per_page.toString();
    
    const httpParams = new HttpParams({ fromObject: queryParams });
    const url = `${this.wooCommerceApiBase}/orders`;

    return this.http.get<WooCommerceOrder[]>(url, { params: httpParams, observe: 'response' }).pipe(
      map((response: HttpResponse<WooCommerceOrder[]>) => {
        const totalOrders = parseInt(response.headers.get('X-WP-Total') || '0', 10);
        const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '0', 10);
        return { orders: response.body || [], totalOrders: totalOrders, totalPages: totalPages };
      }),
      tap(result => console.log('[AccountService] Fetched customer orders (user ID: ' + userId + '):', result)),
      catchError(err => this.handleError(err, 'getCustomerOrders'))
    );
  }

  getOrderDetails(orderId: number): Observable<WooCommerceOrder> {
    const token = this.authService.getStoredToken();
    if (!token) {
      return throwError(() => new Error('Nicht authentifiziert: Kein Token für Bestelldetails gefunden.'));
    }
    const url = `${this.wooCommerceApiBase}/orders/${orderId}?JWT=${encodeURIComponent(token)}`;
    return this.http.get<WooCommerceOrder>(url).pipe(
      tap(order => console.log('[AccountService] Fetched order details:', order)),
      catchError(err => this.handleError(err, 'getOrderDetails'))
    );
  }

  changePassword(userId: number, newPassword: string): Observable<any> {
    const headers = this.getAuthHeaders();
    const updateUserUrl = `${this.wpUserApiBase}/users/${userId}`;
    const payload = { password: newPassword };
    return this.http.post<any>(updateUserUrl, payload, { headers }).pipe(
      tap(response => console.log('[AccountService] Password change response:', response)),
      catchError(err => this.handleError(err, 'changePassword'))
    );
  }

  private handleError(error: HttpErrorResponse, operation: string = 'Unbekannte Operation') {
    console.error(`[AccountService] API Error during '${operation}':`, error.status, error.message, error.error);
    let errorMessage = `Fehler bei '${operation}'.`;
    if (error.error instanceof ErrorEvent) {
      errorMessage = `Ein Client- oder Netzwerkfehler ist aufgetreten: ${error.error.message}`;
    } else {
      const errData = error.error;
      if (errData && typeof errData === 'object') {
        const specificMessage = errData.message || errData.data?.message || (Array.isArray(errData.errors) && errData.errors[0]?.message) || JSON.stringify(errData);
        errorMessage = `Serverfehler (${error.status}) bei '${operation}': ${specificMessage}`;
        if (errData.code) { errorMessage += ` (Code: ${errData.code})`; }
      } else if (typeof errData === 'string' && errData.length < 500) {
        errorMessage = `Serverfehler (${error.status}) bei '${operation}': ${errData}`;
      } else if (error.message) {
        errorMessage = `Serverfehler (${error.status}) bei '${operation}': ${error.message}`;
      }
    }
    console.error(`[AccountService] Endgültige Fehlermeldung für '${operation}': ${errorMessage}`);
    return throwError(() => new Error(errorMessage));
  }
}