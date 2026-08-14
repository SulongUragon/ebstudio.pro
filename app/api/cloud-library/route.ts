import { getChatGPTUser } from "../../chatgpt-auth";
import {
  getCloudBindings,
  type CloudProjectKind,
} from "../../cloud-runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_PROJECT_BYTES = 45 * 1024 * 1024;

type CloudProjectRow = {
  project_id: string;
  kind: CloudProjectKind;
  title: string;
  author: string;
  created_at: string;
  updated_at: string;
  object_key: string;
};

type CloudProjectPayload = {
  kind?: CloudProjectKind;
  project?: Record<string, unknown>;
  id?: string;
};

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const bindings = getCloudBindings();
  if (!bindings.DB || !bindings.BUCKET) return unavailable();

  const kind = new URL(request.url).searchParams.get("kind");
  if (!isProjectKind(kind)) {
    return Response.json({ error: "Choose a valid cloud library type." }, { status: 400 });
  }

  const rows = await bindings.DB.prepare(
    `SELECT project_id, kind, title, author, created_at, updated_at, object_key
     FROM cloud_projects
     WHERE owner_email = ? AND kind = ?
     ORDER BY updated_at DESC`,
  ).bind(user.email, kind).all<CloudProjectRow>();

  const projects = (
    await Promise.all(
      (rows.results ?? []).map(async (row) => {
        const object = await bindings.BUCKET?.get(row.object_key);
        if (!object) return null;
        try {
          return JSON.parse(await object.text()) as Record<string, unknown>;
        } catch {
          return null;
        }
      }),
    )
  ).filter((project): project is Record<string, unknown> => Boolean(project));

  return Response.json({ projects });
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const bindings = getCloudBindings();
  if (!bindings.DB || !bindings.BUCKET) return unavailable();

  const payload = (await request.json().catch(() => ({}))) as CloudProjectPayload;
  const kind = payload.kind;
  const project = payload.project;
  const id = cleanId(project?.id);
  if (!isProjectKind(kind) || !project || !id) {
    return Response.json({ error: "The cloud project payload is incomplete." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const createdAt = cleanDate(project.createdAt) ?? now;
  const updatedAt = cleanDate(project.updatedAt) ?? now;
  const title = cleanText(project.title) || "Untitled Project";
  const author = cleanText(project.author) || "Unknown Author";
  const content = JSON.stringify({ ...project, id, createdAt, updatedAt });
  if (new TextEncoder().encode(content).byteLength > MAX_PROJECT_BYTES) {
    return Response.json(
      { error: "This project is too large to sync. Download a backup before removing any local copy." },
      { status: 413 },
    );
  }

  const ownerKey = await digest(user.email.toLocaleLowerCase());
  const objectKey = `users/${ownerKey}/${kind}/${id}.json`;
  await bindings.BUCKET.put(objectKey, content, {
    httpMetadata: { contentType: "application/json" },
  });
  await bindings.DB.prepare(
    `INSERT INTO cloud_projects
      (owner_email, project_id, kind, title, author, created_at, updated_at, object_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_email, kind, project_id) DO UPDATE SET
       title = excluded.title,
       author = excluded.author,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       object_key = excluded.object_key`,
  ).bind(
    user.email,
    id,
    kind,
    title,
    author,
    createdAt,
    updatedAt,
    objectKey,
  ).run();

  return Response.json({ saved: true, id, updatedAt });
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return unauthorized();
  const bindings = getCloudBindings();
  if (!bindings.DB || !bindings.BUCKET) return unavailable();

  const payload = (await request.json().catch(() => ({}))) as CloudProjectPayload;
  const kind = payload.kind;
  const id = cleanId(payload.id);
  if (!isProjectKind(kind) || !id) {
    return Response.json({ error: "Choose a valid cloud project to remove." }, { status: 400 });
  }

  const row = await bindings.DB.prepare(
    `SELECT project_id, kind, title, author, created_at, updated_at, object_key
     FROM cloud_projects
     WHERE owner_email = ? AND kind = ? AND project_id = ?`,
  ).bind(user.email, kind, id).all<CloudProjectRow>();
  const project = row.results?.[0];
  if (project) await bindings.BUCKET.delete(project.object_key);
  await bindings.DB.prepare(
    "DELETE FROM cloud_projects WHERE owner_email = ? AND kind = ? AND project_id = ?",
  ).bind(user.email, kind, id).run();

  return Response.json({ deleted: true, id });
}

function unauthorized() {
  return Response.json(
    { error: "Sign in with ChatGPT to sync this library across devices." },
    { status: 401 },
  );
}

function unavailable() {
  return Response.json(
    { error: "Cloud sync is unavailable on this deployment. Your local library is still safe." },
    { status: 503 },
  );
}

function isProjectKind(value: unknown): value is CloudProjectKind {
  return value === "manuscript" || value === "visual";
}

function cleanId(value: unknown) {
  const id = String(value ?? "").trim();
  return /^[a-zA-Z0-9_-]{1,120}$/.test(id) ? id : "";
}

function cleanText(value: unknown) {
  return String(value ?? "").trim().slice(0, 500);
}

function cleanDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
