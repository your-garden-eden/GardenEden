// src/app/shared/services/wishlist.service.ts
import { Injectable, inject, signal, WritableSignal, Signal, computed, untracked, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common'; // Import für isPlatformBrowser
import { Firestore, doc, getDoc, updateDoc, arrayUnion, arrayRemove, DocumentReference, DocumentData, setDoc } from '@angular/fire/firestore';
import { AuthService, WordPressUser } from './auth.service'; // WordPressUser importieren
import { CartService } from './cart.service';
import { WoocommerceService, WooCommerceProduct } from '../../core/services/woocommerce.service';
import { Subscription, forkJoin, of, firstValueFrom } from 'rxjs';
import { distinctUntilChanged, map, catchError } from 'rxjs/operators';
import { TranslocoService } from '@ngneat/transloco'; // Import für Übersetzungen
import { UiStateService } from './ui-state.service'; // Für Erfolgs-/Fehlermeldungen


@Injectable({
  providedIn: 'root'
})
export class WishlistService implements OnDestroy {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private cartService = inject(CartService);
  private woocommerceService = inject(WoocommerceService);
  private platformId = inject(PLATFORM_ID); // platformId injizieren
  private translocoService = inject(TranslocoService); // translocoService injizieren
  private uiStateService = inject(UiStateService); // uiStateService injizieren

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

  private currentUserId: string | null = null; // Wird jetzt als String gespeichert (WordPress User ID)
  private authSubscription: Subscription | null = null;

  private storageKeyPrefix = 'wishlist_wp_'; // Präfix geändert, um Konflikte mit alten Firebase-Wishlists zu vermeiden

  constructor() {
    if (isPlatformBrowser(this.platformId)) { // Nur im Browser ausführen
        this.subscribeToAuthState();
    }
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }

  private subscribeToAuthState(): void {
    if (this.authSubscription) { return; }

    // KORRIGIERT: currentWordPressUser$ und user.id verwenden
    this.authSubscription = this.authService.currentWordPressUser$.pipe(
      map((user: WordPressUser | null) => user?.id?.toString() ?? null), // WordPress User ID als String oder null
      distinctUntilChanged()
    ).subscribe(userId => {
      // const previousUserId = this.currentUserId; // Nicht unbedingt benötigt hier
      this.currentUserId = userId;

      if (userId) {
        console.log(`[WishlistService] User logged in with WP ID: ${userId}. Loading wishlist.`);
        this.loadWishlist(userId);
      } else {
        console.log('[WishlistService] User logged out. Clearing wishlist.');
        this.clearWishlistOnLogout();
      }
    });
  }

  private _getUserDocRef(userId: string): DocumentReference<DocumentData> | null {
    // Nimmt jetzt die WordPress User ID als String an (da wir sie so speichern)
    if (!userId) return null;
    // Die Firestore-Struktur bleibt gleich (users/{userId}), aber userId ist jetzt die WP ID.
    // Überlege, ob du Firestore überhaupt noch für die Wishlist nutzen willst, oder ob es
    // sinnvoller ist, die Wishlist auch über WordPress (z.B. als User Meta) zu speichern,
    // um alles an einem Ort zu haben. Für den Moment belassen wir es bei Firestore.
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
        this.error.set(this.translocoService.translate('wishlist.errorUserRef'));
        this._wishlistProductSlugs.set([]);
        return;
    }
    try {
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const slugs = (docSnap.data()?.['wishlist_product_slugs'] as string[] | undefined) ?? [];
        this._wishlistProductSlugs.set(slugs);
      } else {
        // Wenn kein Dokument existiert, ist die Wunschliste leer (kein Fehler)
        this._wishlistProductSlugs.set([]);
        // Optional: Dokument erstellen, wenn es nicht existiert
        // await setDoc(userDocRef, { wishlist_product_slugs: [] });
      }
    } catch (error: any) {
      console.error('WishlistService: Error loading wishlist from Firestore:', error);
      this.error.set(this.translocoService.translate('wishlist.errorLoading'));
      this._wishlistProductSlugs.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async addToWishlist(productSlug: string): Promise<void> {
    const userId = this.currentUserId;
    if (!userId) {
        this.uiStateService.showGlobalError(this.translocoService.translate('wishlist.errorNotLoggedIn'));
        return;
    }
    if (!productSlug) { console.warn('WishlistService: addToWishlist called with empty slug.'); return; }
    if (this.isOnWishlist(productSlug)) {
        // Produkt ist bereits auf der Wunschliste. Ggf. Info-Meldung.
        // this.uiStateService.showGlobalInfo(this.translocoService.translate('wishlist.alreadyInWishlist'));
        return;
    }

    this.isLoading.set(true); this.error.set(null);
    const userDocRef = this._getUserDocRef(userId);
    if (!userDocRef) {
        this.isLoading.set(false);
        this.error.set(this.translocoService.translate('wishlist.errorUserRef'));
        return;
    }
    try {
      await setDoc(userDocRef, { wishlist_product_slugs: arrayUnion(productSlug) }, { merge: true });
      this._wishlistProductSlugs.update(currentSlugs => {
          if (!currentSlugs.includes(productSlug)) { return [...currentSlugs, productSlug]; }
          return currentSlugs;
      });
      // Erfolgsmeldung über UiStateService
      // this.uiStateService.showGlobalSuccess(this.translocoService.translate('wishlist.addedSuccess'));
    } catch (error: any) {
      console.error('WishlistService: Error adding to wishlist in Firestore:', error);
      this.error.set(this.translocoService.translate('wishlist.errorAdding'));
    } finally {
      this.isLoading.set(false);
    }
  }

  async removeFromWishlist(productSlug: string): Promise<void> {
     const userId = this.currentUserId;
     if (!userId || !productSlug || !this.isOnWishlist(productSlug)) { return; }
     this.isLoading.set(true); this.error.set(null);
     const userDocRef = this._getUserDocRef(userId);
     if (!userDocRef) {
         this.isLoading.set(false);
         this.error.set(this.translocoService.translate('wishlist.errorUserRef'));
         return;
    }
     try {
       await updateDoc(userDocRef, { wishlist_product_slugs: arrayRemove(productSlug) });
       this._wishlistProductSlugs.update(currentSlugs => currentSlugs.filter(s => s !== productSlug));
       // Erfolgsmeldung
       // this.uiStateService.showGlobalSuccess(this.translocoService.translate('wishlist.removedSuccess'));
     } catch (error: any) {
       console.error('WishlistService: Error removing from wishlist in Firestore:', error);
       this.error.set(this.translocoService.translate('wishlist.errorRemoving'));
     } finally {
       this.isLoading.set(false);
     }
  }

  public isOnWishlist(productSlug: string): boolean {
    return this.wishlistMap()[productSlug] ?? false;
  }

  private clearWishlistOnLogout(): void {
    this._wishlistProductSlugs.set([]); // Keine Notwendigkeit für untracked hier
    this.error.set(null);
    this.isLoading.set(false);
  }

  async moveFromWishlistToCart(productSlug: string): Promise<void> {
     const userId = this.currentUserId;
     if (!userId) { this.error.set(this.translocoService.translate('wishlist.errorNotLoggedIn')); return; }
     if (!productSlug) { return; }
     if (!this.isOnWishlist(productSlug)) { return; }

     this.isLoading.set(true); this.error.set(null);
     try {
        const product = await firstValueFrom(this.woocommerceService.getProductBySlug(productSlug).pipe(
            catchError(err => {
                console.error(`Wishlist: Produkt ${productSlug} nicht gefunden via WooCommerceService`, err);
                throw new Error(this.translocoService.translate('wishlist.errorProductNotFound', { slug: productSlug }));
            })
        ));
        if (!product) throw new Error(this.translocoService.translate('wishlist.errorProductNotFound', { slug: productSlug }));

        if (product.stock_status !== 'instock' || !product.purchasable) {
            throw new Error(this.translocoService.translate('wishlist.errorProductNotAvailable', { productName: product.name }));
        }

        let productIdToAdd = product.id;
        let variationIdToAdd: number | undefined = undefined;

        if (product.type === 'variable') {
          console.warn(`Versuch, variables Produkt '${product.name}' ohne spezifische Variante von Wunschliste in Warenkorb zu legen.`);
          // Hier könnte Logik hin, um den User zur Produktdetailseite zu leiten, um Varianten auszuwählen,
          // oder die erste verfügbare Variante zu nehmen (riskant).
          // Fürs Erste: Fehler oder Hinweis.
          this.error.set(this.translocoService.translate('wishlist.errorVariableProductNeedsSelection', { productName: product.name }));
          this.isLoading.set(false);
          return;
        }

        await this.cartService.addItem(productIdToAdd, 1, variationIdToAdd);
        await this.removeFromWishlist(productSlug); // Erst nach erfolgreichem Hinzufügen entfernen
        // Erfolgsmeldung
        // this.uiStateService.showGlobalSuccess(this.translocoService.translate('wishlist.movedToCartSuccess', { productName: product.name }));
     } catch (error: any) {
        console.error(`Error moving ${productSlug} to cart:`, error);
        this.error.set(error.message || this.translocoService.translate('wishlist.errorMovingToCart'));
     } finally {
        this.isLoading.set(false);
     }
  }

  async addAllToCartAndClearWishlist(): Promise<void> {
    const userId = this.currentUserId;
    const slugs = untracked(this._wishlistProductSlugs); // untracked ist hier gut, um nicht auf Änderungen während der Iteration zu reagieren

    if (!userId) { this.error.set(this.translocoService.translate('wishlist.errorNotLoggedIn')); return; }
    if (slugs.length === 0) { this.error.set(this.translocoService.translate('wishlist.isEmpty')); return; }

    this.isLoading.set(true); this.error.set(null);
    let itemsSuccessfullyAdded = 0;
    let itemsFailed = 0;

    try {
      const productObservables = slugs.map(slug =>
        this.woocommerceService.getProductBySlug(slug).pipe(
          catchError(() => of(null)) // Fehler beim Laden einzelner Produkte abfangen
        )
      );
      const productsOrNulls = await firstValueFrom(forkJoin(productObservables));
      const products = productsOrNulls.filter(p => p !== null) as WooCommerceProduct[];

      for (const product of products) {
        if (product.stock_status === 'instock' && product.purchasable) {
          let variationId: number | undefined = undefined;
          if (product.type === 'variable') {
            console.warn(`addAllToCart: Variables Produkt ${product.name} wird ohne spezifische Variante hinzugefügt. Überspringe...`);
            // Hier könntest du den Benutzer informieren oder das Produkt überspringen.
            itemsFailed++;
            continue;
          }
          try {
            await this.cartService.addItem(product.id, 1, variationId);
            itemsSuccessfullyAdded++;
          } catch (addItemError) {
            console.error(`Fehler beim Hinzufügen von Produkt ${product.name} zum Warenkorb:`, addItemError);
            itemsFailed++;
          }
        } else {
          itemsFailed++;
          console.log(`Produkt ${product.name} nicht verfügbar und nicht zum Warenkorb hinzugefügt.`);
        }
      }

      if (itemsSuccessfullyAdded > 0) {
        // Lösche nur die erfolgreich hinzugefügten Slugs aus der Firestore-Wunschliste
        // und dem lokalen Signal. Dies ist komplexer, wenn `addAllToCart` ein "alles oder nichts" sein soll.
        // Fürs Erste: Wir leeren die gesamte Wunschliste, wenn mindestens ein Artikel hinzugefügt wurde.
        // Eine bessere Lösung wäre, nur die erfolgreich verschobenen zu entfernen.
        await this.clearFirestoreWishlist(userId); // Dies löscht die gesamte Firestore-Wunschliste
        this._wishlistProductSlugs.set([]); // Lokale Wunschliste leeren
        // this.uiStateService.showGlobalSuccess(this.translocoService.translate('wishlist.allAddedToCartSuccess', { count: itemsSuccessfullyAdded }));
      }

      if (itemsFailed > 0) {
        this.error.set(this.translocoService.translate('wishlist.someItemsNotAddedError', { count: itemsFailed }));
      }


    } catch (error: any) {
      console.error("WishlistService: Error during addAllToCart:", error);
      this.error.set(error.message || this.translocoService.translate('wishlist.errorAddingAllToCart'));
    } finally {
      this.isLoading.set(false);
    }
  }

  private async clearFirestoreWishlist(userId: string): Promise<void> {
    if (!userId) { throw new Error("Benutzer-ID fehlt zum Leeren der Wunschliste."); }
    const userDocRef = this._getUserDocRef(userId);
    if (!userDocRef) { throw new Error("Benutzerreferenz konnte nicht erstellt werden."); }
    try {
        // Setze das Feld auf ein leeres Array, anstatt das Dokument zu löschen,
        // falls das Dokument andere Benutzerdaten enthält.
        await setDoc(userDocRef, { wishlist_product_slugs: [] }, { merge: true });
    } catch (error) {
        console.error(`WishlistService: Error clearing Firestore wishlist for user ${userId}:`, error);
        throw new Error(this.translocoService.translate('wishlist.errorClearingDb'));
    }
  }
}