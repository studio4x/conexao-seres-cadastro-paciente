import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getAdminCookieName,isAdminConfigReady,readCookie,verifyAdminSessionToken,type AdminConfig } from "./jornada-admin-auth";

export function getJourneyAdminConfig():AdminConfig{
  return {
    email:((env.JORNADA_ADMIN_EMAIL as string|undefined)||"contato@conexaoseres.com.br").trim().toLowerCase(),
    passwordVerifier:(env.JORNADA_ADMIN_PASSWORD_PBKDF2 as string|undefined)?.trim()||"",
    sessionSecret:(env.JORNADA_ADMIN_SESSION_SECRET as string|undefined)?.trim()||"",
  };
}
export async function isJourneyAdminAuthenticated(request:Request){
  const config=getJourneyAdminConfig();
  if(!isAdminConfigReady(config)) return {authenticated:false,configured:false,config};
  const token=readCookie(request,getAdminCookieName());
  if(!token) return {authenticated:false,configured:true,config};
  return {authenticated:await verifyAdminSessionToken(token,config.email,config.sessionSecret),configured:true,config};
}
export function noStoreJson(payload:unknown,init?:ResponseInit){
  const response=NextResponse.json(payload,init);
  response.headers.set("Cache-Control","no-store, private");
  response.headers.set("X-Content-Type-Options","nosniff");
  return response;
}
