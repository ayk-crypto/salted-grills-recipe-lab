import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("purchase-price filter uses new 7-column layout",()=>{
  const c=fs.readFileSync(new URL("../app/SearchFilters.js",import.meta.url),"utf8");
  assert.match(c,/const sourceCost=text\(row,4\),plateCost=text\(row,5\)/);
  assert.match(c,/facets\.add\(text\(row,6\)/);
  assert.match(c,/visible=text\(row,6\)===facet/);
  assert.match(c,/total_.*text\(row,4\)/s);
  assert.match(c,/unit_.*text\(row,5\)/s);
});
