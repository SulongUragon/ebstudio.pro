import type { Manuscript } from "./book-types";

export const LIBRARY_KEY = "eb-studio-pro-library-v1";
export const LEGACY_LIBRARY_KEY = "inkwell-library-v1";

const DATABASE_NAME = "eb-studio-pro-assets";
const DATABASE_VERSION = 1;
const COVER_STORE = "cover-assets";

type CoverAsset = {
  id: string;
  imageData: string;
  sourceImageData?: string;
};

export async function loadStoredLibrary(): Promise<Manuscript[]> {
  const saved =
    localStorage.getItem(LIBRARY_KEY) ??
    localStorage.getItem(LEGACY_LIBRARY_KEY);
  if (!saved) return [];

  const parsed = JSON.parse(saved) as unknown;
  if (!Array.isArray(parsed)) return [];
  const books = parsed as Manuscript[];
  if (!supportsIndexedDb()) return books;

  const database = await openLibraryDatabase();
  const hydrated = await Promise.all(
    books.map(async (book) => {
      if (!book.cover) return book;
      const storedCover = await readCoverAsset(database, book.id);
      if (storedCover?.imageData) {
        return {
          ...book,
          cover: {
            ...book.cover,
            imageData: storedCover.imageData,
            sourceImageData: storedCover.sourceImageData,
          },
        };
      }
      return book.cover.imageData ? book : { ...book, cover: undefined };
    }),
  );
  database.close();

  // Migrate legacy Base64 cover data out of localStorage after it is loaded.
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
    const transaction = database.transaction(COVER_STORE, "readwrite");
    const store = transaction.objectStore(COVER_STORE);
    const activeBookIds = new Set(books.map((book) => book.id));

    for (const book of books) {
      if (book.cover?.imageData) {
        store.put({
          id: book.id,
          imageData: book.cover.imageData,
          sourceImageData: book.cover.sourceImageData,
        } satisfies CoverAsset);
      } else {
        store.delete(book.id);
      }
    }

    const keysRequest = store.getAllKeys();
    keysRequest.onsuccess = () => {
      for (const key of keysRequest.result) {
        if (typeof key === "string" && !activeBookIds.has(key)) {
          store.delete(key);
        }
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Cover storage failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Cover storage was interrupted."));
  });
  database.close();

  const lightweightLibrary = books.map((book) =>
    book.cover
      ? {
          ...book,
          cover: {
            ...book.cover,
            imageData: "",
            sourceImageData: undefined,
          },
        }
      : book,
  );
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(lightweightLibrary));
}

function supportsIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openLibraryDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(COVER_STORE)) {
        database.createObjectStore(COVER_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Cover storage could not be opened."));
  });
}

function readCoverAsset(database: IDBDatabase, id: string) {
  return new Promise<CoverAsset | undefined>((resolve, reject) => {
    const transaction = database.transaction(COVER_STORE, "readonly");
    const request = transaction.objectStore(COVER_STORE).get(id);
    request.onsuccess = () => resolve(request.result as CoverAsset | undefined);
    request.onerror = () =>
      reject(request.error ?? new Error("Saved cover could not be loaded."));
  });
}
