import crypto from "node:crypto";
import {ValidationError} from "./validation.mjs";

export class AppError extends Error{
  constructor(message,{status=400,code="APP_ERROR",details=null}={}){
    super(message);this.name="AppError";this.status=status;this.code=code;this.details=details;
  }
}
export function requestId(req){
  return req?.headers?.get?.("x-request-id")||crypto.randomUUID();
}
export function logError(error,{requestId=null,route=null,action=null,userId=null,tenantId=null,extra=null}={}){
  const payload={
    level:"error",event:"api_error",timestamp:new Date().toISOString(),
    requestId,route,action,userId,tenantId,
    error:{
      name:error?.name||"Error",
      message:String(error?.message||error||"Unknown error"),
      code:error?.code||null,
      status:Number(error?.status)||500,
      stack:error?.stack||null
    },
    extra:extra||undefined
  };
  console.error(JSON.stringify(payload));
}
export function errorResponse(error,NextResponse,{requestId:id=null,route=null,action=null,fallback="Request failed",userId=null,tenantId=null}={}){
  const isValidation=error instanceof ValidationError;
  const explicitStatus=Number(error?.status);
  const status=isValidation?400:(explicitStatus>=400&&explicitStatus<600?explicitStatus:500);
  const expose=status<500;
  if(status>=500)logError(error,{requestId:id,route,action,userId,tenantId});
  const body={
    error:expose?String(error?.message||fallback):fallback,
    code:isValidation?"VALIDATION_ERROR":(error?.code||undefined),
    field:isValidation?(error.field||undefined):undefined,
    request_id:id||undefined
  };
  return NextResponse.json(body,{status,headers:id?{"x-request-id":id}:undefined});
}
export function okJson(NextResponse,data,{status=200,requestId:id=null}={}){
  return NextResponse.json(data,{status,headers:id?{"x-request-id":id}:undefined});
}
