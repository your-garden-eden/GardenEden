// src/app/features/account/services/account.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import {
  WooCommerceCustomer,
  WooCommerceOrder,
  PaginatedOrdersResponse,
  WooCommerceCustomerUpdatePayload,
  BillingAddress,
  ShippingAddress
} from './account.models'; // Pfad zu deinen Modellen anpassen!
import { AuthService } from '../../../shared/services/auth.service'; // Pfad zu deinem AuthService anpassen!

// Interface für die Antwort von /wp/v2/users/me - hier definiert und exportiert
export interface WpUserMeResponse {
  id: number;
  username: string;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  meta?: any;
  avatar_urls?: { [key: string]: string };
  roles?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class AccountService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private wordpressApiUrl = 'https://your-garden-eden-4ujzpfm5qt.live-website.com/wp-json';
  private wooCommerceApiBase = `${this.wordpressApiUrl}/wc/v3`;
  private wpUserApiBase = `${this.wordpressApiUrl}/wp/v2`;

  constructor() { }

  getWpUserDetails(): Observable<WpUserMeResponse> {
    const token = this.authService.getStoredToken();
    if (!token) {
      console.error('[AccountService] JWT token not found for getWpUserDetails (URL param test)');
      return throwError(() => new Error('Nicht authentifiziert: Kein Token für Benutzerdetails gefunden.'));
    }
    const url = `${this.wpUserApiBase}/users/me?context=edit&JWT=${encodeURIComponent(token)}`;
    console.log('[AccountService] getWpUserDetails (URL Param Test) an URL:', url);
    return this.http.get<WpUserMeResponse>(url).pipe(
      tap(wpUser => console.log('[AccountService] Fetched /users/me response (URL Param Test):', wpUser)),
      catchError(err => this.handleError(err, 'getWpUserDetails'))
    );
  }

  getWooCommerceCustomerDetails(customerId: number): Observable<WooCommerceCustomer> {
    const token = this.authService.getStoredToken();
    if (!token) {
      console.error('[AccountService] JWT token not found for getWooCommerceCustomerDetails (URL param test)');
      return throwError(() => new Error('Nicht authentifiziert: Kein Token für Kundendetails gefunden.'));
    }
    const url = `${this.wooCommerceApiBase}/customers/${customerId}?JWT=${encodeURIComponent(token)}`;
    console.log('[AccountService] getWooCommerceCustomerDetails (URL Param Test) an URL:', url);
    return this.http.get<WooCommerceCustomer>(url).pipe(
      tap(customer => console.log('[AccountService] Fetched WooCommerce customer details (URL Param Test):', customer)),
      catchError(err => this.handleError(err, 'getWooCommerceCustomerDetails'))
    );
  }

  updateWooCommerceCustomerDetails(customerId: number, data: WooCommerceCustomerUpdatePayload): Observable<WooCommerceCustomer> {
    const token = this.authService.getStoredToken();
    if (!token) {
      console.error('[AccountService] JWT token not found for updateWooCommerceCustomerDetails (URL param test)');
      return throwError(() => new Error('Nicht authentifiziert: Kein Token für Update der Kundendetails gefunden.'));
    }
    const url = `${this.wooCommerceApiBase}/customers/${customerId}?JWT=${encodeURIComponent(token)}`;
    console.log('[AccountService] updateWooCommerceCustomerDetails (URL Param Test) an URL:', url, 'mit Payload:', data);
    return this.http.put<WooCommerceCustomer>(url, data).pipe(
      tap(customer => console.log('[AccountService] Updated WooCommerce customer details (URL Param Test):', customer)),
      catchError(err => this.handleError(err, 'updateWooCommerceCustomerDetails'))
    );
  }

  getCustomerOrders(
    userId: number,
    paramsIn: { page?: number; per_page?: number; status?: string; orderby?: string; order?: 'asc' | 'desc'; [key: string]: any } = {}
  ): Observable<PaginatedOrdersResponse> {
    const token = this.authService.getStoredToken();
    if (!token) {
      console.error('[AccountService] JWT token not found for getCustomerOrders (URL param test)');
      return throwError(() => new Error('Nicht authentifiziert: Kein Token für Bestellhistorie gefunden.'));
    }
    let queryParams: { [param: string]: string | string[] } = {
        customer: userId.toString(),
        JWT: encodeURIComponent(token)
    };
    if (paramsIn.page) queryParams['page'] = paramsIn.page.toString();
    if (paramsIn.per_page) queryParams['per_page'] = paramsIn.per_page.toString();
    if (paramsIn.status) queryParams['status'] = paramsIn.status;
    if (paramsIn.orderby) queryParams['orderby'] = paramsIn.orderby;
    if (paramsIn.order) queryParams['order'] = paramsIn.order;
    Object.keys(paramsIn).forEach(key => {
        if (!['page', 'per_page', 'status', 'orderby', 'order', 'customer', 'JWT'].includes(key) && paramsIn[key] !== undefined) {
            queryParams[key] = String(paramsIn[key]);
        }
    });
    const httpParams = new HttpParams({ fromObject: queryParams });
    const url = `${this.wooCommerceApiBase}/orders`;
    console.log('[AccountService] getCustomerOrders (URL Param Test) an URL:', url, 'mit Params:', httpParams.toString());
    return this.http.get<WooCommerceOrder[]>(url, { params: httpParams, observe: 'response' }).pipe(
      map((response: HttpResponse<WooCommerceOrder[]>) => {
        const totalOrders = parseInt(response.headers.get('X-WP-Total') || '0', 10);
        const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '0', 10);
        return { orders: response.body || [], totalOrders: totalOrders, totalPages: totalPages };
      }),
      tap(result => console.log('[AccountService] Fetched customer orders (URL Param Test) (user ID: ' + userId + '):', result)),
      catchError(err => this.handleError(err, 'getCustomerOrders'))
    );
  }

  getOrderDetails(orderId: number): Observable<WooCommerceOrder> {
    const token = this.authService.getStoredToken();
    if (!token) {
      console.error('[AccountService] JWT token not found for getOrderDetails (URL Param test)');
      return throwError(() => new Error('Nicht authentifiziert: Kein Token für Bestelldetails gefunden.'));
    }
    const url = `${this.wooCommerceApiBase}/orders/${orderId}?JWT=${encodeURIComponent(token)}`;
    console.log('[AccountService] getOrderDetails (URL Param Test) an URL:', url);
    return this.http.get<WooCommerceOrder>(url).pipe(
      tap(order => console.log('[AccountService] Fetched order details (URL Param Test):', order)),
      catchError(err => this.handleError(err, 'getOrderDetails'))
    );
  }

  changePassword(userId: number, newPassword: string, currentPassword?: string): Observable<any> {
    const token = this.authService.getStoredToken();
    if (!token) {
      console.error('[AccountService] JWT token not found for changePassword (URL param test)');
      return throwError(() => new Error('Nicht authentifiziert: Kein Token für Passwortänderung gefunden.'));
    }
    const updateUserUrl = `${this.wpUserApiBase}/users/${userId}?JWT=${encodeURIComponent(token)}`;
    const payload: { password: string; current_password?: string } = { password: newPassword };
    // if (currentPassword) { payload.current_password = currentPassword; } // Aktuell nicht verwendet
    console.log('[AccountService] changePassword (URL Param Test) an URL:', updateUserUrl);
    return this.http.post<any>(updateUserUrl, payload).pipe(
      tap(response => console.log('[AccountService] Password change response (URL Param Test):', response)),
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