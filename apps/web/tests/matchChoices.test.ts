import { describe, expect, it } from "vitest";
import {
  capitalParamsForChoice,
  defaultChoiceValue,
  findChoiceOption,
  isValidChoice,
  MATCH_CHOICES,
} from "@quiz/shared/matchChoices";

describe("MATCH_CHOICES catalogue", () => {
  it("has at least one card with non-empty options", () => {
    expect(MATCH_CHOICES.length).toBeGreaterThan(0);
    for (const card of MATCH_CHOICES) {
      expect(card.options.length).toBeGreaterThan(1);
    }
  });

  it("default value of every card matches one of its options", () => {
    for (const card of MATCH_CHOICES) {
      expect(card.options.some((o) => o.value === card.defaultValue)).toBe(
        true,
      );
    }
  });

  it("option values within a card are unique", () => {
    for (const card of MATCH_CHOICES) {
      const values = card.options.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});

describe("isValidChoice", () => {
  it("accepts a known (key, value) pair", () => {
    expect(isValidChoice("capital_style", "standard")).toBe(true);
    expect(isValidChoice("capital_style", "risky")).toBe(true);
  });

  it("rejects unknown keys", () => {
    expect(isValidChoice("nope", "standard")).toBe(false);
  });

  it("rejects unknown values for a known key", () => {
    expect(isValidChoice("capital_style", "ultra")).toBe(false);
    expect(isValidChoice("capital_style", "")).toBe(false);
  });
});

describe("defaultChoiceValue", () => {
  it("returns the default value for a known key", () => {
    expect(defaultChoiceValue("capital_style")).toBe("standard");
  });

  it("returns null for an unknown key", () => {
    expect(defaultChoiceValue("nope")).toBeNull();
  });
});

describe("findChoiceOption", () => {
  it("returns the option object for a known (key, value)", () => {
    const opt = findChoiceOption("capital_style", "risky");
    expect(opt).not.toBeNull();
    expect(opt?.value).toBe("risky");
    expect(opt?.label).toMatch(/risky/i);
  });

  it("returns null for an unknown key or value", () => {
    expect(findChoiceOption("nope", "standard")).toBeNull();
    expect(findChoiceOption("capital_style", "ultra")).toBeNull();
  });
});

describe("capitalParamsForChoice", () => {
  it("standard → 3 HP / 1000 pts (current default)", () => {
    expect(capitalParamsForChoice("standard")).toEqual({
      armies: 3,
      points: 1000,
    });
  });

  it("risky → 2 HP / 1500 pts (higher reward, fewer HP)", () => {
    expect(capitalParamsForChoice("risky")).toEqual({
      armies: 2,
      points: 1500,
    });
  });

  it("equal stake invariant: HP × pts is the same for every option", () => {
    const stakes = MATCH_CHOICES.find((c) => c.key === "capital_style")
      ?.options.map((o) => {
        const params = capitalParamsForChoice(o.value);
        return params.armies * params.points;
      });
    expect(stakes).toBeDefined();
    // Both options share the same risk-adjusted total stake.
    expect(new Set(stakes)).toEqual(new Set([stakes![0]]));
  });

  it("falls back to standard params for null / undefined / unknown values", () => {
    expect(capitalParamsForChoice(null)).toEqual({ armies: 3, points: 1000 });
    expect(capitalParamsForChoice(undefined)).toEqual({
      armies: 3,
      points: 1000,
    });
    expect(capitalParamsForChoice("garbage")).toEqual({
      armies: 3,
      points: 1000,
    });
  });
});
