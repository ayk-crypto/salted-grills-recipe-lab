import { NextResponse } from "next/server";
import { db } from "../../db";
import { POST as createRecipe } from "../recipes/route";
import { GET as getRecipe, PUT as updateRecipe, PATCH as patchRecipe, DELETE as deleteRecipe } from "../recipes/[id]/route";

const tiny='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const req=(url,method='GET',body)=>new Request(url,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
const ctx=id=>({params:Promise.resolve({id})});
async function json(res){let b={};try{b=await res.json()}catch{}return {status:res.status,body:b}}

export async function GET(){
 const sql=db(); let recipeId=null;
 try{
  const [ing1,ing2]=await sql`SELECT id,name,default_unit FROM ingredients WHERE is_active=true ORDER BY name LIMIT 2`;
  const [pack1,pack2]=await sql`SELECT id,name FROM packaging_items WHERE is_active=true ORDER BY name LIMIT 2`;
  if(!ing1||!ing2||!pack1||!pack2)return NextResponse.json({ok:false,error:'Missing smoke-test master data'},{status:500});
  const base={name:`SMOKE TEST ${Date.now()}`,recipe_type:'menu',category:'Chinese Cuisine',status:'approved',yield_quantity:2,yield_unit:'portion',prep_time_minutes:7,cook_time_minutes:11,kitchen_notes:'Smoke test notes — all finish fields populated.',components:[{kind:'ingredient',id:ing1.id,quantity:125,unit:ing1.default_unit||'g',notes:'Primary test component'},{kind:'ingredient',id:ing2.id,quantity:15,unit:ing2.default_unit||'g',notes:'Secondary test component'}],steps:[{instruction:'Prepare all measured ingredients.',duration_seconds:45},{instruction:'Cook and finish according to the standard.',duration_seconds:120}],photos:[{photo_type:'prep',storage_key:'smoke:prep',public_url:tiny,caption:'Prep smoke photo'},{photo_type:'final',storage_key:'smoke:final',public_url:tiny,caption:'Final smoke photo'}],packaging:[{order_type:'takeaway',packaging_item_id:pack1.id,quantity:1},{order_type:'delivery',packaging_item_id:pack2.id,quantity:2}]};

  const created=await json(await createRecipe(req('https://local/api/recipes','POST',base)));
  if(created.status!==201)return NextResponse.json({ok:false,stage:'create',created},{status:500});
  recipeId=created.body.recipe.id;

  const read1=await json(await getRecipe(req(`https://local/api/recipes/${recipeId}`),ctx(recipeId)));
  const r=read1.body;
  const persisted={name:r.name===base.name,category:r.category===base.category,status:r.status===base.status,yield:Number(r.yield_quantity)===2,yieldUnit:r.yield_unit==='portion',prep:Number(r.prep_time_minutes)===7,cook:Number(r.cook_time_minutes)===11,notes:r.kitchen_notes===base.kitchen_notes,components:r.components?.length===2,steps:r.steps?.length===2,photos:r.photos?.length===2,packaging:r.packaging?.length===2};

  const changed={...base,name:base.name+' UPDATED',status:'recorded',yield_quantity:3,prep_time_minutes:9,cook_time_minutes:13,kitchen_notes:'Updated smoke notes',steps:[...base.steps,{instruction:'Plate, check and serve.',duration_seconds:30}],packaging:[{order_type:'takeaway',packaging_item_id:pack1.id,quantity:2}]};
  const updated=await json(await updateRecipe(req(`https://local/api/recipes/${recipeId}`,'PUT',changed),ctx(recipeId)));
  const read2=await json(await getRecipe(req(`https://local/api/recipes/${recipeId}`),ctx(recipeId)));
  const updatePersisted=updated.status===200&&read2.body.name===changed.name&&read2.body.status==='recorded'&&Number(read2.body.yield_quantity)===3&&read2.body.steps?.length===3&&read2.body.packaging?.length===1&&read2.body.versions?.length===2;

  const locked=await json(await patchRecipe(req(`https://local/api/recipes/${recipeId}`,'PATCH',{is_locked:true}),ctx(recipeId)));
  const blocked=await json(await updateRecipe(req(`https://local/api/recipes/${recipeId}`,'PUT',changed),ctx(recipeId)));
  const unlocked=await json(await patchRecipe(req(`https://local/api/recipes/${recipeId}`,'PATCH',{is_locked:false}),ctx(recipeId)));
  const deleted=await json(await deleteRecipe(req(`https://local/api/recipes/${recipeId}`,'DELETE'),ctx(recipeId)));
  const afterDelete=await json(await getRecipe(req(`https://local/api/recipes/${recipeId}`),ctx(recipeId)));

  const checks={create:created.status===201,allCreateFields:Object.values(persisted).every(Boolean),update:updatePersisted,lock:locked.status===200&&locked.body.is_locked===true,lockedEditRejected:blocked.status===423,unlock:unlocked.status===200&&unlocked.body.is_locked===false,softDelete:deleted.status===200&&afterDelete.status===404};
  return NextResponse.json({ok:Object.values(checks).every(Boolean),checks,persisted,details:{createStatus:created.status,readStatus:read1.status,updateStatus:updated.status,lockStatus:locked.status,blockedStatus:blocked.status,unlockStatus:unlocked.status,deleteStatus:deleted.status,afterDeleteStatus:afterDelete.status}});
 }catch(e){return NextResponse.json({ok:false,error:e.message,recipeId},{status:500})}
 finally{
  if(recipeId){try{await sql`DELETE FROM recipe_packaging WHERE recipe_id=${recipeId}`;await sql`DELETE FROM recipe_photos WHERE recipe_version_id IN (SELECT id FROM recipe_versions WHERE recipe_id=${recipeId})`;await sql`DELETE FROM recipe_steps WHERE recipe_version_id IN (SELECT id FROM recipe_versions WHERE recipe_id=${recipeId})`;await sql`DELETE FROM recipe_components WHERE recipe_version_id IN (SELECT id FROM recipe_versions WHERE recipe_id=${recipeId})`;await sql`UPDATE recipes SET current_version_id=NULL WHERE id=${recipeId}`;await sql`DELETE FROM recipe_versions WHERE recipe_id=${recipeId}`;await sql`DELETE FROM recipes WHERE id=${recipeId}`}catch{}}
 }
}
