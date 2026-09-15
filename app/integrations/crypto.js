import crypto from "node:crypto";

function key(){
  const raw=process.env.INTEGRATION_ENCRYPTION_KEY;
  if(!raw) throw new Error("INTEGRATION_ENCRYPTION_KEY is not configured");
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
