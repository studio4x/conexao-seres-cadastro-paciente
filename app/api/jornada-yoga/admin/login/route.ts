import { adminSessionCookie,createAdminSessionToken,isAdminConfigReady,verifyAdminPassword } from "../../../../../lib/jornada-admin-auth";
import { getJourneyAdminConfig,noStoreJson } from "../../../../../lib/jornada-admin-server";
export const runtime="edge";
export async function POST(request:Request){
  if(Number(request.headers.get("content-length")||"0")>4000)return noStoreJson({message:"Dados inválidos."},{status:413});
  const config=getJourneyAdminConfig();if(!isAdminConfigReady(config))return noStoreJson({message:"O acesso administrativo ainda não foi configurado no servidor."},{status:503});
  let body:{email?:unknown;password?:unknown};try{body=await request.json() as typeof body;}catch{return noStoreJson({message:"Dados inválidos."},{status:400});}
  const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";const password=typeof body.password==="string"?body.password:"";
  if(email!==config.email||!password||password.length>256||!(await verifyAdminPassword(password,config.passwordVerifier)))return noStoreJson({message:"E-mail ou senha inválidos."},{status:401});
  const token=await createAdminSessionToken(config.email,config.sessionSecret);const response=noStoreJson({success:true,email:config.email});
  response.headers.set("Set-Cookie",adminSessionCookie(token));return response;
}