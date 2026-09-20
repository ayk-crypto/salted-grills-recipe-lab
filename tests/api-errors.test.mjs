import test from "node:test";
import assert from "node:assert/strict";
import {AppError,errorResponse} from "../app/lib/api-errors.mjs";
import {ValidationError} from "../app/lib/validation.mjs";

const NextResponse={json:(body,init={})=>({body,status:init.status||200,headers:init.headers||{}})};

test("validation errors are safe and specific",()=>{
 const r=errorResponse(new ValidationError("Selling price is required","selling_price"),NextResponse,{requestId:"r1",fallback:"Failed"});
 assert.equal(r.status,400);assert.equal(r.body.error,"Selling price is required");assert.equal(r.body.field,"selling_price");assert.equal(r.body.request_id,"r1");
});
test("explicit client errors are exposed",()=>{
 const r=errorResponse(new AppError("Not found",{status:404,code:"NOT_FOUND"}),NextResponse,{requestId:"r2",fallback:"Failed"});
 assert.equal(r.status,404);assert.equal(r.body.error,"Not found");assert.equal(r.body.code,"NOT_FOUND");
});
test("server errors hide internals",()=>{
 const old=console.error;console.error=()=>{};
 try{
  const r=errorResponse(new Error("postgres password leaked"),NextResponse,{requestId:"r3",fallback:"Could not load data"});
  assert.equal(r.status,500);assert.equal(r.body.error,"Could not load data");assert.equal(r.body.request_id,"r3");
 }finally{console.error=old}
});
