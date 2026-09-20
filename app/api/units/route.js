import { NextResponse } from "next/server";
import { db } from "../../db";
import {requireTenant,requireRole} from "../../tenant";
import {readJson,text,uuid,oneOf} from "../../lib/validation.mjs";
import {errorResponse,requestId,okJson} from "../../lib/api-errors.mjs";

export async function GET(req) {
const id=requestId(req); try {
    await requireTenant();
    const sql = db();
    const rows = await sql`SELECT * FROM measurement_units WHERE is_active=true ORDER BY unit_group NULLS LAST, name`;
    return okJson(NextResponse,rows,{requestId:id});
  } catch (e) {
    return errorResponse(e,NextResponse,{requestId:id,route:"/api/units",action:"list",fallback:"Could not load units"});
  }
}

export async function POST(req) {
  const id=requestId(req); try {
    await requireRole(["owner","admin"]);
    const b=await readJson(req);const name=text(b.name,{field:"Unit name",required:true,max:80}),symbol=text(b.symbol,{field:"Unit symbol",required:true,max:20}),unitGroup=b.unit_group?oneOf(b.unit_group,["weight","volume","count","other"],{field:"Unit group"}):null;
    const sql=db();
    const [row]=await sql`
      INSERT INTO measurement_units (name,symbol,unit_group,is_active)
      VALUES (${name},${symbol},${unitGroup},true)
      ON CONFLICT (lower(symbol)) WHERE is_active=true
      DO UPDATE SET name=EXCLUDED.name, unit_group=EXCLUDED.unit_group, updated_at=now()
      RETURNING *
    `;
    return okJson(NextResponse,row,{status:201,requestId:id});
  } catch(e){return errorResponse(e,NextResponse,{requestId:id,route:"/api/units",action:"save",fallback:"Could not save unit"});}
}

export async function DELETE(req) {
  const idReq=requestId(req); try {
    await requireRole(["owner","admin"]);
    const body=await readJson(req),id=uuid(body.id,{field:"Unit id"});
    const sql=db();
    const [row]=await sql`UPDATE measurement_units SET is_active=false,updated_at=now() WHERE id=${id} RETURNING id`;
    if(!row) return NextResponse.json({error:'Unit not found'},{status:404});
    return okJson(NextResponse,{ok:true},{requestId:idReq});
  } catch(e){return errorResponse(e,NextResponse,{requestId:idReq,route:"/api/units",action:"delete",fallback:"Could not delete unit"});}
}
