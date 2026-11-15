import type { SupabaseClient } from "@supabase/supabase-js";
import type { CloudProjectKind } from "./cloud-runtime";
import { browserSupabase } from "./supabase-browser";

export type SyncState = "syncing" | "synced" | "local-only";
export type SyncableProject = {
  id: string;
  title: string;
  author: string;
  createdAt: string;
  updatedAt?: string;
};

export type CloudRow = { project_id: string; updated_at: string };

/** What the library sync needs from cloud storage. The browser uses Supabase; tests use a fake. */
export type CloudStore = {
  list(kind: CloudProjectKind): Promise<CloudRow[]>;
  download<T>(kind: CloudProjectKind, id: string): Promise<T | null>;
  save(kind: CloudProjectKind, project: SyncableProject): Promise<void>;
  remove(kind: CloudProjectKind, id: string): Promise<void>;
};

const BUCKET = "projects";
const MAX_PROJECT_BYTES = 45 * 1024 * 1024;

/**
 * Merges this device's library with the signed-in account's library. Nothing
 * is ever deleted here: books only on this device are uploaded, books only in
 * the account are downloaded, and the newer copy wins when both exist.
 */
export async function syncCloudProjects<T extends SyncableProject>(
  kind: CloudProjectKind,
  localProjects: T[],
  store?: CloudStore | null,
): Promise<{ projects: T[]; state: SyncState }> {
  try {
    const cloud = store === undefined ? await accountStore() : store;
    if (!cloud) return { projects: localProjects, state: "local-only" };

    const rows = await cloud.list(kind);
    const localById = new Map(localProjects.map((project) => [project.id, project]));
    // Download only what is missing here or newer in the account.
    const fetched: Array<T | null> = await Promise.all(
      rows
        .filter((row) => {
          const local = localById.get(row.project_id);
          return !local || timestampOf(row.updated_at) > projectTimestamp(local);
        })
        .map((row) => cloud.download<T>(kind, row.project_id)),
    );
    const downloaded = fetched.filter((project): project is T => Boolean(project?.id));

    const merged = mergeProjects<T>(localProjects, downloaded);
    const cloudTimes = new Map(rows.map((row) => [row.project_id, timestampOf(row.updated_at)]));
    await Promise.all(
      merged
        .filter((project) => {
          const cloudTime = cloudTimes.get(project.id);
          return cloudTime === undefined || projectTimestamp(project) > cloudTime;
        })
        .map((project) => cloud.save(kind, project)),
    );
    return { projects: merged, state: "synced" };
  } catch {
    return { projects: localProjects, state: "local-only" };
  }
}

export async function saveCloudProject(kind: CloudProjectKind, project: SyncableProject, store?: CloudStore | null) {
  const cloud = store === undefined ? await accountStore() : store;
  if (!cloud) throw new Error("Sign in to sync this library across devices.");
  await cloud.save(kind, project);
}

export async function deleteCloudProject(kind: CloudProjectKind, id: string, store?: CloudStore | null) {
  const cloud = store === undefined ? await accountStore() : store;
  if (!cloud) throw new Error("Sign in to sync this library across devices.");
  await cloud.remove(kind, id);
}

export function mergeProjects<T extends SyncableProject>(local: T[], cloud: T[]) {
  const merged = new Map<string, T>();
  for (const project of [...cloud, ...local]) {
    const current = merged.get(project.id);
    if (!current || projectTimestamp(project) >= projectTimestamp(current)) {
      merged.set(project.id, project);
    }
  }
  return [...merged.values()].sort(
    (a, b) => projectTimestamp(b) - projectTimestamp(a),
  );
}

export function cleanProjectId(value: unknown) {
  const id = String(value ?? "").trim();
  return /^[a-zA-Z0-9_-]{1,120}$/.test(id) ? id : "";
}

export function projectObjectPath(userId: string, kind: CloudProjectKind, id: string) {
  return `${userId}/${kind}/${id}.json`;
}

/** The signed-in account's library on Supabase, or null when nobody is signed in. */
async function accountStore(): Promise<CloudStore | null> {
  if (typeof window === "undefined") return null;
  const supabase = await browserSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  return userId ? supabaseStore(supabase, userId) : null;
}

export function supabaseStore(supabase: SupabaseClient, userId: string): CloudStore {
  return {
    async list(kind) {
      const { data, error } = await supabase
        .from("projects")
        .select("project_id, updated_at")
        .eq("kind", kind)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as CloudRow[];
    },
    async download<T>(kind: CloudProjectKind, id: string) {
      const { data, error } = await supabase.storage.from(BUCKET).download(projectObjectPath(userId, kind, id));
      if (error || !data) return null;
      try {
        return JSON.parse(await data.text()) as T;
      } catch {
        return null;
      }
    },
    async save(kind, project) {
      const id = cleanProjectId(project.id);
      if (!id) throw new Error("This project has an invalid id and cannot sync.");
      const now = new Date().toISOString();
      const createdAt = isoOr(project.createdAt, now);
      const updatedAt = isoOr(project.updatedAt, createdAt);
      const content = JSON.stringify({ ...project, id, createdAt, updatedAt });
      if (new TextEncoder().encode(content).byteLength > MAX_PROJECT_BYTES) {
        throw new Error("This project is too large to sync. It is still saved on this device.");
      }
      const path = projectObjectPath(userId, kind, id);
      const upload = await supabase.storage
        .from(BUCKET)
        .upload(path, new Blob([content], { type: "application/json" }), { upsert: true, contentType: "application/json" });
      if (upload.error) throw new Error(upload.error.message);
      const { error } = await supabase.from("projects").upsert(
        {
          owner_id: userId,
          kind,
          project_id: id,
          title: String(project.title ?? "").trim().slice(0, 500) || "Untitled Project",
          author: String(project.author ?? "").trim().slice(0, 500) || "Unknown Author",
          created_at: createdAt,
          updated_at: updatedAt,
          object_path: path,
        },
        { onConflict: "owner_id,kind,project_id" },
      );
      if (error) throw new Error(error.message);
    },
    async remove(kind, id) {
      const clean = cleanProjectId(id);
      if (!clean) return;
      await supabase.storage.from(BUCKET).remove([projectObjectPath(userId, kind, clean)]);
      const { error } = await supabase.from("projects").delete().eq("kind", kind).eq("project_id", clean);
      if (error) throw new Error(error.message);
    },
  };
}

function isoOr(value: unknown, fallback: string) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function timestampOf(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function projectTimestamp(project: SyncableProject) {
  return timestampOf(project.updatedAt || project.createdAt);
}
