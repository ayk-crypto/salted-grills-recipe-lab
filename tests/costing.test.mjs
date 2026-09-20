import test from "node:test";
import assert from "node:assert/strict";
import {packagingEachCost,overheadRate,contribution} from "../app/lib/costing.mjs";

test("packet packaging yield converts packet cost to each",()=>{
  assert.deepEqual(packagingEachCost(1050,"packet",50),{unitCost:21,status:"ready"});
});
test("carton or packet cost without yield is incomplete",()=>{
  assert.deepEqual(packagingEachCost(325,"packet",null),{unitCost:null,status:"needs_yield"});
  assert.deepEqual(packagingEachCost(2400,"carton",0),{unitCost:null,status:"needs_yield"});
});
test("piece storage cost does not require yield",()=>{
  assert.deepEqual(packagingEachCost(12.5,"piece",null),{unitCost:12.5,status:"ready"});
});
test("overhead percentage uses monthly overhead divided by sales",()=>{
  assert.equal(overheadRate([{amount:500000},{amount:300000}],4000000),0.2);
});
test("contribution combines food packaging channel and overhead",()=>{
  const r=contribution({sellingPrice:1000,foodCost:300,packagingCost:50,channelCost:100,overheadPct:20});
  assert.equal(r.totalCost,650);assert.equal(r.contribution,350);
});
