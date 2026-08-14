import assert from "node:assert/strict";
import test from "node:test";
import { mergeProjects } from "../app/cloud-library-client";

const base = {
  title: "The Last Passenger",
  author: "Sulong",
  createdAt: "2026-08-14T01:00:00.000Z",
};

test("cloud merge keeps the newest version of the same project", () => {
  const local = [{ ...base, id: "book-1", updatedAt: "2026-08-14T02:00:00.000Z", marker: "local" }];
  const cloud = [{ ...base, id: "book-1", updatedAt: "2026-08-14T03:00:00.000Z", marker: "cloud" }];
  const merged = mergeProjects(local, cloud);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].marker, "cloud");
});

test("cloud merge preserves projects that exist on only one device", () => {
  const local = [{ ...base, id: "local-book", updatedAt: "2026-08-14T02:00:00.000Z" }];
  const cloud = [{ ...base, id: "cloud-book", updatedAt: "2026-08-14T03:00:00.000Z" }];
  const merged = mergeProjects(local, cloud);
  assert.deepEqual(merged.map((project) => project.id), ["cloud-book", "local-book"]);
});
