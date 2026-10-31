import assert from "node:assert/strict";
import { test } from "node:test";
import { Hit } from "./store";
import { fuse } from "./rank";

function hit(documentId: number, position: number, score: number): Hit {
  return {
    documentId,
    position,
    text: `text-${documentId}-${position}`,
    score,
  };
}

test("a document only in the vector list stays in the result with matched meaning", () => {
  const vector = [hit(1, 0, 0.9)];
  const text: Hit[] = [];

  const result = fuse(vector, text);

  assert.equal(result.length, 1);
  assert.equal(result[0].documentId, 1);
  assert.equal(result[0].matched, "meaning");
  assert.equal(result[0].bestSimilarity, 0.9);
  assert.equal(result[0].passage, "text-1-0");
});

test("a document in both lists is first", () => {
  const vector = [hit(2, 0, 0.5), hit(1, 1, 0.9)];
  const text = [hit(1, 2, 1.2)];

  const result = fuse(vector, text);

  assert.equal(result[0].documentId, 1);
  assert.equal(result[0].matched, "both");
});

test("k changes the scores as 1/(k+rank)", () => {
  const vector = [hit(1, 0, 0.9)];
  const text: Hit[] = [];

  const defaultK = fuse(vector, text);
  const customK = fuse(vector, text, 10);

  assert.equal(defaultK[0].score, 1 / (60 + 1));
  assert.equal(customK[0].score, 1 / (10 + 1));
});

test("the passage of a fused document is the vector hit's text when there is one", () => {
  const vector = [hit(1, 0, 0.9)];
  const text = [hit(1, 1, 1.0)];

  const result = fuse(vector, text);

  assert.equal(result[0].passage, "text-1-0");
});

test("a document only in the text list uses the text hit's passage and matched words", () => {
  const vector: Hit[] = [];
  const text = [hit(3, 0, 1.0)];

  const result = fuse(vector, text);

  assert.equal(result[0].documentId, 3);
  assert.equal(result[0].matched, "words");
  assert.equal(result[0].bestSimilarity, null);
  assert.equal(result[0].passage, "text-3-0");
});
