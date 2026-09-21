import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  JORNADA_YOGA_AMOUNT,JORNADA_YOGA_DESCRIPTION,JORNADA_YOGA_EVENT_ID,JORNADA_YOGA_REFERENCE_PREFIX,
  cleanText,isValidBrazilianWhatsapp,isValidCpf,isValidEmail,isValidFullName,normalizeBrazilianWhatsapp,onlyDigits,
} from "../../../lib/jornada-yoga";
import { authorizeE2eTurnstile,E2E_TURNSTILE_TEST_SECRET } from "../../../lib/turnstile-e2e";
import { verifyTurnstileToken } from "../../../lib/turnstile-verification";

export const runtime="edge";
type Obj=Record<string,unknown>;
type Customer={id?:string};
type Payment={id?:string;customer?:string;externalReference?:string;invoiceUrl?:string;status?:string;value?:number};

const schema=z.object({
  name:z.string().trim().max(120).refine(isValidFullName),
  cpf:z.string().max(30).refine(isValidCpf),
  email:z.string().trim().max(150).refine(isValidEmail),
  whatsapp:z.string().max(40).refine(isValidBrazilianWhatsapp),
  consent:z.literal(true),website:z.string().max(0),turnstileToken:z.string().min(1).max(2048),
});

const headers=(key:string)=>({accept:"application/json","content-type":"application/json","user-agent":"ConexaoSeresJornadaYoga/1.0",access_token:key});
async function json(response:Response){
  const raw=await response.text(); try{const data=JSON.parse(raw);return data&&typeof data==="object"&&!Array.isArray(data)?data as Obj:{};}catch{return {};}
}
const list=<T,>(data:Obj)=>Array.isArray(data.data)?data.data.filter((x)=>x&&typeof x==="object") as T[]:[];

async function customers(base:string,key:string,field:"cpfCnpj"|"email",value:string,signal:AbortSignal){
  const url=new URL(base+"/customers"); url.searchParams.set(field,value); url.searchParams.set("limit","100");
  const r=await fetch(url,{headers:headers(key),signal}); const data=await json(r);
  return {ok:r.ok,items:r.ok?list<Customer>(data):[]};
}
const ids=(items:Customer[])=>Array.from(new Set(items.map(x=>x.id?.trim()||"").filter(Boolean)));
function resolveCustomer(cpf:Customer[],email:Customer[]){
  const a=ids(cpf),b=ids(email),both=a.filter(id=>b.includes(id));
  if(a.length>1||b.length>1)return {id:"",conflict:true};
  if(both.length===1&&a.length===1&&b.length===1)return {id:both[0],conflict:false};
  if(a.length===1&&b.length===0)return {id:a[0],conflict:false};
  if(b.length===1&&a.length===0)return {id:b[0],conflict:false};
  if(a.length===0&&b.length===0)return {id:"",conflict:false};
  return {id:"",conflict:true};
}
async function digest(value:string){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,"0")).join("");
}
async function paymentRef(cpf:string){return JORNADA_YOGA_REFERENCE_PREFIX+(await digest(JORNADA_YOGA_EVENT_ID+":"+onlyDigits(cpf))).slice(0,24);}
async function customerRef(cpf:string){return "cs-jornada-cliente-"+(await digest("conexao-seres-jornada-cliente:"+onlyDigits(cpf))).slice(0,24);}
function nextBusinessDay(now=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"}).formatToParts(now).filter(x=>x.type!=="literal").map(x=>[x.type,x.value])) as Record<string,string>;
  const d=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day))); d.setUTCDate(d.getUTCDate()+(p.weekday==="Fri"?3:p.weekday==="Sat"?2:1)); return d.toISOString().slice(0,10);
}
async function findPayment(base:string,key:string,reference:string,signal:AbortSignal){
  const u=new URL(base+"/payments");u.searchParams.set("externalReference",reference);u.searchParams.set("limit","10");
  const r=await fetch(u,{headers:headers(key),signal});const data=await json(r);
  const payment=r.ok?list<Payment>(data).find(x=>x.externalReference===reference&&x.id?.trim()):undefined;
  return {ok:r.ok,payment:payment||null};
}
async function getPayment(base:string,key:string,id:string,signal:AbortSignal){
  const r=await fetch(base+"/payments/"+encodeURIComponent(id),{headers:headers(key),signal});return r.ok?(await json(r) as Payment):null;
}
async function ensurePayment(base:string,key:string,customer:string,reference:string,signal:AbortSignal){
  const found=await findPayment(base,key,reference,signal); if(!found.ok)return {ok:false,created:false,payment:null as Payment|null};
  if(found.payment){const full=found.payment.id?await getPayment(base,key,found.payment.id,signal):null;return {ok:true,created:false,payment:full||found.payment};}
  const r=await fetch(base+"/payments",{method:"POST",headers:headers(key),body:JSON.stringify({customer,billingType:"UNDEFINED",value:JORNADA_YOGA_AMOUNT,dueDate:nextBusinessDay(),description:JORNADA_YOGA_DESCRIPTION,externalReference:reference}),signal});
  const created=await json(r) as Payment; if(r.ok&&created.id?.trim())return {ok:true,created:true,payment:created};
  const retry=await findPayment(base,key,reference,signal);return retry.ok&&retry.payment?{ok:true,created:false,payment:retry.payment}:{ok:false,created:false,payment:null};
}
async function sendN8n(payload:Obj){
  const url=(env.N8N_CONEXAO_SERES_JORNADA_WEBHOOK_URL as string|undefined)?.trim()||"";
  const token=(env.N8N_CONEXAO_SERES_JORNADA_WEBHOOK_TOKEN as string|undefined)?.trim()||"";
  if(!url||!token||token.startsWith("COLE_AQUI"))return;
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),3000);
  try{await fetch(url,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(payload),signal:controller.signal});}catch{}finally{clearTimeout(timeout);}
}
async function verify(request:Request,token:string,e2e:boolean){
  const secret=e2e?E2E_TURNSTILE_TEST_SECRET:(env.TURNSTILE_SECRET_KEY as string|undefined)?.trim()||"";
  return verifyTurnstileToken(request,token,{secret,expectedHostname:(env.TURNSTILE_EXPECTED_HOSTNAME as string|undefined)?.trim()||"",expectedAction:"jornada_yoga",useE2eSecret:e2e});
}
const result=(payment:Payment,existingRegistration:boolean,existingCustomer:boolean)=>({success:true,eventId:JORNADA_YOGA_EVENT_ID,paymentId:payment.id||"",invoiceUrl:payment.invoiceUrl||"",status:payment.status||"PENDING",value:JORNADA_YOGA_AMOUNT,existingRegistration,existingCustomer});

