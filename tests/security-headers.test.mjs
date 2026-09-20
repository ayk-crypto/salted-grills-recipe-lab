import test from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../next.config.mjs";

test("security headers cover every route",async()=>{
  const rules=await nextConfig.headers();
  assert.equal(rules.length,1);
  assert.equal(rules[0].source,"/(.*)");
  const headers=new Map(rules[0].headers.map(h=>[h.key,h.value]));
  for(const key of ["Content-Security-Policy","Referrer-Policy","X-Content-Type-Options","X-Frame-Options","Permissions-Policy","Cross-Origin-Opener-Policy","Cross-Origin-Resource-Policy"]){
    assert.ok(headers.has(key),`missing ${key}`);
  }
  const csp=headers.get("Content-Security-Policy");
  for(const directive of ["default-src 'self'","object-src 'none'","frame-ancestors 'none'","form-action 'self'","script-src 'self' 'unsafe-inline'","connect-src 'self' https://*.neon.tech"]){
    assert.ok(csp.includes(directive),`missing CSP directive: ${directive}`);
  }
  assert.equal(headers.get("X-Content-Type-Options"),"nosniff");
  assert.equal(headers.get("X-Frame-Options"),"DENY");
});
