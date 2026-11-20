import { test } from "node:test";
import assert from "node:assert/strict";
import { describeFile, newDeck, peekNext, pickNext, syncDeck, type Media } from "./media.ts";

const m = (id: string): Media => ({ id, path: `${id}.jpg`, type: "image", author: null, created_at: id });
const ids = (deck: ReturnType<typeof newDeck>, n: number) =>
  Array.from({ length: n }, () => {
    const p = pickNext(deck);
    return p ? `${p.item.id}${p.isNew ? "*" : ""}` : null;
  });

test("describeFile", () => {
  assert.deepEqual(describeFile("IMG_1.MOV", "video/quicktime"), { ext: "mov", contentType: "video/quicktime", kind: "video" });
  assert.deepEqual(describeFile("photo.jpg", ""), { ext: "jpg", contentType: "image/jpeg", kind: "image" });
  assert.deepEqual(describeFile("blob", "image/jpeg"), { ext: "jpg", contentType: "image/jpeg", kind: "image" });
  assert.equal(describeFile("notes.pdf", "application/pdf").kind, null);
  assert.equal(describeFile("weird.ext!!", "video/mp4").ext, "mp4");
});

test("cycles in upload order, empty deck gives null", () => {
  const deck = newDeck();
  assert.equal(pickNext(deck), null);
  syncDeck(deck, [m("a"), m("b"), m("c")], false);
  assert.deepEqual(ids(deck, 4), ["a", "b", "c", "a"]);
});

test("new arrivals jump the queue once, then rejoin the cycle", () => {
  const deck = newDeck();
  syncDeck(deck, [m("a"), m("b")], false);
  pickNext(deck); // a
  assert.equal(syncDeck(deck, [m("a"), m("b"), m("c"), m("d")], true), 2);
  assert.equal(peekNext(deck)?.item.id, "c");
  assert.deepEqual(ids(deck, 5), ["c*", "d*", "b", "c", "d"]);
});

test("hidden media disappear, even if still queued as new", () => {
  const deck = newDeck();
  syncDeck(deck, [m("a")], false);
  syncDeck(deck, [m("a"), m("x")], true);
  syncDeck(deck, [m("a")], true); // admin hid x before it was shown
  assert.deepEqual(ids(deck, 2), ["a", "a"]);
});
