// Verifies the permutation helpers underpin MatchRoom.pickWarQuestionGroup:
// every shuffle is applied once, then the SAME permutation is replayed
// across every language's options. A bug here would either leak the
// canonical correct-index position or scramble option meaning between
// languages.

import { describe, expect, it } from "vitest";
import { applyPermutation, shuffledPermutation } from "@quiz/shared/gameLogic";

describe("shuffledPermutation", () => {
  it("returns an array of the requested length", () => {
    for (let n = 1; n <= 8; n++) {
      const perm = shuffledPermutation(n);
      expect(perm).toHaveLength(n);
    }
  });
  it("returns a permutation of [0, n)", () => {
    for (let n = 1; n <= 8; n++) {
      const perm = shuffledPermutation(n);
      const sorted = [...perm].sort((a, b) => a - b);
      for (let i = 0; i < n; i++) expect(sorted[i]).toBe(i);
    }
  });
  it("eventually produces non-identity permutations for n >= 2", () => {
    // 50 tries should be more than enough; if every shuffle is identity
    // we've broken the algorithm.
    let sawNonIdentity = false;
    for (let i = 0; i < 50; i++) {
      const perm = shuffledPermutation(4);
      if (perm.some((v, idx) => v !== idx)) {
        sawNonIdentity = true;
        break;
      }
    }
    expect(sawNonIdentity).toBe(true);
  });
});

describe("applyPermutation", () => {
  it("reorders items by index", () => {
    expect(applyPermutation(["a", "b", "c", "d"], [2, 0, 3, 1])).toEqual([
      "c",
      "a",
      "d",
      "b",
    ]);
  });
  it("keeps option meaning aligned across languages — same perm to both", () => {
    const en = ["Paris", "London", "Berlin", "Madrid"];
    const ru = ["Париж", "Лондон", "Берлин", "Мадрид"];
    const perm = [3, 0, 2, 1];
    const enShuffled = applyPermutation(en, perm);
    const ruShuffled = applyPermutation(ru, perm);
    // Position i in both languages refers to the SAME logical city.
    for (let i = 0; i < en.length; i++) {
      const enCity = enShuffled[i];
      const ruCity = ruShuffled[i];
      const originalIndex = en.indexOf(enCity);
      expect(ru[originalIndex]).toBe(ruCity);
    }
  });
  it("perm.indexOf(canonicalCorrect) yields the post-shuffle correctIndex", () => {
    // Replicates MatchRoom.pickWarQuestionGroup's correctness check.
    const canonical = 0; // first option is the right one
    const perm = [3, 0, 2, 1];
    const newCorrectIndex = perm.indexOf(canonical);
    const options = ["Paris", "London", "Berlin", "Madrid"];
    const shuffled = applyPermutation(options, perm);
    expect(shuffled[newCorrectIndex]).toBe(options[canonical]);
  });
});
