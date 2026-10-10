// Acceptance (moritzbrantner/nlp-stack-wasm#1): @moritzbrantner/nlp-stack-wasm/text-core-wasm
// behaves like packages/text-core-wasm at the pinned nlp-stack commit. The expectations are those
// of that package's own tests (index.test.js, tests/package.test.ts) at
// 1ea22b3dd802e79444ab355968066390f21cfcd8.
import { beforeAll, expect, test } from "bun:test";

import { loadEntry } from "./support/entry";

let core: Record<string, any>;

beforeAll(async () => {
  core = await loadEntry("./text-core-wasm");
  await core.init();
});

test("the default export is init, as upstream", () => {
  expect(core.default).toBe(core.init);
});

test("packageSurface describes the text-core operations", () => {
  const surface = core.packageSurface();
  expect(surface.library).toBe("moenarch-text-core");
  const ids = surface.operations.map((operation: { id: string }) => operation.id);
  for (const id of ["text.tokenize", "text.boundaries", "text.normalize", "text.statistics"]) {
    expect(ids).toContain(id);
  }
});

test("runOperation tokenizes text with structured output", () => {
  const response = core.runOperation({
    operation: "text.tokenize",
    input: { text: "Rust text crates.", includePunctuation: false },
  });
  expect(response.operation).toBe("text.tokenize");
  expect(response.value.operation).toBe("text.tokenize");
  expect(typeof response.value.title).toBe("string");
  expect(typeof response.value.message).toBe("string");
  expect(response.value.summary.status).toBe("ok");
  expect(response.value.result.tokens.length).toBeGreaterThan(0);
});

test("word and sentence boundaries", () => {
  expect(core.extractWordTexts("Rust tests, shipped.")).toEqual(["Rust", "tests", "shipped"]);
  expect(core.splitSentences("First sentence. Second sentence.")).toEqual([
    "First sentence.",
    "Second sentence.",
  ]);
  const document = core.segmentTextDocument("Hello from wasm.", true, false, true);
  expect(document.sentences[0].text).toBe("Hello from wasm.");
  expect(document.tokens.map((token: { text: string }) => token.text)).toEqual([
    "Hello",
    "from",
    "wasm",
  ]);
});

test("analyzeTextDocument reports stats, scripts and normalized tokens", () => {
  const document = core.analyzeTextDocument("Hello 東京!\n\nCafé time.", {
    includePunctuation: true,
  });
  expect(document.stats.paragraphs).toBe(2);
  expect(document.stats.sentences).toBe(2);
  expect(document.stats.tokens).toBeGreaterThan(0);
  expect(document.stats.uniqueTokens).toBeGreaterThan(0);
  expect(document.scriptProfile.scripts.Latin).toBe(13);
  expect(document.scriptProfile.scripts.Han).toBe(2);
  expect(document.scriptProfile.isMixed).toBe(true);
  expect(document.tokens[0]).toMatchObject({
    start: 0,
    end: 5,
    text: "Hello",
    normalized: "hello",
    kind: "word",
  });
});

test("analyzeTextDocument honors punctuation and token output options", () => {
  const texts = (document: { tokens: Array<{ text: string }> }) =>
    document.tokens.map((token) => token.text);
  expect(texts(core.analyzeTextDocument("Hello, world.", { includePunctuation: true }))).toEqual([
    "Hello",
    ",",
    "world",
    ".",
  ]);
  expect(texts(core.analyzeTextDocument("Hello, world.", { includePunctuation: false }))).toEqual([
    "Hello",
    "world",
  ]);
  const withoutTokens = core.analyzeTextDocument("Hello, world.", {
    includePunctuation: true,
    includeTokens: false,
  });
  expect(withoutTokens.tokens).toEqual([]);
  expect(withoutTokens.stats.tokens).toBe(4);
});

test("analyzeTextDocument reports UTF-16 offsets for browser selections", () => {
  const document = core.analyzeTextDocument("A😀B.\n\nCafé time.", {
    includePunctuation: true,
  });
  expect(document.paragraphs[0]).toMatchObject({ start: 0, end: 5, text: "A😀B." });
  expect(document.paragraphs[1]).toMatchObject({ start: 7, end: 18, text: "Café time." });
  expect(document.tokens[1]).toMatchObject({ start: 1, end: 3, text: "😀", kind: "other" });
  expect(document.tokens[5]).toMatchObject({ start: 11, end: 12, text: "́", kind: "other" });
});
