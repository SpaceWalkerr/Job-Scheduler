import assert from "node:assert";
import { nextRetryDelayMs } from "../retry.js";

// fixed: same delay regardless of attempt
assert.equal(nextRetryDelayMs("fixed", 1000, 1), 1000);
assert.equal(nextRetryDelayMs("fixed", 1000, 4), 1000);

// linear: base * attempt
assert.equal(nextRetryDelayMs("linear", 1000, 1), 1000);
assert.equal(nextRetryDelayMs("linear", 1000, 3), 3000);

// exponential: base * 2^(attempt-1)
assert.equal(nextRetryDelayMs("exponential", 1000, 1), 1000);
assert.equal(nextRetryDelayMs("exponential", 1000, 2), 2000);
assert.equal(nextRetryDelayMs("exponential", 1000, 4), 8000);

console.log("PASS: retry backoff math");
