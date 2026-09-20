import {NEON_AUTH_BASE_URL} from "../../../auth-config";

async function proxy(req,{params}){
  const p=await params;
  const path=(p.path||[]).join("/");
  const target=new URL(NEON_AUTH_BASE_URL+"/"+path);
  target.search=req.nextUrl.search;
  const headers=new Headers();
  for(const name of ["content-type","cookie","user-agent","accept","origin","referer"]){
    const value=req.headers.get(name);if(value)headers.set(name,value);
  }
  const init={method:req.method,headers,redirect:"manual"};
  if(!["GET","HEAD"].includes(req.method))init.body=await req.arrayBuffer();
  const upstream=await fetch(target,init);
  const outHeaders=new Headers(upstream.headers);
  outHeaders.delete("content-length");outHeaders.delete("transfer-encoding");outHeaders.delete("content-encoding");
  return new Response(await upstream.arrayBuffer(),{status:upstream.status,headers:outHeaders});
}
export const GET=proxy;
export const POST=proxy;
export const PUT=proxy;
export const PATCH=proxy;
export const DELETE=proxy;
