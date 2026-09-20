import {NextResponse} from "next/server";
import {NEON_AUTH_BASE_URL} from "./app/auth-config";

const PUBLIC_PREFIXES=["/_next/","/icon.svg","/manifest.webmanifest","/sw.js","/login","/api/auth/"];

function withRequestId(request,response,id){
  response.headers.set("x-request-id",id);
  return response;
}
export async function middleware(request){
  const {pathname}=request.nextUrl,id=request.headers.get("x-request-id")||crypto.randomUUID();
  const requestHeaders=new Headers(request.headers);requestHeaders.set("x-request-id",id);
  if(PUBLIC_PREFIXES.some(p=>pathname===p||pathname.startsWith(p)))return withRequestId(request,NextResponse.next({request:{headers:requestHeaders}}),id);

  let session=null;
  try{
    const r=await fetch(NEON_AUTH_BASE_URL+"/get-session",{
      headers:{cookie:request.headers.get("cookie")||"","user-agent":request.headers.get("user-agent")||""},
      cache:"no-store"
    });
    if(r.ok)session=await r.json();
  }catch{}

  if(!session?.user?.id){
    if(pathname.startsWith("/api/"))return withRequestId(request,NextResponse.json({error:"Authentication required",code:"AUTH_REQUIRED",request_id:id},{status:401}),id);
    const login=new URL("/login",request.url);
    login.searchParams.set("next",pathname);
    return withRequestId(request,NextResponse.redirect(login),id);
  }
  return withRequestId(request,NextResponse.next({request:{headers:requestHeaders}}),id);
}

export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
