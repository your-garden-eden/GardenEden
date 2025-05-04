// /src/app/shared/services/cart.service.ts
import { Injectable, signal, computed, effect, inject, PLATFORM_ID, WritableSignal, Signal, untracked } from '@angular/core'; // untracked hinzugefügt
import { isPlatformBrowser } from '@angular/common';
import { ShopifyService, Cart, CartLineInput, CartLineUpdateInput } from '../../core/services/shopify.service'; // Pfad prüfen!
import { User } from '@angular/fire/auth';
import { AuthService } from './auth.service'; // AuthService importieren
import { Firestore, doc, getDoc, setDoc, deleteDoc, DocumentReference, DocumentData } from '@angular/fire/firestore'; // Firestore Imports
import { take } from 'rxjs/operators'; // take für authState$

// Key für Local Storage
const CART_ID_STORAGE_KEY = 'shopify_cart_id';

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private shopifyService = inject(ShopifyService);
  private platformId = inject(PLATFORM_ID);
  private authService = inject(AuthService); // AuthService injizieren
  private firestore = inject(Firestore);   // Firestore injizieren

  // --- Signale für den Warenkorb-Zustand ---
  private _cartId: WritableSignal<string | null> = signal(null); // Private Cart ID
  readonly cart: WritableSignal<Cart | null> = signal(null);
  readonly isLoading: WritableSignal<boolean> = signal(false);
  readonly error: WritableSignal<string | null> = signal(null);

  // --- Signal für die User ID ---
  private userId: Signal<string | null> = computed(() => this.authService.getCurrentUser()?.uid ?? null); // Abgeleitet vom AuthService

  // Computed Signal für die Artikelanzahl
  readonly cartItemCount: Signal<number> = computed(() => this.cart()?.totalQuantity ?? 0);

  constructor() {
    // Effect, der auf Änderungen der UserID ODER _cartId reagiert
    effect(async () => {
      const uId = this.userId(); // Lese User ID
      const cId = this._cartId(); // Lese Cart ID
      console.log(`CartService Effect Triggered: userId=${uId}, _cartId=${cId}`);

      // 1. Lade die korrekte Cart ID basierend auf Login-Status
      // Wir müssen untracked verwenden, um Endlosschleifen zu vermeiden,
      // da _loadCartId auch auf userId() zugreift.
      const loadedCartId = await untracked(() => this._loadCartIdForCurrentUser());
      console.log('Loaded Cart ID:', loadedCartId);

      // 2. Wenn sich die geladene ID von der aktuellen _cartId unterscheidet, aktualisiere _cartId
      // (Dies passiert z.B. beim Login/Logout)
      if (untracked(this._cartId) !== loadedCartId) {
          console.log(`Updating _cartId from ${untracked(this._cartId)} to ${loadedCartId}`);
          // WICHTIG: Hier _cartId direkt setzen, ohne _saveCartId aufzurufen,
          // um nicht sofort wieder zu speichern, bevor der Cart geladen wurde.
          this._cartId.set(loadedCartId);
          // Der nächste Durchlauf des Effects wird dann den Cart laden.
          return; // Beende diesen Effect-Durchlauf
      }


      // 3. Lade den Cart, wenn eine ID vorhanden ist (entweder die alte oder die gerade geladene)
      const finalCartId = this._cartId(); // Lese die (potenziell aktualisierte) Cart ID
      console.log('Final Cart ID for fetching:', finalCartId);
      if (finalCartId) {
        await this.fetchCart(finalCartId);
      } else {
        // Wenn keine ID vorhanden ist (weder von User noch LocalStorage)
        if (untracked(this.cart) !== null) { // Nur setzen, wenn nicht schon null
             this.cart.set(null);
        }
        this.isLoading.set(false);
      }
    }, { allowSignalWrites: true });
  }

  // --- Private Helfermethoden ---

  /** Gibt die Firestore Document Referenz für die Cart ID des Users zurück */
  private _getUserCartIdDocRef(userId: string): DocumentReference<DocumentData> | null {
    if (!userId) return null;
    // Speichere Cart ID in einer privaten Subcollection (Best Practice)
    return doc(this.firestore, `users/${userId}/private/cart`);
  }

  /** Lädt die Cart ID für den aktuellen Benutzerstatus (Firestore oder Local Storage) */
  private async _loadCartIdForCurrentUser(): Promise<string | null> {
    const uId = this.userId(); // Aktuelle User ID holen
    console.log(`_loadCartIdForCurrentUser: Checking for user ${uId}`);

    if (uId) {
      // --- Eingeloggter Benutzer ---
      const docRef = this._getUserCartIdDocRef(uId);
      if (!docRef) return null;
      try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data()?.['cartId']) {
          const firestoreCartId = docSnap.data()?.['cartId'] as string;
          console.log(`CartService: Found Cart ID in Firestore for user ${uId}:`, firestoreCartId);
          // Optional: Anonymen Cart aus Local Storage löschen (ohne Merge)
          if (isPlatformBrowser(this.platformId)) {
             localStorage.removeItem(CART_ID_STORAGE_KEY);
          }
          return firestoreCartId;
        } else {
          console.log(`CartService: No Cart ID found in Firestore for user ${uId}.`);
          return null;
        }
      } catch (error) {
        console.error(`CartService: Error loading Cart ID from Firestore for user ${uId}:`, error);
        return null;
      }
    } else {
      // --- Anonymer Benutzer ---
      if (isPlatformBrowser(this.platformId)) {
        const storedCartId = localStorage.getItem(CART_ID_STORAGE_KEY);
        console.log(`CartService: User not logged in. Cart ID from Local Storage:`, storedCartId);
        return storedCartId ?? null;
      } else {
        return null; // Kein Local Storage auf dem Server
      }
    }
  }

  /** Speichert die Cart ID (Firestore für eingeloggte, Local Storage für anonyme) */
  private async _saveCartId(cartId: string | null): Promise<void> {
     const uId = this.userId();
     const previousCartId = untracked(this._cartId); // Vorherigen Wert lesen

     // Nur speichern/löschen, wenn sich die ID tatsächlich ändert ODER
     // wenn der User-Status sich geändert hat und wir explizit null speichern müssen
     if (cartId === previousCartId && cartId !== null) {
         console.log(`CartService: Cart ID ${cartId} is already saved.`);
         // ID muss nicht neu gesetzt werden, da sie sich nicht geändert hat
         // Der Effect wird dadurch nicht erneut getriggert.
         return;
     }

     console.log(`CartService: Attempting to save Cart ID: ${cartId} for user: ${uId}`);

     if (uId) {
         // --- Eingeloggter Benutzer (Firestore) ---
         const docRef = this._getUserCartIdDocRef(uId);
         if (!docRef) return;
         try {
             if (cartId) {
                 console.log(`CartService: Saving Cart ID ${cartId} to Firestore for user ${uId}.`);
                 await setDoc(docRef, { cartId: cartId }, { merge: true }); // merge: true ist sicherer
             } else {
                 console.log(`CartService: Deleting Cart ID from Firestore for user ${uId}.`);
                 await deleteDoc(docRef);
             }
             this._cartId.set(cartId); // Signal aktualisieren, löst Effect aus
         } catch (error) {
             console.error(`CartService: Error saving/deleting Cart ID in Firestore for user ${uId}:`, error);
             // Fehler anzeigen? Was tun? Vorerst nur loggen.
             this.error.set('Fehler beim Speichern des Warenkorbs für Ihr Konto.');
         }
     } else {
         // --- Anonymer Benutzer (Local Storage) ---
         if (isPlatformBrowser(this.platformId)) {
             if (cartId) {
                 console.log('CartService: Saving Cart ID to Local Storage:', cartId);
                 localStorage.setItem(CART_ID_STORAGE_KEY, cartId);
             } else {
                 console.log('CartService: Removing Cart ID from Local Storage.');
                 localStorage.removeItem(CART_ID_STORAGE_KEY);
             }
             this._cartId.set(cartId); // Signal aktualisieren, löst Effect aus
         }
     }
  }


  // --- Öffentliche Methoden (bleiben strukturell gleich, nutzen aber _saveCartId) ---

  /** Lädt den Warenkorb von Shopify anhand der ID */
  async fetchCart(cartId: string): Promise<void> {
    console.log('CartService: Fetching cart with ID:', cartId);
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const fetchedCart = await this.shopifyService.fetchCart(cartId);
      if (fetchedCart) {
        console.log('CartService: Cart fetched successfully:', fetchedCart);
        this.cart.set(fetchedCart);
        // Sicherstellen, dass die verwendete ID auch gespeichert ist
        if (untracked(this._cartId) !== cartId) {
           await this._saveCartId(cartId); // Speichere die ID, falls sie aus einem Link kam o.ä.
        }
      } else {
        console.warn('CartService: Cart not found on Shopify or fetch failed, removing stored ID.');
        await this._saveCartId(null); // Entfernt ID aus LS/Firestore und setzt Signal auf null
      }
    } catch (err) {
      console.error('CartService: Error fetching cart:', err);
      this.error.set('Warenkorb konnte nicht geladen werden.');
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Erstellt einen neuen Warenkorb bei Shopify UND speichert die ID */
  private async _createCartAndSaveId(): Promise<string | null> {
    console.log('CartService: Creating new cart...');
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const newCart = await this.shopifyService.createCart();
      if (newCart?.id) {
        console.log('CartService: New cart created with ID:', newCart.id);
        await this._saveCartId(newCart.id); // Speichert ID -> löst Effect aus für fetchCart
        // Warten wir hier nicht auf fetchCart, der Effect kümmert sich darum
        return newCart.id;
      } else {
        this.error.set('Neuer Warenkorb konnte nicht erstellt werden.');
        return null;
      }
    } catch (err) {
      console.error('CartService: Error creating cart:', err);
      this.error.set('Neuer Warenkorb konnte nicht erstellt werden.');
      return null;
    } finally {
       // isLoading wird im Effect nach fetchCart gesetzt
    }
  }

  /** Fügt einen Artikel hinzu (erstellt Cart falls nötig) */
  async addLine(merchandiseId: string, quantity: number): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    let currentCartId = untracked(this._cartId); // Aktuelle ID lesen ohne Effect zu triggern

    try {
        if (!currentCartId) {
            currentCartId = await this._createCartAndSaveId(); // Erstellt & speichert -> löst Effect aus
            if (!currentCartId) {
                 this.isLoading.set(false); return; // Fehler in createCart
            }
            // Warten auf den Effect, der den Cart lädt? Eher nicht, addLine sollte direkt danach gehen.
        }

        console.log(`CartService: Adding line item ${merchandiseId} (Qty: ${quantity}) to cart ${currentCartId}`);
        const line: CartLineInput = { merchandiseId, quantity };
        const updatedCart = await this.shopifyService.addCartLines(currentCartId, [line]);

        if (updatedCart) {
            console.log('CartService: Line added, updated cart:', updatedCart);
            this.cart.set(updatedCart); // Cart Signal aktualisieren
            // Sicherstellen dass die ID gespeichert ist (sollte sie sein)
             if (untracked(this._cartId) !== updatedCart.id) {
                 await this._saveCartId(updatedCart.id);
             }
        } else {
            console.error('CartService: Failed to add line item.');
            this.error.set('Artikel konnte nicht zum Warenkorb hinzugefügt werden.');
            // Ggf. Cart neu laden zur Sicherheit?
            // await this.fetchCart(currentCartId);
        }
    } catch (err) {
        console.error('CartService: Error adding line:', err);
        this.error.set('Fehler beim Hinzufügen zum Warenkorb.');
    } finally {
        this.isLoading.set(false);
    }
  }


  /** Entfernt einen Artikel */
  async removeLine(lineId: string): Promise<void> {
    const currentCartId = untracked(this._cartId); // ID lesen
    if (!currentCartId) { /* ... Fehler ... */ return; }
    this.isLoading.set(true); /* ... */
    try {
      const updatedCart = await this.shopifyService.removeCartLines(currentCartId, [lineId]);
      if (updatedCart) {
         this.cart.set(updatedCart);
         if (updatedCart.totalQuantity === 0) {
             // Optional: Leeren Cart und ID löschen? Oder behalten?
             // await this._saveCartId(null); // Löscht ID & Cart aus State via Effect
         }
      } else { /* ... Fehler ... */ }
    } catch (err) { /* ... Fehler ... */ }
    finally { this.isLoading.set(false); }
  }

  /** Aktualisiert Menge */
  async updateLineQuantity(lineId: string, quantity: number): Promise<void> {
    const currentCartId = untracked(this._cartId); // ID lesen
    if (!currentCartId) { /* ... Fehler ... */ return; }
    if (quantity <= 0) { await this.removeLine(lineId); return; } // Bei 0 entfernen
    this.isLoading.set(true); /* ... */
    const line: CartLineUpdateInput = { id: lineId, quantity };
    try {
      const updatedCart = await this.shopifyService.updateCartLines(currentCartId, [line]);
      if (updatedCart) { this.cart.set(updatedCart); }
      else { /* ... Fehler ... */ }
    } catch (err) { /* ... Fehler ... */ }
    finally { this.isLoading.set(false); }
  }

}