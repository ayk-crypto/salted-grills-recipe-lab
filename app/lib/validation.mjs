export class ValidationError extends Error{
  constructor(message,field=null){super(message);this.name="ValidationError";this.status=400;this.field=field}
}
export async function readJson(req){
  try{return await req.json()}catch{throw new ValidationError("Invalid JSON request body")}
}
export function text(v,{field="value",required=false,max=5000}={}){
  const s=String(v??"").trim();
  if(required&&!s)throw new ValidationError(`${field} is required`,field);
  if(s.length>max)throw new ValidationError(`${field} is too long`,field);
  return s;
}
export function uuid(v,{field="id",required=true}={}){
  const s=String(v??"").trim();
  if(!s&&!required)return null;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s))throw new ValidationError(`${field} must be a valid id`,field);
  return s;
}
export function number(v,{field="value",required=false,min=null,max=null,allowNull=false}={}){
  if(v===null||v===undefined||String(v).trim()===""){
    if(required)throw new ValidationError(`${field} is required`,field);
    return allowNull?null:undefined;
  }
  const n=Number(v);
  if(!Number.isFinite(n))throw new ValidationError(`${field} must be a valid number`,field);
  if(min!==null&&n<min)throw new ValidationError(`${field} must be at least ${min}`,field);
  if(max!==null&&n>max)throw new ValidationError(`${field} cannot exceed ${max}`,field);
  return n;
}
export const positive=(v,o={})=>number(v,{...o,min:0.0000001,required:o.required??true});
export const nonnegative=(v,o={})=>number(v,{...o,min:0,required:o.required??true});
export const percentage=(v,o={})=>number(v,{...o,min:0,max:100,required:o.required??true});
export function oneOf(v,allowed,{field="value",required=true,fallback}={}){
  const s=String(v??"").trim();
  if(!s&&!required)return fallback;
  if(!allowed.includes(s)){
    if(fallback!==undefined)return fallback;
    throw new ValidationError(`${field} is invalid`,field);
  }
  return s;
}
export function list(v,{field="items",max=1000}={}){
  if(!Array.isArray(v))throw new ValidationError(`${field} must be an array`,field);
  if(v.length>max)throw new ValidationError(`${field} contains too many records`,field);
  return v;
}
export function dateOnly(v,{field="date",required=false}={}){
  if(v===null||v===undefined||String(v).trim()===""){
    if(required)throw new ValidationError(`${field} is required`,field);
    return null;
  }
  const s=String(v).trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s+"T00:00:00Z")))throw new ValidationError(`${field} must be YYYY-MM-DD`,field);
  return s;
}
export function validationResponse(e,NextResponse){
  if(e instanceof ValidationError)return NextResponse.json({error:e.message,field:e.field||undefined},{status:400});
  return null;
}
