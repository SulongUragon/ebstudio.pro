import type { CloudProjectKind } from "./cloud-runtime";

export type SyncState = "syncing" | "synced" | "local-only";
export type SyncableProject = {
  id: string;
  title: string;
  author: string;
  createdAt: string;
  updatedAt?: string;
};

export async function syncCloudProjects<T extends SyncableProject>(
  kind: CloudProjectKind,
  localProjects: T[],
): Promise<{ projects: T[]; state: SyncState }> {
  try {
    const response = await fetch(`/api/cloud-library?kind=${kind}`, { cache: "no-store" });
    if (!response.ok) return { projects: localProjects, state: "local-only" };
    const data = (await response.json()) as { projects?: T[] };
    const cloudProjects = Array.isArray(data.projects) ? data.projects : [];
    const merged = mergeProjects(localProjects, cloudProjects);
    const cloudById = new Map(cloudProjects.map((project) => [project.id, project]));
    await Promise.all(
      merged
        .filter((project) => {
          const cloud = cloudById.get(project.id);
          return !cloud || projectTimestamp(project) > projectTimestamp(cloud);
        })
        .map((project) => saveCloudProject(kind, project)),
    );
    return { projects: merged, state: "synced" };
  } catch {
    return { projects: localProjects, state: "local-only" };
  }
}

export async function saveCloudProject(
  kind: CloudProjectKind,
  project: SyncableProject,
) {
  const response = await fetch("/api/cloud-library", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, project }),
  });
  if (!response.ok) throw new Error(await responseError(response));
}

export async function deleteCloudProject(kind: CloudProjectKind, id: string) {
  const response = await fetch("/api/cloud-library", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, id }),
  });
  if (!response.ok) throw new Error(await responseError(response));
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

function projectTimestamp(project: SyncableProject) {
  const value = project.updatedAt || project.createdAt;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function responseError(response: Response) {
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return data.error || "Cloud sync could not complete. Your local project is safe.";
}
