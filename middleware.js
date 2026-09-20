import {NextResponse} from "next/server";
import {NEON_AUTH_BASE_URL} from "./app/auth-config";

const PUBLIC_PREFIXES=["/_next/","/icon.svg","/manifest.webmanifest","/sw.js","/login","/api/auth/"];

export async function middleware(request){
  const {pathname}=request.nextUrl;
  if(PUBLIC_PREFIXES.some(p=>pathname===p||pathname.startsWith(p)))return NextResponse.next();

  let session=null;
  try{
    const r=await fetch(NEON_AUTH_BASE_URL+"/get-session",{
      headers:{cookie:request.headers.get("cookie")||"","user-agent":request.headers.get("user-agent")||""},
      cache:"no-store"
    });
    if(r.ok)session=await r.json();
  }catch{}

  if(!session?.user?.id){
    if(pathname.startsWith("/api/"))return NextResponse.json({error:"Authentication required"},{status:401});
    const login=new URL("/login",request.url);
    login.searchParams.set("next",pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
