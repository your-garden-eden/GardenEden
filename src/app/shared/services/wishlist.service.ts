// src/app/shared/services/wishlist.service.ts
import { Injectable, inject, signal, WritableSignal, Signal, computed, untracked, OnDestroy } from '@angular/core';
import { Firestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, DocumentReference, DocumentData, setDoc } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { CartService } from './cart.service';
import { WoocommerceService, WooCommerceProduct } from '../../core/services/woocommerce.service';
import { Subscription, forkJoin, of, firstValueFrom } from 'rxjs'; // firstValueFrom importiert
import { distinctUntilChanged, map, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class WishlistService implements OnDestroy {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private cartService = inject(CartService);
  private woocommerceService = inject(WoocommerceService);

  private _wishlistProductSlugs: WritableSignal<string[]> = signal([]);
  public readonly wishlistProductSlugs$: Signal<string[]> = this._wishlistProductSlugs.asReadonly();
  public readonly isLoading: WritableSignal<boolean> = signal(false);
  public readonly error: WritableSignal<string | null> = signal(null);

  public readonly isEmpty: Signal<boolean> = computed(() => this._wishlistProductSlugs().length === 0);
  private readonly wishlistMap: Signal<Record<string, boolean>> = computed(() => {
    const slugs = this._wishlistProductSlugs();
    const map: Record<string, boolean> = {};
    for (const slug of slugs) {
      map[slug] = true;
    }
    return map;
  });

  private currentUserId: string | null = null;
  private authSubscription: Subscription | null = null;

  constructor() {
    this.subscribeToAuthState();
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }

  private subscribeToAuthState(): void {
    if (this.authSubscription) { return; }

    this.authSubscription = this.authService.authState$.pipe(
      map(user => user?.uid ?? null),
      distinctUntilChanged()
    ).subscribe(userId => {
      const previousUserId = this.currentUserId;
      this.currentUserId = userId;

      if (userId) {
        this.loadWishlist(userId);
      } else {
        this.clearWishlistOnLogout();
      }
    });
  }

  private _getUserDocRef(userId: string): DocumentReference<DocumentData> | null {
    if (!userId) return null;
    return doc(this.firestore, `users/${userId}`);
  }

  async loadWishlist(userId: string): Promise<void> {
    if (!userId) {
      this._wishlistProductSlugs.set([]);
      return;
    }
    this.isLoading.set(true);
    this.error.set(null);
    const userDocRef = this._getUserDocRef(userId);
    if (!userDocRef) {
        this.isLoading.set(false);
        this.error.set('Fehler: Benutzerreferenz konnte nicht erstellt werden.');
        this._wishlistProductSlugs.set([]);
        return;
    }
    try {
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const slugs = (docSnap.data()?.['wishlist_product_slugs'] as string[] | undefined) ?? [];
        this._wishlistProductSlugs.set(slugs);
      } else {
        if(untracked(this._wishlistProductSlugs).length > 0) { this._wishlistProductSlugs.set([]); }
      }
    } catch (error: any) {
      console.error('WishlistService: Error loading wishlist from Firestore:', error);
      this.error.set('Ihre Wunschliste konnte nicht geladen werden.');
      this._wishlistProductSlugs.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async addToWishlist(productSlug: string): Promise<void> {
    const userId = this.currentUserId;
    if (!userId) { this.error.set('Bitte anmelden, um Produkte zur Wunschliste hinzuzufügen.'); return; }
    if (!productSlug) { console.warn('WishlistService: addToWishlist called with empty slug.'); return; }
    if (this.isOnWishlist(productSlug)) { return; }

    this.isLoading.set(true); this.error.set(null);
    const userDocRef = this._getUserDocRef(userId);
    if (!userDocRef) { this.isLoading.set(false); this.error.set('Fehler: Benutzerreferenz konnte nicht erstellt werden.'); return; }
    try {
      await setDoc(userDocRef, { wishlist_product_slugs: arrayUnion(productSlug) }, { merge: true });
      this._wishlistProductSlugs.update(currentSlugs => {
          if (!currentSlugs.includes(productSlug)) { return [...currentSlugs, productSlug]; }
          return currentSlugs;
      });
    } catch (error: any) {
      console.error('WishlistService: Error adding to wishlist in Firestore:', error);
      this.error.set('Produkt konnte nicht zur Wunschliste hinzugefügt werden.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async removeFromWishlist(productSlug: string): Promise<void> {
     const userId = this.currentUserId;
     if (!userId || !productSlug || !this.isOnWishlist(productSlug)) { return; }
     this.isLoading.set(true); this.error.set(null);
     const userDocRef = this._getUserDocRef(userId);
     if (!userDocRef) { this.isLoading.set(false); this.error.set('Fehler: Benutzerreferenz konnte nicht erstellt werden.'); return; }
     try {
       await updateDoc(userDocRef, { wishlist_product_slugs: arrayRemove(productSlug) });
       this._wishlistProductSlugs.update(currentSlugs => currentSlugs.filter(s => s !== productSlug));
     } catch (error: any) {
       console.error('WishlistService: Error removing from wishlist in Firestore:', error);
       this.error.set('Produkt konnte nicht von der Wunschliste entfernt werden.');
     } finally {
       this.isLoading.set(false);
     }
  }

  public isOnWishlist(productSlug: string): boolean {
    return this.wishlistMap()[productSlug] ?? false;
  }

  private clearWishlistOnLogout(): void {
    if(untracked(this._wishlistProductSlugs).length > 0) { this._wishlistProductSlugs.set([]); }
    this.error.set(null);
    this.isLoading.set(false);
  }

  async moveFromWishlistToCart(productSlug: string): Promise<void> {
     const userId = this.currentUserId;
     if (!userId) { this.error.set("Bitte anmelden."); return; }
     if (!productSlug) { return; }
     if (!this.isOnWishlist(productSlug)) { return; }

     this.isLoading.set(true); this.error.set(null);
     try {
        const product = await firstValueFrom(this.woocommerceService.getProductBySlug(productSlug).pipe(
            catchError(err => {
                console.error(`Wishlist: Produkt ${productSlug} nicht gefunden via WooCommerceService`, err);
                throw new Error(`Produkt ${productSlug} nicht gefunden.`);
            })
        ));
        if (!product) throw new Error(`Produkt ${productSlug} nicht gefunden.`);

        if (product.stock_status !== 'instock' || !product.purchasable) {
            throw new Error(`Produkt ${product.name} ist nicht verfügbar.`);
        }

        let productIdToAdd = product.id;
        let variationIdToAdd: number | undefined = undefined;

        if (product.type === 'variable') {
          console.warn(`Versuch, variables Produkt '${product.name}' ohne spezifische Variante von Wunschliste in Warenkorb zu legen.`);
        }

        await this.cartService.addItem(productIdToAdd, 1, variationIdToAdd);
        await this.removeFromWishlist(productSlug);
     } catch (error: any) {
        console.error(`Error moving ${productSlug} to cart:`, error);
        this.error.set(error.message || "Fehler beim Verschieben in den Warenkorb.");
     } finally {
        this.isLoading.set(false);
     }
  }

  async addAllToCartAndClearWishlist(): Promise<void> {
    const userId = this.currentUserId;
    const slugs = untracked(this._wishlistProductSlugs);

    if (!userId) { this.error.set("Bitte anmelden."); return; }
    if (slugs.length === 0) { this.error.set("Ihre Wunschliste ist leer."); return; }

    this.isLoading.set(true); this.error.set(null);

    try {
      const productObservables = slugs.map(slug =>
        this.woocommerceService.getProductBySlug(slug).pipe(
          catchError(() => of(null))
        )
      );
      const productsOrNulls = await firstValueFrom(forkJoin(productObservables));
      const products = productsOrNulls.filter(p => p !== null) as WooCommerceProduct[];

      const itemsToAdd: { productId: number, quantity: number, variationId?: number }[] = [];
      products.forEach(product => {
        if (product.stock_status === 'instock' && product.purchasable) {
          let variationId: number | undefined = undefined;
          if (product.type === 'variable') {
            console.warn(`addAllToCart: Variables Produkt ${product.name} wird ohne spezifische Variante hinzugefügt.`);
          }
          itemsToAdd.push({ productId: product.id, quantity: 1, variationId });
        }
      });

      if (itemsToAdd.length === 0) {
        this.error.set("Keine der Wunschlistenartikel sind aktuell verfügbar.");
        this.isLoading.set(false);
        return;
      }

      for (const item of itemsToAdd) {
        await this.cartService.addItem(item.productId, item.quantity, item.variationId);
      }

      await this.clearFirestoreWishlist(userId);
      this._wishlistProductSlugs.set([]);

    } catch (error: any) {
      console.error("WishlistService: Error during addAllToCart:", error);
      this.error.set(error.message || "Ein Fehler ist beim Hinzufügen aller Artikel zum Warenkorb aufgetreten.");
    } finally {
      this.isLoading.set(false);
    }
  }

  private async clearFirestoreWishlist(userId: string): Promise<void> {
    if (!userId) { throw new Error("Benutzer-ID fehlt zum Leeren der Wunschliste."); }
    const userDocRef = this._getUserDocRef(userId);
    if (!userDocRef) { throw new Error("Benutzerreferenz konnte nicht erstellt werden."); }
    try {
        await updateDoc(userDocRef, { wishlist_product_slugs: [] });
    } catch (error) {
        console.error(`WishlistService: Error clearing Firestore wishlist for user ${userId}:`, error);
        throw new Error("Fehler beim Leeren der Wunschliste in der Datenbank.");
    }
  }
}