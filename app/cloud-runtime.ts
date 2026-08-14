export type CloudProjectKind = "manuscript" | "visual";

export type D1StatementLike = {
  bind(...values: unknown[]): D1StatementLike;
  all<T>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
};

export type D1DatabaseLike = {
  prepare(query: string): D1StatementLike;
};

export type R2ObjectLike = {
  text(): Promise<string>;
};

export type R2BucketLike = {
  get(key: string): Promise<R2ObjectLike | null>;
  put(
    key: string,
    value: string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
};

export type CloudBindings = {
  DB?: D1DatabaseLike;
  BUCKET?: R2BucketLike;
};

const bindingKey = Symbol.for("eb-studio-pro.cloud-bindings");
type CloudGlobal = typeof globalThis & { [bindingKey]?: CloudBindings };

export function setCloudBindings(bindings: CloudBindings) {
  (globalThis as CloudGlobal)[bindingKey] = bindings;
}

export function getCloudBindings(): CloudBindings {
  return (globalThis as CloudGlobal)[bindingKey] ?? {};
}