export async function POST(request:Request){
  if(Number(request.headers.get("content-length")||"0")>8000)return NextResponse.json({message:"Dados enviados são muito extensos."},{status:413});
  const raw=await request.text();const e2e=await authorizeE2eTurnstile(request,raw,env as unknown as Parameters<typeof authorizeE2eTurnstile>[2]);
  if(e2e.error)return NextResponse.json({code:e2e.error},{status:403});
  let body:unknown;try{body=JSON.parse(raw);}catch{return NextResponse.json({message:"Não foi possível ler os dados enviados."},{status:400});}
  const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({message:"Confira os dados informados e tente novamente."},{status:400});
  const turnstile=await verify(request,parsed.data.turnstileToken,e2e.authorized);
  if(!turnstile.configured)return NextResponse.json({message:"A verificação de segurança ainda não foi configurada."},{status:503});
  if(!turnstile.valid)return NextResponse.json({message:"Não foi possível confirmar a verificação de segurança. Tente novamente."},{status:400});

  const key=(env.ASAAS_API_KEY as string|undefined)?.trim()||"";const base=((env.ASAAS_API_URL as string|undefined)||"https://api.asaas.com/v3").replace(/\/$/,"");
  if(!key)return NextResponse.json({message:"As inscrições estão temporariamente indisponíveis."},{status:503});
  const cpf=onlyDigits(parsed.data.cpf),email=parsed.data.email.trim().toLowerCase();
  const normalized=normalizeBrazilianWhatsapp(parsed.data.whatsapp),whatsapp=normalized.startsWith("55")?normalized.slice(2):normalized;
  const reference=await paymentRef(cpf);const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),45000);

  try{
    const existing=await findPayment(base,key,reference,controller.signal);
    if(!existing.ok)return NextResponse.json({message:"Não conseguimos confirmar sua inscrição agora."},{status:502});
    if(existing.payment){const full=existing.payment.id?await getPayment(base,key,existing.payment.id,controller.signal):null;return NextResponse.json(result(full||existing.payment,true,true));}

    const [byCpf,byEmail]=await Promise.all([customers(base,key,"cpfCnpj",cpf,controller.signal),customers(base,key,"email",email,controller.signal)]);
    if(!byCpf.ok||!byEmail.ok)return NextResponse.json({message:"Não conseguimos consultar seu cadastro agora."},{status:502});
    const resolved=resolveCustomer(byCpf.items,byEmail.items);
    if(resolved.conflict)return NextResponse.json({message:"Encontramos mais de um cadastro relacionado aos dados informados. Entre em contato com a Conexão Seres."},{status:409});

    let customerId=resolved.id;const existingCustomer=Boolean(customerId);
    if(!customerId){
      const r=await fetch(base+"/customers",{method:"POST",headers:headers(key),body:JSON.stringify({name:cleanText(parsed.data.name),cpfCnpj:cpf,email,mobilePhone:whatsapp,externalReference:await customerRef(cpf),notificationDisabled:false}),signal:controller.signal});
      const created=await json(r);customerId=typeof created.id==="string"?created.id.trim():"";
      if(!r.ok||!customerId)return NextResponse.json({message:"Não conseguimos concluir seu cadastro agora."},{status:502});
    }
    const charge=await ensurePayment(base,key,customerId,reference,controller.signal);
    if(!charge.ok||!charge.payment?.id)return NextResponse.json({message:"Seu cadastro foi localizado, mas não conseguimos gerar a cobrança da Jornada agora."},{status:502});

    await sendN8n({eventType:"jornada_yoga_registration_created",eventId:JORNADA_YOGA_EVENT_ID,customerName:cleanText(parsed.data.name),customerEmail:email,customerWhatsapp:whatsapp,asaasCustomerId:customerId,paymentId:charge.payment.id,invoiceUrl:charge.payment.invoiceUrl||"",value:JORNADA_YOGA_AMOUNT,status:charge.payment.status||"PENDING",externalReference:reference,existingCustomer});
    return NextResponse.json(result(charge.payment,!charge.created,existingCustomer),{status:charge.created?201:200});
  }catch(error){
    console.error("Journey registration request failed",{timedOut:error instanceof Error&&error.name==="AbortError"});
    return NextResponse.json({message:"Não conseguimos concluir sua inscrição agora. Tente novamente em instantes."},{status:502});
  }finally{clearTimeout(timeout);}
}
