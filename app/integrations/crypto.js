import crypto from "node:crypto";
// Production deployments prefer the dedicated integration key.

function derive(raw){
  if(!raw)return null;
  return crypto.createHash("sha256").update(String(raw)).digest();
}
function dedicatedKey(){return derive(process.env.INTEGRATION_ENCRYPTION_KEY)}
function legacyKey(){return derive(process.env.DATABASE_URL)}

export function hasDedicatedIntegrationKey(){return Boolean(process.env.INTEGRATION_ENCRYPTION_KEY)}

export function encryptCredential(value){
  const key=dedicatedKey()||legacyKey();
  if(!key)throw new Error("Integration encryption key is not configured");
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
  const encrypted=Buffer.concat([cipher.update(String(value),"utf8"),cipher.final()]);
  return {ciphertext:encrypted.toString("base64"),iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64")};
}

function decryptWith(key,{ciphertext,iv,tag}){
  const decipher=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(iv,"base64"));
  decipher.setAuthTag(Buffer.from(tag,"base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext,"base64")),decipher.final()]).toString("utf8");
}

export function decryptCredentialWithSource(payload){
  const preferred=dedicatedKey();
  if(preferred){try{return{value:decryptWith(preferred,payload),source:"dedicated"}}catch{}}
  const legacy=legacyKey();
  if(legacy){try{return{value:decryptWith(legacy,payload),source:"legacy"}}catch{}}
  throw new Error("Could not decrypt integration credential");
}
export function decryptCredential(payload){return decryptCredentialWithSource(payload).value}
