import assert from "node:assert/strict";

function countWorkingDays(from, to) {
  const current = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  let count = 0;
  while (current <= end) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}

assert.equal(countWorkingDays("2026-07-06", "2026-07-19"), 10);
assert.equal(countWorkingDays("2026-07-11", "2026-07-12"), 0);
assert.equal(countWorkingDays("2026-07-13", "2026-07-13"), 1);

console.log("Vacation working-day examples passed");
