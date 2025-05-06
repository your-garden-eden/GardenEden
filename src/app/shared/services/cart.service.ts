// /src/app/shared/services/cart.service.ts
import { Injectable, signal, computed, effect, inject, PLATFORM_ID, WritableSignal, Signal, untracked, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ShopifyService, Cart, CartLineInput, CartLineUpdateInput, CartLineEdgeNode, CartBuyerIdentityInput } from '../../core/services/shopify.service'; // CartBuyerIdentityInput importiert
import { Firestore, doc, getDoc, setDoc, deleteDoc, DocumentReference, DocumentData } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { User } from '@angular/fire/auth';
import { Subscription, distinctUntilChanged, skip, tap } from 'rxjs';

const CART_ID_STORAGE_KEY = 'shopify_cart_id';

@Injectable({
  providedIn: 'root'
})
export class CartService implements OnDestroy {
  private shopifyService = inject(ShopifyService);
  private platformId = inject(PLATFORM_ID);
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  private _cartId: WritableSignal<string | null> = signal(null);
  readonly cart: WritableSignal<Cart | null> = signal(null);
  readonly isLoading: WritableSignal<boolean> = signal(false);
  readonly error: WritableSignal<string | null> = signal(null);
  readonly cartItemCount: Signal<number> = computed(() => this.cart()?.totalQuantity ?? 0);

  private currentUserId: WritableSignal<string | null> = signal(null);
  private authSubscription: Subscription | null = null;

  constructor() {
    effect(async (onCleanup) => {
      const activeCartId = this._cartId();
      console.log(`CartService Effect Triggered: Active _cartId changed to ${activeCartId}`);
      let abortController = new AbortController();
      onCleanup(() => { abortController.abort(); });
      if (activeCartId) {
        await this.fetchCart(activeCartId);
      } else {
        if (untracked(this.cart) !== null) { this.cart.set(null); }
        this.isLoading.set(false);
      }
    }); // Konfiguration entfernt

    if (isPlatformBrowser(this.platformId)) {
        this.loadInitialAnonymousCart();
        this.subscribeToAuthState();
    }
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }

  private subscribeToAuthState(): void {
    this.authSubscription = this.authService.authState$.pipe(
        tap(user => console.log("CartService received auth state:", user?.uid ?? 'null')),
    ).subscribe(async user => {
        const previousUserId = untracked(this.currentUserId);
        const newUserId = user?.uid ?? null;
        if (newUserId !== previousUserId) {
             this.currentUserId.set(newUserId);
             console.log(`CartService: User changed from ${previousUserId} to ${newUserId}`);
             if (newUserId) { await this.handleLogin(newUserId); }
             else { await this.handleLogout(); }
        } else {
            console.log(`CartService: Auth state received, but user ID (${newUserId}) did not change.`);
        }
    });
  }

  private async loadInitialAnonymousCart(): Promise<void> {
    const storedCartId = localStorage.getItem(CART_ID_STORAGE_KEY);
    console.log('CartService: Loading initial anonymous cartId from LS:', storedCartId);
    if (storedCartId) { this._cartId.set(storedCartId); }
  }

  private _getUserCartIdDocRef(userId: string): DocumentReference<DocumentData> | null {
    if (!userId) return null;
    return doc(this.firestore, `users/${userId}/private/cart`);
  }

  private async _loadUserCartId(userId: string): Promise<string | null> {
    const docRef = this._getUserCartIdDocRef(userId);
    if (!docRef) return null;
    try {
      const docSnap = await getDoc(docRef);
      const firestoreCartId = docSnap.exists() ? docSnap.data()?.['cartId'] as string : null;
      console.log(`CartService: Loaded User Cart ID from Firestore for ${userId}:`, firestoreCartId);
      return firestoreCartId;
    } catch (error) {
      console.error(`CartService: Error loading Cart ID from Firestore for user ${userId}:`, error);
      return null;
    }
  }

  private async _saveUserCartId(userId: string, cartId: string | null): Promise<void> {
    const docRef = this._getUserCartIdDocRef(userId);
    if (!docRef) return;
    try {
      if (cartId) {
        console.log(`CartService: Saving Cart ID ${cartId} to Firestore for user ${userId}.`);
        await setDoc(docRef, { cartId: cartId }, { merge: true });
      } else {
        console.log(`CartService: Deleting Cart ID from Firestore for user ${userId}.`);
        await deleteDoc(docRef);
      }
    } catch (error) {
      console.error(`CartService: Error saving/deleting Cart ID in Firestore for user ${userId}:`, error);
      this.error.set('Fehler beim Speichern des Benutzer-Warenkorbs.');
    }
  }

