import test from "node:test";
import assert from "node:assert/strict";
import {ValidationError,text,uuid,positive,percentage,oneOf,dateOnly,list} from "../app/lib/validation.mjs";

test("validation accepts valid primitives",()=>{
  assert.equal(text("  Burger  ",{required:true,field:"name"}),"Burger");
  assert.equal(uuid("550e8400-e29b-41d4-a716-446655440000"),"550e8400-e29b-41d4-a716-446655440000");
  assert.equal(positive("2.5"),2.5);
  assert.equal(percentage("35"),35);
  assert.equal(oneOf("delivery",["delivery","takeaway"]),"delivery");
  assert.equal(dateOnly("2026-09-20"),"2026-09-20");
  assert.equal(list([1,2]).length,2);
});
test("validation rejects dangerous or malformed inputs",()=>{
  assert.throws(()=>uuid("not-an-id"),ValidationError);
  assert.throws(()=>positive("-1"),ValidationError);
  assert.throws(()=>percentage("101"),ValidationError);
  assert.throws(()=>oneOf("other",["delivery","takeaway"]),ValidationError);
  assert.throws(()=>dateOnly("20/09/2026"),ValidationError);
});
