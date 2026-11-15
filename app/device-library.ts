"use client";

import { syncCloudProjects } from "./cloud-library-client";
import { LEGACY_LIBRARY_KEY, LIBRARY_KEY, loadStoredLibrary, persistStoredLibrary } from "./library-storage";
import { loadVisualProjects } from "./visual-book-storage";
import { DEFAULT_VOICE_STORAGE_KEY } from "./voice-style";

/**
 * Which account this browser's offline library belongs to. A device that has
 * never had an owner hands its books to the first account that signs in; after
 * that, a different account starts from a clean device library so nobody's
 * books land in someone else's account.
 */
export const DEVICE_OWNER_KEY = "eb-studio-pro-library-owner";

export function deviceOwner() {
  try {
    return window.localStorage.getItem(DEVICE_OWNER_KEY);
  } catch {
    return null;
  }
}

export function setDeviceOwner(userId: string) {
  try {
    window.localStorage.setItem(DEVICE_OWNER_KEY, userId);
  } catch {
    // Storage blocked: the library still syncs, ownership just is not remembered.
  }
}

/** Uploads everything on this device to the signed-in account. Returns false if anything could not sync. */
export async function syncDeviceLibraryNow() {
  const [books, visuals] = await Promise.all([loadStoredLibrary(), loadVisualProjects()]);
  const [bookSync, visualSync] = await Promise.all([
    syncCloudProjects("manuscript", books),
    syncCloudProjects("visual", visuals),
  ]);
  return bookSync.state === "synced" && visualSync.state === "synced";
}

/** Removes this browser's offline copy of the library. The account copy is untouched. */
export async function clearDeviceLibrary() {
  await persistStoredLibrary([]).catch(() => undefined);
  try {
    window.localStorage.removeItem(LIBRARY_KEY);
    window.localStorage.removeItem(LEGACY_LIBRARY_KEY);
    window.localStorage.removeItem(DEFAULT_VOICE_STORAGE_KEY);
    window.localStorage.removeItem(DEVICE_OWNER_KEY);
  } catch {
    // Nothing more can be removed when storage is blocked.
  }
  await deleteDatabase("eb-studio-pro-visual-library");
}

function deleteDatabase(name: string) {
  return new Promise<void>((resolve) => {
    if (typeof indexedDB === "undefined") return resolve();
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}
