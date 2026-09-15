import crypto from "node:crypto";

function key(){
  // Prefer a dedicated integration secret in SaaS deployments. The DATABASE_URL
  // fallback keeps the current single-tenant production usable without storing
  // third-party credentials in plaintext; set INTEGRATION_ENCRYPTION_KEY before
  // onboarding external customers so credential rotation is independent of DB access.
  const raw=process.env.INTEGRATION_ENCRYPTION_KEY||process.env.DATABASE_URL;
  if(!raw) throw new Error("Integration encryption key is not configured");
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptCredential(value){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",key(),iv);
  const encrypted=Buffer.concat([cipher.update(String(value),"utf8"),cipher.final()]);
  return {
    ciphertext:encrypted.toString("base64"),
    iv:iv.toString("base64"),
    tag:cipher.getAuthTag().toString("base64"),
  };
}

export function decryptCredential({ciphertext,iv,tag}){
  const decipher=crypto.createDecipheriv("aes-256-gcm",key(),Buffer.from(iv,"base64"));
  decipher.setAuthTag(Buffer.from(tag,"base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext,"base64")),
    decipher.final(),
  ]).toString("utf8");
}
