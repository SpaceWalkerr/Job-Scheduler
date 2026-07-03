import { describe, it, expect } from "vitest";
import { nextRetryDelayMs } from "../src/retry.js";

describe("retry backoff strategies", () => {
  it("fixed delay is constant across attempts", () => {
    expect(nextRetryDelayMs("fixed", 1000, 1)).toBe(1000);
    expect(nextRetryDelayMs("fixed", 1000, 5)).toBe(1000);
  });

  it("linear delay grows with attempt number", () => {
    expect(nextRetryDelayMs("linear", 1000, 1)).toBe(1000);
    expect(nextRetryDelayMs("linear", 1000, 3)).toBe(3000);
  });

  it("exponential delay doubles each attempt", () => {
    expect(nextRetryDelayMs("exponential", 1000, 1)).toBe(1000);
    expect(nextRetryDelayMs("exponential", 1000, 2)).toBe(2000);
    expect(nextRetryDelayMs("exponential", 1000, 4)).toBe(8000);
  });
});
