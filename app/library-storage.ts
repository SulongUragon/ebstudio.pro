import type { Manuscript } from "./book-types";

export const LIBRARY_KEY = "eb-studio-pro-library-v1";
export const LEGACY_LIBRARY_KEY = "inkwell-library-v1";

const DATABASE_NAME = "eb-studio-pro-assets";
const DATABASE_VERSION = 2;
const COVER_STORE = "cover-assets";
const BOOK_IMAGE_STORE = "book-image-assets";

type CoverAsset = { id: string; imageData: string; sourceImageData?: string };
type BookImageAsset = { id: string; bookId: string; imageData: string };

export async function loadStoredLibrary(): Promise<Manuscript[]> {
  const saved = localStorage.getItem(LIBRARY_KEY) ?? localStorage.getItem(LEGACY_LIBRARY_KEY);
  if (!saved) return [];
  const parsed = JSON.parse(saved) as unknown;
  if (!Array.isArray(parsed)) return [];
  const books = parsed as Manuscript[];
  if (!supportsIndexedDb()) return books;

  const database = await openLibraryDatabase();
  const hydrated = await Promise.all(books.map(async (book) => {
    let next = book;
    if (book.cover) {
      const storedCover = await readAsset<CoverAsset>(database, COVER_STORE, book.id);
      if (storedCover?.imageData) next = { ...next, cover: { ...book.cover, imageData: storedCover.imageData, sourceImageData: storedCover.sourceImageData } };
      else if (!book.cover.imageData) next = { ...next, cover: undefined };
    }
    if (book.images?.length) {
      const hydratedImages = await Promise.all(book.images.map(async (image) => {
        const stored = await readAsset<BookImageAsset>(database, BOOK_IMAGE_STORE, image.id);
        return stored?.imageData ? { ...image, imageData: stored.imageData } : image;
      }));
      next = { ...next, images: hydratedImages };
    }
    return next;
  }));
  database.close();

  await persistStoredLibrary(hydrated);
  localStorage.removeItem(LEGACY_LIBRARY_KEY);
  return hydrated;
}

export async function persistStoredLibrary(books: Manuscript[]) {
  if (!supportsIndexedDb()) {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(books));
    return;
  }

  const database = await openLibraryDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([COVER_STORE, BOOK_IMAGE_STORE], "readwrite");
    const coverStore = transaction.objectStore(COVER_STORE);
    const imageStore = transaction.objectStore(BOOK_IMAGE_STORE);
    const activeBookIds = new Set(books.map((book) => book.id));
    const activeImageIds = new Set<string>();

    for (const book of books) {
      if (book.cover?.imageData) coverStore.put({ id: book.id, imageData: book.cover.imageData, sourceImageData: book.cover.sourceImageData } satisfies CoverAsset);
      else coverStore.delete(book.id);

      for (const image of book.images ?? []) {
        activeImageIds.add(image.id);
        if (image.imageData) imageStore.put({ id: image.id, bookId: book.id, imageData: image.imageData } satisfies BookImageAsset);
      }
    }

    const coverKeys = coverStore.getAllKeys();
    coverKeys.onsuccess = () => { for (const key of coverKeys.result) if (typeof key === "string" && !activeBookIds.has(key)) coverStore.delete(key); };
    const imageKeys = imageStore.getAllKeys();
    imageKeys.onsuccess = () => { for (const key of imageKeys.result) if (typeof key === "string" && !activeImageIds.has(key)) imageStore.delete(key); };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Asset storage failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Asset storage was interrupted."));
  });
  database.close();

  const lightweightLibrary = books.map((book) => ({
    ...book,
    cover: book.cover ? { ...book.cover, imageData: "", sourceImageData: undefined } : undefined,
    images: book.images?.map((image) => ({ ...image, imageData: "" })),
  }));
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(lightweightLibrary));
}

function supportsIndexedDb() { return typeof indexedDB !== "undefined"; }

function openLibraryDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(COVER_STORE)) database.createObjectStore(COVER_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(BOOK_IMAGE_STORE)) database.createObjectStore(BOOK_IMAGE_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Asset storage could not be opened."));
  });
}

function readAsset<T>(database: IDBDatabase, storeName: string, id: string) {
  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error("Saved asset could not be loaded."));
  });
}