  private _loadAnonymousCartId(): string | null {
    if (isPlatformBrowser(this.platformId)) {
      const storedCartId = localStorage.getItem(CART_ID_STORAGE_KEY);
      console.log(`CartService: Loaded Anonymous Cart ID from LS:`, storedCartId);
      return storedCartId;
    }
    return null;
  }

  private async _saveAnonymousCartId(cartId: string | null): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
      if (cartId) {
        console.log('CartService: Saving Anonymous Cart ID to Local Storage:', cartId);
        localStorage.setItem(CART_ID_STORAGE_KEY, cartId);
      } else {
        await this._clearAnonymousCartId();
      }
    }
  }

  private async _clearAnonymousCartId(): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
      console.log('CartService: Removing Anonymous Cart ID from Local Storage.');
      localStorage.removeItem(CART_ID_STORAGE_KEY);
    }
   }

  async fetchCart(cartId: string): Promise<Cart | null> {
    if (!cartId) {
      if (untracked(this.cart) !== null) this.cart.set(null);
      return null;
    }
    if (untracked(this.cart)?.id === cartId && !this.isLoading()) {
      console.log(`CartService: Cart ${cartId} already in state. Skipping fetch.`);
      return untracked(this.cart);
    }
    console.log('CartService: Fetching cart with ID:', cartId);
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const fetchedCart = await this.shopifyService.fetchCart(cartId);
      if (fetchedCart) {
        console.log('CartService: Cart fetched successfully:', fetchedCart);
        this.cart.set(fetchedCart);
        if (untracked(this._cartId) !== cartId) {
          console.warn(`CartService: Fetched cart ID ${cartId} differs from active ID ${untracked(this._cartId)}. Updating active ID.`);
          this._cartId.set(cartId);
        }
        return fetchedCart;
      } else {
        console.warn(`CartService: Cart ${cartId} not found on Shopify or fetch failed.`);
        this.cart.set(null);
        if (untracked(this._cartId) === cartId) {
          console.log(`CartService: Clearing active cart ID ${cartId} because fetch failed.`);
          this._cartId.set(null);
        }
        return null;
      }
    } catch (err) {
      console.error('CartService: Error fetching cart:', err);
      this.error.set('Warenkorb konnte nicht geladen werden.');
      this.cart.set(null);
      if (untracked(this._cartId) === cartId) { this._cartId.set(null); }
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }

  async addLine(merchandiseId: string, quantity: number): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    let currentCartId = untracked(this._cartId);
    const uId = untracked(this.currentUserId);
    try {
      let targetCart: Cart | null = null;
      if (!currentCartId) {
        console.log("CartService: No active cart, creating new one...");
        targetCart = await this.shopifyService.createCart([{ merchandiseId, quantity }]);
        if (targetCart?.id) {
          this._cartId.set(targetCart.id);
          if (uId) {
            await this._saveUserCartId(uId, targetCart.id);
            await this._clearAnonymousCartId();
          } else {
            await this._saveAnonymousCartId(targetCart.id);
          }
          console.log("CartService: New cart created and line added via effect:", targetCart);
        } else { throw new Error("Failed to create cart."); }
      } else {
        console.log(`CartService: Adding line item ${merchandiseId} to cart ${currentCartId}`);
        const line: CartLineInput = { merchandiseId, quantity };
        targetCart = await this.shopifyService.addCartLines(currentCartId, [line]);
        if (targetCart) {
          console.log('CartService: Line added, updated cart:', targetCart);
          this.cart.set(targetCart);
          if (untracked(this._cartId) !== targetCart.id) {
             console.warn(`Cart ID changed after addLine from ${currentCartId} to ${targetCart.id}`);
             this._cartId.set(targetCart.id);
             if (uId) {
                await this._saveUserCartId(uId, targetCart.id);
                await this._clearAnonymousCartId();
             } else {
                 await this._saveAnonymousCartId(targetCart.id);
             }
          }
        } else { throw new Error('Failed to add line item.'); }
      }
      if (uId && targetCart?.id) {
           const currentUser = this.authService.getCurrentUser();
           if (currentUser?.email) {
               await this.updateBuyerIdentity(targetCart.id, { email: currentUser.email, countryCode: 'DE' });
           }
       }
    } catch (err) {
      console.error('CartService: Error adding line:', err);
      this.error.set('Fehler beim Hinzufügen zum Warenkorb.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async addMultipleLines(lines: CartLineInput[]): Promise<void> {
    if (!lines || lines.length === 0) {
      console.warn("CartService: addMultipleLines called with empty lines array.");
      return;
    }
    this.isLoading.set(true);
    this.error.set(null);
    let currentCartId = untracked(this._cartId);
    const uId = untracked(this.currentUserId);
    try {
      let targetCart: Cart | null = null;
      if (!currentCartId) {
        console.log("CartService: No active cart, creating new one for multiple lines...");
        targetCart = await this.shopifyService.createCart(lines);
        if (targetCart?.id) {
          this._cartId.set(targetCart.id);
          if (uId) {
            await this._saveUserCartId(uId, targetCart.id);
            await this._clearAnonymousCartId();
          } else {
            await this._saveAnonymousCartId(targetCart.id);
          }
          console.log("CartService: New cart created with multiple lines:", targetCart);
        } else { throw new Error("Failed to create cart with multiple lines."); }
      } else {
        console.log(`CartService: Adding multiple lines to cart ${currentCartId}:`, lines);
        targetCart = await this.shopifyService.addCartLines(currentCartId, lines);
        if (targetCart) {
          console.log('CartService: Multiple lines added, updated cart:', targetCart);
          this.cart.set(targetCart);
          if (untracked(this._cartId) !== targetCart.id) {
            console.warn(`Cart ID changed after addMultipleLines from ${currentCartId} to ${targetCart.id}`);
            this._cartId.set(targetCart.id);
            if (uId) {
              await this._saveUserCartId(uId, targetCart.id);
              await this._clearAnonymousCartId();
            } else {
              await this._saveAnonymousCartId(targetCart.id);
            }
          }
        } else { throw new Error('Failed to add multiple line items.'); }
      }
      const finalCartId = untracked(this._cartId);
      if (uId && finalCartId) {
        const currentUser = this.authService.getCurrentUser();
        if (currentUser?.email) {
          await this.updateBuyerIdentity(finalCartId, { email: currentUser.email, countryCode: 'DE' });
        }
      }
    } catch (err) {
      console.error('CartService: Error adding multiple lines:', err);
      this.error.set('Fehler beim Hinzufügen der Artikel zum Warenkorb.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async removeLine(lineId: string): Promise<void> {
    const currentCartId = untracked(this._cartId);
    if (!currentCartId) { this.error.set("Kein Warenkorb aktiv."); return; }
    this.isLoading.set(true); this.error.set(null);
    try {
      const updatedCart = await this.shopifyService.removeCartLines(currentCartId, [lineId]);
      if (updatedCart) { this.cart.set(updatedCart); }
      else { throw new Error("Failed to remove line."); }
    } catch (err) {
      console.error('CartService: Error removing line:', err);
      this.error.set('Artikel konnte nicht entfernt werden.');
    } finally { this.isLoading.set(false); }
  }

  async updateLineQuantity(lineId: string, quantity: number): Promise<void> {
    const currentCartId = untracked(this._cartId);
    if (!currentCartId) { this.error.set("Kein Warenkorb aktiv."); return; }
    if (quantity <= 0) { await this.removeLine(lineId); return; }
    this.isLoading.set(true); this.error.set(null);
    const line: CartLineUpdateInput = { id: lineId, quantity };
    try {
      const updatedCart = await this.shopifyService.updateCartLines(currentCartId, [line]);
      if (updatedCart) { this.cart.set(updatedCart); }
      else { throw new Error("Failed to update quantity."); }
    } catch (err) {
      console.error('CartService: Error updating quantity:', err);
      this.error.set('Menge konnte nicht aktualisiert werden.');
    } finally { this.isLoading.set(false); }
  }

  private async handleLogin(userId: string): Promise<void> {
    if (!userId) { console.error("CartService: handleLogin called without userId!"); return; }
    console.log(`CartService: Handling login for user ${userId}`);
    this.isLoading.set(true); this.error.set(null);
    const anonymousCartId = this._loadAnonymousCartId();
    const userCartId = await this._loadUserCartId(userId);
    console.log(`CartService: Anonymous Cart ID: ${anonymousCartId}`);
    console.log(`CartService: User Cart ID: ${userCartId}`);
    let finalCartIdToSetActive: string | null = null;

    if (!userCartId && anonymousCartId) {
      console.log("CartService: Scenario A - Adopting anonymous cart.");
      await this._saveUserCartId(userId, anonymousCartId);
      await this._clearAnonymousCartId();
      finalCartIdToSetActive = anonymousCartId;
    } else if (userCartId && !anonymousCartId) {
      console.log("CartService: Scenario B - Loading user cart.");
      await this._clearAnonymousCartId();
      finalCartIdToSetActive = userCartId;
    } else if (userCartId && anonymousCartId) {
      if (userCartId === anonymousCartId) {
        console.log("CartService: Scenario C1 - User cart and anonymous cart are the same.");
        await this._clearAnonymousCartId();
        finalCartIdToSetActive = userCartId;
      } else {
        console.log("CartService: Scenario C2 - Merging anonymous cart into user cart.");
        finalCartIdToSetActive = userCartId;
        const anonCart = await this.shopifyService.fetchCart(anonymousCartId); // Hole direkt, ohne fetchCart zu nutzen
        if (anonCart && anonCart.lines.edges.length > 0) {
          const linesToAdd: CartLineInput[] = anonCart.lines.edges.map(edge => ({ merchandiseId: edge.node.merchandise.id, quantity: edge.node.quantity }));
          console.log("CartService: Attempting to add lines to user cart:", linesToAdd);
          try {
            const updatedUserCart = await this.shopifyService.addCartLines(userCartId, linesToAdd);
            if (updatedUserCart) {
              console.log("CartService: Merge successful. Updating cart state manually.");
              this.cart.set(updatedUserCart); // State manuell setzen
            } else {
              console.error("CartService: Failed to add lines during merge. Cart may be incomplete.");
              this.error.set("Fehler beim Zusammenführen der Warenkörbe.");
              await this.fetchCart(userCartId); // Lade originalen User Cart als Fallback
            }
          } catch (mergeError) {
            console.error("CartService: Exception during addCartLines in merge:", mergeError);
            this.error.set("Fehler beim Zusammenführen der Warenkörbe.");
            await this.fetchCart(userCartId);
          }
        } else {
          console.log("CartService: Anonymous cart was empty or fetch failed, no lines to merge.");
          if(untracked(this.cart)?.id !== userCartId) { await this.fetchCart(userCartId); }
        }
        await this._clearAnonymousCartId();
      }
    } else {
      console.log("CartService: Scenario D - No carts found.");
      finalCartIdToSetActive = null;
      await this._clearAnonymousCartId();
    }

    this._cartId.set(finalCartIdToSetActive); // Trigger Effekt zum Laden/Leeren

    const finalActiveCartId = untracked(this._cartId);
    const currentUser = this.authService.getCurrentUser();
    if (finalActiveCartId && currentUser?.email) {
       console.log(`Attempting to update buyer identity for cart ${finalActiveCartId}`);
       await this.updateBuyerIdentity(finalActiveCartId, { email: currentUser.email, countryCode: 'DE' });
    }
    this.isLoading.set(false);
  }

  private async handleLogout(): Promise<void> {
    console.log("CartService: Handling logout.");
    const currentActiveCartId = untracked(this._cartId);
    this.cart.set(null);
    if (currentActiveCartId) {
        await this._saveAnonymousCartId(currentActiveCartId);
        this._cartId.set(currentActiveCartId);
        console.log(`CartService: User logged out. Cart ${currentActiveCartId} is now treated as anonymous.`);
    } else {
        this._cartId.set(null);
        await this._clearAnonymousCartId();
        console.log("CartService: No active cart during logout.");
    }
  }

  private async clearCartState(deleteUserCartIdInFirestore: boolean = false): Promise<void> {
    const previousCartId = untracked(this._cartId);
    this.cart.set(null);
    this._cartId.set(null);
    await this._clearAnonymousCartId();
    if (deleteUserCartIdInFirestore) {
        const userId = untracked(this.currentUserId);
        if (userId) { await this._saveUserCartId(userId, null); }
    }
    console.log(`CartService: Cleared cart state. Previous active cart ID was ${previousCartId}`);
  }

  async updateBuyerIdentity(cartId: string, buyerIdentity: CartBuyerIdentityInput): Promise<void> {
     console.log(`CartService: Updating buyer identity for cart ${cartId}`);
     try {
         const updatedCart = await this.shopifyService.updateCartBuyerIdentity(cartId, buyerIdentity);
         if (updatedCart) {
             // Nur aktualisieren, wenn die ID noch die aktive ist
             if (untracked(this._cartId) === updatedCart.id) {
                 this.cart.set(updatedCart);
                 console.log("CartService: Buyer identity updated successfully.");
             } else {
                  console.log("CartService: Buyer identity updated, but active cart changed in meantime.");
             }
         } else {
             console.warn(`CartService: CartBuyerIdentity update for ${cartId} did not return an updated cart.`);
         }
     } catch (error) {
         console.error(`CartService: Error updating buyer identity for cart ${cartId}:`, error);
         this.error.set("Kundeninformation konnte nicht aktualisiert werden.");
     }
   }

} // Ende CartService Klasse