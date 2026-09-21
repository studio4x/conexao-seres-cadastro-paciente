const COOKIE_NAME = "cs_jornada_admin";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type AdminConfig = { email: string; passwordVerifier: string; sessionSecret: string };
type SessionPayload = { email: string; exp: number };

const utf8 = (value: string) => new TextEncoder().encode(value);
const b64u = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
};
const fromB64u = (value: string) => {
  const n=value.replace(/-/g,"+").replace(/_/g,"/"); const p=n+"=".repeat((4-(n.length%4||4))%4);
  return Uint8Array.from(atob(p),(c)=>c.charCodeAt(0));
};
const hex = (bytes: Uint8Array) => Array.from(bytes,(b)=>b.toString(16).padStart(2,"0")).join("");
const unhex = (value: string) => {
  if(!/^[0-9a-f]+$/i.test(value)||value.length%2) return null;
  const out=new Uint8Array(value.length/2); for(let i=0;i<out.length;i++) out[i]=parseInt(value.slice(i*2,i*2+2),16); return out;
};
const safeEqual=(a:string,b:string)=>{ if(a.length!==b.length)return false; let d=0; for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i); return d===0; };
async function hmac(message:string,secret:string){
  const key=await crypto.subtle.importKey("raw",utf8(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",key,utf8(message)));
}

export const getAdminCookieName=()=>COOKIE_NAME;
export const isAdminConfigReady=(c:AdminConfig)=>Boolean(c.email&&c.passwordVerifier&&c.sessionSecret.length>=32);

export async function verifyAdminPassword(password:string, verifier:string){
  const [scheme,itText,saltHex,expected]=verifier.split("$"); const it=Number(itText); const salt=unhex(saltHex||"");
  if(scheme!=="pbkdf2_sha256"||!Number.isInteger(it)||it<100000||it>1000000||!salt||salt.length<16||!/^[0-9a-f]{64}$/i.test(expected||"")) return false;
  const key=await crypto.subtle.importKey("raw",utf8(password),"PBKDF2",false,["deriveBits"]);
  const derived=new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:it},key,256));
  return safeEqual(hex(derived),expected.toLowerCase());
}

export async function createAdminSessionToken(email:string,secret:string,now=Date.now()){
  const payload:SessionPayload={email:email.trim().toLowerCase(),exp:Math.floor(now/1000)+SESSION_TTL_SECONDS};
  const body=b64u(utf8(JSON.stringify(payload))); return `${body}.${b64u(await hmac(body,secret))}`;
}

export async function verifyAdminSessionToken(token:string,email:string,secret:string,now=Date.now()){
  const parts=token.split("."); if(parts.length!==2||!parts[0]||!parts[1]) return false;
  if(!safeEqual(parts[1],b64u(await hmac(parts[0],secret)))) return false;
  try{
    const p=JSON.parse(new TextDecoder().decode(fromB64u(parts[0]))) as SessionPayload;
    return p.email?.toLowerCase()===email.trim().toLowerCase()&&Number.isInteger(p.exp)&&p.exp>Math.floor(now/1000);
  }catch{return false;}
}
export const adminSessionCookie=(token:string)=>`${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
export const expiredAdminSessionCookie=()=>`${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
export function readCookie(request:Request,name:string){
  for(const part of (request.headers.get("cookie")||"").split(";")){const [key,...rest]=part.trim().split("="); if(key===name)return rest.join("=");}
  return "";
}
