import { NextResponse } from "next/server";
import { getRecipe } from "../../../db";

export async function GET(req, {params}) {
  try {
    const {id}=await params;
    const row=await getRecipe(id);
    if(!row) return NextResponse.json({error:"Not found"}, {status:404});
    return NextResponse.json(row);
  } catch(e) {
    return NextResponse.json({error:e.message}, {status:500});
  }
}
