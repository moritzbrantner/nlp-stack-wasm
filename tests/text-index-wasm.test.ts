// Acceptance (moritzbrantner/nlp-stack-wasm#1): @moritzbrantner/nlp-stack-wasm/text-index-wasm
// builds and searches a small in-memory index like packages/text-index-wasm at the pinned
// nlp-stack commit. Search expectations are those of packages/text-index-wasm/tests/package.test.ts
// at 1ea22b3dd802e79444ab355968066390f21cfcd8.
import { beforeAll, expect, test } from "bun:test";

import { loadEntry } from "./support/entry";

let index: Record<string, any>;

beforeAll(async () => {
  index = await loadEntry("./text-index-wasm");
  await index.init();
});

function structuredResult(response: any, operation: string) {
  expect(response.operation).toBe(operation);
  expect(response.value.operation).toBe(operation);
  expect(typeof response.value.title).toBe("string");
  expect(typeof response.value.message).toBe("string");
  expect(response.value.summary.status).toBe("ok");
  expect(response.value.result).toBeDefined();
  return response.value.result;
}

const documents = [
  { id: "doc-1", body: "rust text index search" },
  { id: "doc-2", body: "cooking pasta with tomatoes" },
];

test("packageSurface describes the text-index operations", async () => {
  const surface = await index.packageSurface();
  expect(surface.library).toBe("moenarch-text-index");
  const ids = surface.operations.map((operation: { id: string }) => operation.id);
  for (const id of ["index.build", "index.search", "index.inspect", "index.addDocuments"]) {
    expect(ids).toContain(id);
  }
});

test("every surface operation answers its own exampleRequest", async () => {
  const surface = await index.packageSurface();
  for (const operation of surface.operations) {
    const response = await index.runOperation({
      operation: operation.id,
      input: operation.exampleRequest,
    });
    expect(response.operation, operation.id).toBe(operation.id);
  }
});

test("index.build indexes the provided documents", async () => {
  const result = structuredResult(
    await index.runOperation({ operation: "index.build", input: { backend: "memory", documents } }),
    "index.build",
  );
  expect(result.report.documentsReceived).toBe(2);
  expect(result.inspect.documentCount).toBe(2);
  expect(result.inspect.chunkCount).toBeGreaterThan(0);
});

test("index.search ranks the matching document first", async () => {
  const result = structuredResult(
    await index.runOperation({
      operation: "index.search",
      input: { documents, query: { text: "pasta", topK: 2 } },
    }),
    "index.search",
  );
  expect(result.results.length).toBeGreaterThan(0);
  expect(result.results[0].documentId).toBe("doc-2");
  expect(result.results[0].chunk.text).toBe("cooking pasta with tomatoes");
});

test("index.search enforces required phrases and returns matched phrases", async () => {
  const result = structuredResult(
    await index.runOperation({
      operation: "index.search",
      input: {
        documents: [
          { id: "doc-1", body: "climate policy needs public funding" },
          { id: "doc-2", body: "climate policy uses private finance" },
        ],
        query: { text: "climate policy public funding", topK: 2, requiredPhrases: ["public funding"] },
      },
    }),
    "index.search",
  );
  expect(result.results).toHaveLength(1);
  expect(result.results[0].documentId).toBe("doc-1");
  expect(result.results[0].matchedPhrases).toEqual(["public funding"]);
});
