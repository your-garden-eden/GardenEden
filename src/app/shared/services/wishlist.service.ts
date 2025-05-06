// src/app/shared/services/wishlist.service.ts
import { Injectable, inject, signal, WritableSignal, Signal, computed, untracked, OnDestroy } from '@angular/core';
import { Firestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, DocumentReference, DocumentData, SetOptions, setDoc } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { User } from '@angular/fire/auth';
import { CartService } from './cart.service';
import { ShopifyService, Product, CartLineInput } from '../../core/services/shopify.service';
import { Subscription } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class WishlistService implements OnDestroy {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private cartService = inject(CartService);
  private shopifyService = inject(ShopifyService);

  // --- Signale für den Zustand ---
  private _wishlistHandles: WritableSignal<string[]> = signal([]);
  public readonly wishlistHandles$: Signal<string[]> = this._wishlistHandles.asReadonly();
  public readonly isLoading: WritableSignal<boolean> = signal(false);
  public readonly error: WritableSignal<string | null> = signal(null);

  // --- Computed Signals ---
  public readonly isEmpty: Signal<boolean> = computed(() => this._wishlistHandles().length === 0);
  private readonly wishlistMap: Signal<Record<string, boolean>> = computed(() => {
    const handles = this._wishlistHandles();
    // console.log('WishlistService: Computing wishlistMap for handles:', handles); // Debug-Log
    const map: Record<string, boolean> = {};
    for (const handle of handles) {
      map[handle] = true;
    }
    return map;
  });

  // --- User-Handling ---
  private currentUserId: string | null = null;
  private authSubscription: Subscription | null = null;

  constructor() {
    this.subscribeToAuthState();
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
    console.log('WishlistService destroyed, auth subscription unsubscribed.');
  }

  /** Beobachtet den AuthState und lädt/leert die Wunschliste entsprechend */
  private subscribeToAuthState(): void {
    if (this.authSubscription) { return; }

    this.authSubscription = this.authService.authState$.pipe(
      map(user => user?.uid ?? null),
      distinctUntilChanged()
    ).subscribe(userId => {
      console.log('WishlistService: User ID changed to', userId);
      const previousUserId = this.currentUserId;
      this.currentUserId = userId;

      if (userId) {
        this.loadWishlist(userId);
      } else if (previousUserId && !userId) {
        this.clearWishlistOnLogout();
      } else {
        this.clearWishlistOnLogout();
      }
    });
  }

  /** Gibt die Firestore Document Referenz für das User-Dokument zurück */
  private _getUserDocRef(userId: string): DocumentReference<DocumentData> | null {
    if (!userId) return null;
    return doc(this.firestore, `users/${userId}`);
  }

  /** Lädt die Wunschliste (Handles) für den gegebenen User aus Firestore */
  async loadWishlist(userId: string): Promise<void> {
    if (!userId) {
      console.warn('WishlistService: loadWishlist called without userId.');
      this._wishlistHandles.set([]);
      return;
    }
    console.log(`WishlistService: Loading wishlist for user ${userId}`);
    this.isLoading.set(true);
    this.error.set(null);
    const userDocRef = this._getUserDocRef(userId);
    if (!userDocRef) {
        this.isLoading.set(false);
        this.error.set('Fehler: Benutzerreferenz konnte nicht erstellt werden.');
        this._wishlistHandles.set([]);
        return;
    }
    try {
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const handles = (docSnap.data()?.['wishlist'] as string[] | undefined) ?? [];
        this._wishlistHandles.set(handles);
        console.log(`WishlistService: Loaded ${handles.length} items for user ${userId}.`);
      } else {
        console.log(`WishlistService: No user document found for ${userId}, wishlist is empty.`);
        if(untracked(this._wishlistHandles).length > 0) { this._wishlistHandles.set([]); }
      }
    } catch (error: any) {
      console.error('WishlistService: Error loading wishlist from Firestore:', error);
      this.error.set('Ihre Wunschliste konnte nicht geladen werden.');
      this._wishlistHandles.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Fügt einen Produkt-Handle zur Wunschliste in Firestore und im State hinzu. */
  async addToWishlist(productHandle: string): Promise<void> {
    const userId = this.currentUserId;
    if (!userId) { this.error.set('Bitte anmelden, um Produkte zur Wunschliste hinzuzufügen.'); return; }
    if (!productHandle) { console.warn('WishlistService: addToWishlist called with empty handle.'); return; }
    if (this.isOnWishlist(productHandle)) { console.log(`WishlistService: Handle ${productHandle} is already on the wishlist.`); return; }
    console.log(`WishlistService: Adding ${productHandle} to wishlist for user ${userId}`);
    this.isLoading.set(true); this.error.set(null);
    const userDocRef = this._getUserDocRef(userId);
    if (!userDocRef) { this.isLoading.set(false); this.error.set('Fehler: Benutzerreferenz konnte nicht erstellt werden.'); return; }
    try {
      await updateDoc(userDocRef, { wishlist: arrayUnion(productHandle) });
      this._wishlistHandles.update(currentHandles => {
          if (!currentHandles.includes(productHandle)) { return [...currentHandles, productHandle]; }
          return currentHandles;
      });
      console.log(`WishlistService: ${productHandle} added successfully.`);
    } catch (error: any) {
      console.error('WishlistService: Error adding to wishlist in Firestore:', error);
      if (error.code === 'not-found') { this.error.set('Benutzerprofil nicht gefunden. Hinzufügen fehlgeschlagen.'); }
      else { this.error.set('Produkt konnte nicht zur Wunschliste hinzugefügt werden.'); }
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Entfernt einen Produkt-Handle von der Wunschliste in Firestore und im State. */
  async removeFromWishlist(productHandle: string): Promise<void> {
     const userId = this.currentUserId;
     if (!userId || !productHandle || !this.isOnWishlist(productHandle)) { return; }
     console.log(`WishlistService: Removing ${productHandle} from wishlist for user ${userId}`);
     this.isLoading.set(true); this.error.set(null);
     const userDocRef = this._getUserDocRef(userId);
     if (!userDocRef) { this.isLoading.set(false); this.error.set('Fehler: Benutzerreferenz konnte nicht erstellt werden.'); return; }
     try {
       await updateDoc(userDocRef, { wishlist: arrayRemove(productHandle) });
       this._wishlistHandles.update(currentHandles => currentHandles.filter(h => h !== productHandle));
       console.log(`WishlistService: ${productHandle} removed successfully.`);
     } catch (error: any) {
       console.error('WishlistService: Error removing from wishlist in Firestore:', error);
       if (error.code === 'not-found') { this.error.set('Benutzerprofil nicht gefunden. Entfernen fehlgeschlagen.'); }
       else { this.error.set('Produkt konnte nicht von der Wunschliste entfernt werden.'); }
     } finally {
       this.isLoading.set(false);
     }
  }

  /** Prüft schnell, ob ein Produkt-Handle auf der Wunschliste ist. */
  public isOnWishlist(productHandle: string): boolean {
    return this.wishlistMap()[productHandle] ?? false;
  }

  /** Leert den lokalen Wunschlisten-State (wird bei Logout aufgerufen). */
  private clearWishlistOnLogout(): void {
    console.log('WishlistService: Clearing local wishlist state on logout.');
    if(untracked(this._wishlistHandles).length > 0) { this._wishlistHandles.set([]); }
    this.error.set(null);
    this.isLoading.set(false);
  }

  /** Verschiebt ein Produkt von der Wunschliste in den Warenkorb. */
  async moveFromWishlistToCart(productHandle: string): Promise<void> {
     const userId = this.currentUserId;
     if (!userId) { this.error.set("Bitte anmelden."); return; }
     if (!productHandle) { console.warn("moveFromWishlistToCart called with empty handle."); return; }
     if (!this.isOnWishlist(productHandle)) { console.log(`${productHandle} not on wishlist.`); return; }
     console.log(`Moving ${productHandle} from wishlist to cart...`);
     this.isLoading.set(true); this.error.set(null);
     try {
        const product = await this.shopifyService.getProductByHandle(productHandle);
        if (!product) throw new Error(`Produkt ${productHandle} nicht gefunden.`);
        const availableVariant = product.variants?.edges?.find(edge => edge.node.availableForSale);
        let variantId: string | null | undefined = availableVariant?.node?.id;
        if (!variantId && product.variants?.edges?.[0]?.node?.id) { variantId = product.variants.edges[0].node.id; }
        if (!variantId) { throw new Error(`Keine verfügbare Variante für ${product.title} gefunden.`); }
        await this.cartService.addLine(variantId, 1);
        console.log(`${product.handle} added to cart.`);
        await this.removeFromWishlist(productHandle);
        console.log(`${product.handle} moved successfully.`);
     } catch (error: any) {
        console.error(`Error moving ${productHandle} to cart:`, error);
        this.error.set(error.message || "Fehler beim Verschieben in den Warenkorb.");
     } finally {
        this.isLoading.set(false);
     }
  }

  /** Fügt alle Produkte von der Wunschliste zum Warenkorb hinzu und leert die Wunschliste. */
  async addAllToCartAndClearWishlist(): Promise<void> {
    const userId = this.currentUserId;
    const handles = untracked(this._wishlistHandles);

    console.log('[WISHLIST_SERVICE] addAllToCart: START');

    if (!userId) {
      this.error.set("Bitte anmelden, um diese Aktion auszuführen.");
      console.log('[WISHLIST_SERVICE] addAllToCart: User not logged in, aborting.');
      return;
    }
    if (handles.length === 0) {
      this.error.set("Ihre Wunschliste ist leer.");
      console.log('[WISHLIST_SERVICE] addAllToCart: Wishlist is empty, aborting.');
      return;
    }

    console.log(`[WISHLIST_SERVICE] addAllToCart: Attempting to add ${handles.length} items for user ${userId}. Handles:`, handles);
    this.isLoading.set(true);
    this.error.set(null);

    try {
        console.log('[WISHLIST_SERVICE] addAllToCart: Fetching products by handles...');
        const products: Product[] = await this.shopifyService.getProductsByHandles(handles);
        console.log('[WISHLIST_SERVICE] addAllToCart: Fetched products:', products);

        const linesToAdd: CartLineInput[] = [];

        products.forEach((product: Product) => {
            console.log(`[WISHLIST_SERVICE] addAllToCart: Processing product: ${product.title}, AvailableForSale: ${product.availableForSale}`);
            if (product.availableForSale) {
                const availableVariant = product.variants?.edges?.find(edge => edge.node.availableForSale);
                let variantId: string | null | undefined = availableVariant?.node?.id;
                if (!variantId && product.variants?.edges?.[0]?.node?.id) {
                    variantId = product.variants.edges[0].node.id;
                    console.log(`[WISHLIST_SERVICE] addAllToCart: No explicitly available variant for ${product.title}, using first variant ID: ${variantId}`);
                }
                if (variantId) {
                    linesToAdd.push({ merchandiseId: variantId, quantity: 1 });
                    console.log(`[WISHLIST_SERVICE] addAllToCart: Prepared line for ${product.title}:`, { merchandiseId: variantId, quantity: 1 });
                } else {
                    console.warn(`[WISHLIST_SERVICE] addAllToCart: Skipping ${product.title} - no variant ID found.`);
                }
            } else {
                console.warn(`[WISHLIST_SERVICE] addAllToCart: Skipping ${product.title} - product not availableForSale.`);
            }
        });

        console.log('[WISHLIST_SERVICE] addAllToCart: Lines to add to cart:', linesToAdd);

        if (linesToAdd.length === 0) {
            this.error.set("Keine der Wunschlistenartikel sind aktuell verfügbar.");
            console.log('[WISHLIST_SERVICE] addAllToCart: No available lines to add, aborting cart operation.');
            this.isLoading.set(false);
            return;
        }

        console.log('[WISHLIST_SERVICE] addAllToCart: Calling cartService.addMultipleLines...');
        await this.cartService.addMultipleLines(linesToAdd);
        console.log(`[WISHLIST_SERVICE] addAllToCart: ${linesToAdd.length} items presumably added to cart.`);

        console.log('[WISHLIST_SERVICE] addAllToCart: Clearing Firestore wishlist...');
        await this.clearFirestoreWishlist(userId);

        this._wishlistHandles.set([]);
        console.log("[WISHLIST_SERVICE] addAllToCart: Local wishlist state cleared.");

    } catch (error: any) {
        console.error("[WISHLIST_SERVICE] addAllToCart: CRITICAL ERROR during operation:", error);
        this.error.set(error.message || "Ein Fehler ist beim Hinzufügen aller Artikel zum Warenkorb aufgetreten.");
    } finally {
        console.log('[WISHLIST_SERVICE] addAllToCart: FINALLY - Setting isLoading to false.');
        this.isLoading.set(false);
    }
  }

  /** Leert nur die Wunschliste in Firestore, nicht den lokalen State */
  async clearFirestoreWishlist(userId: string): Promise<void> {
    if (!userId) { throw new Error("Benutzer-ID fehlt zum Leeren der Wunschliste."); }
    console.log(`WishlistService: Clearing Firestore wishlist for user ${userId}`);
    const userDocRef = this._getUserDocRef(userId);
    if (!userDocRef) { throw new Error("Benutzerreferenz konnte nicht erstellt werden."); }
    try {
        await updateDoc(userDocRef, { wishlist: [] });
        console.log(`WishlistService: Firestore wishlist cleared for user ${userId}.`);
    } catch (error) {
        console.error(`WishlistService: Error clearing Firestore wishlist for user ${userId}:`, error);
        throw new Error("Fehler beim Leeren der Wunschliste in der Datenbank.");
    }
  }

} // Ende WishlistService Klasse