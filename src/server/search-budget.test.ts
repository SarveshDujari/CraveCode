import assert from "node:assert/strict";
import test from "node:test";
import { getDemoSession, reserveSerpApiCall, SearchBudgetError, takeDemoSearch } from "./search-budget.ts";

test("a browser session gets exactly five demo search attempts", async () => {
  const session = await getDemoSession(undefined);
  assert.equal(session.remaining, 5);
  for (let remaining = 4; remaining >= 0; remaining--) {
    assert.equal(await takeDemoSearch(session.id), remaining);
  }
  await assert.rejects(() => takeDemoSearch(session.id), SearchBudgetError);
  assert.equal((await getDemoSession(session.id)).remaining, 0);
});

test("the SerpApi request budget stops the sixth uncached request", async () => {
  for (let attempt = 0; attempt < 5; attempt++) await reserveSerpApiCall();
  await assert.rejects(() => reserveSerpApiCall(), SearchBudgetError);
});
