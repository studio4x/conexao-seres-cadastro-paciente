"use client";
import { FormEvent,useEffect,useState } from "react";
import { CalendarDays,CheckCircle2,Clock3,CreditCard,Leaf,Loader2,LockKeyhole,Mail,MessageCircle,MonitorPlay,UserRound } from "lucide-react";
import { AppVersion } from "@/components/layout/AppVersion";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { JORNADA_YOGA_AMOUNT,JORNADA_YOGA_DATES,formatCpf,formatCurrency,formatWhatsapp,isValidBrazilianWhatsapp,isValidCpf,isValidEmail,isValidFullName } from "@/lib/jornada-yoga";

const LOGO="https://conexaoseres.com.br/wp-content/uploads/2024/04/LOGOTIPO-CONEXAO-SERES-HORIZONTAL-TRANSPARENTE.png";
type State={name:string;cpf:string;email:string;whatsapp:string;consent:boolean;website:string};
type Result={success?:boolean;invoiceUrl?:string;value?:number;existingRegistration?:boolean;message?:string};
const initial:State={name:"",cpf:"",email:"",whatsapp:"",consent:false,website:""};
const input="h-12 w-full rounded-lg border border-[#cfd6ca] bg-white px-3.5 text-[15px] outline-none transition focus:border-[#005000] focus:ring-3 focus:ring-[#005000]/15";

export function JornadaYogaPage(){
 const [form,setForm]=useState(initial),[token,setToken]=useState(""),[reset,setReset]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState(""),[result,setResult]=useState<Result|null>(null);
 useEffect(()=>{document.title="Inscrição | Jornada de Expansão Mental e Corporal | Conexão Seres";},[]);
 async function submit(e:FormEvent){e.preventDefault();setError("");
  if(!isValidFullName(form.name))return setError("Informe seu nome completo.");
  if(!isValidCpf(form.cpf))return setError("Confira o CPF informado.");
  if(!isValidEmail(form.email))return setError("Confira o e-mail informado.");
  if(!isValidBrazilianWhatsapp(form.whatsapp))return setError("Informe um WhatsApp válido com DDD.");
  if(!form.consent)return setError("Confirme a autorização para utilizar os dados na inscrição e cobrança.");
  if(!token)return setError("Conclua a verificação de segurança antes de continuar.");
  setLoading(true);
  try{const r=await fetch("/api/jornada-yoga",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,turnstileToken:token})});const p=await r.json() as Result;if(!r.ok||!p.success)throw new Error(p.message||"Não foi possível concluir sua inscrição.");setResult(p);}
  catch(err){setError(err instanceof Error?err.message:"Não foi possível concluir sua inscrição.");setToken("");setReset(v=>v+1);}finally{setLoading(false);}
 }
 return <main className="min-h-screen bg-[#f8f5ec] text-foreground">
  <div className="h-1.5 bg-primary"/>
  <header className="border-b border-[#dce3d8] bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8"><img src={LOGO} alt="Conexão Seres" className="w-[210px]"/><span className="flex items-center gap-2 text-xs font-medium text-[#315f31]"><LockKeyhole className="size-4"/>Ambiente seguro</span></div></header>
  <section className="bg-[#eef5e9]"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:py-16">
   <div><p className="inline-flex items-center gap-2 rounded-full border border-[#bcd0b4] bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[.12em] text-[#315f31]"><Leaf className="size-4"/>Inscrições abertas</p>
   <h1 className="mt-6 text-[2.6rem] font-semibold leading-[1.06] tracking-[-.045em] text-[#005000] sm:text-[3.6rem]">Jornada de Expansão Mental e Corporal</h1>
   <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f5e4b]">Oito encontros online com diálogos terapêuticos, Yoga, respiração consciente, meditação e relaxamento para cultivar presença, equilíbrio e autoconhecimento.</p>
   <div className="mt-7 flex flex-wrap gap-3 text-sm font-medium text-[#315f31]"><span className="flex items-center gap-2 rounded-lg bg-white px-4 py-3"><CalendarDays className="size-4"/>8 encontros</span><span className="flex items-center gap-2 rounded-lg bg-white px-4 py-3"><Clock3 className="size-4"/>20h</span><span className="flex items-center gap-2 rounded-lg bg-white px-4 py-3"><MonitorPlay className="size-4"/>Google Meet</span></div></div>
   <div className="rounded-2xl border border-[#c9d9c2] bg-white p-6 shadow-sm sm:p-8"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#8a5a18]">Condução</p>
    <div className="mt-5 space-y-4"><div><p className="font-semibold text-[#005000]">Deyse Simon</p><p className="text-sm text-[#566451]">Terapeuta Ocupacional e Psicanalista</p></div><div><p className="font-semibold text-[#005000]">David Goulart</p><p className="text-sm text-[#566451]">Professor de Yoga</p></div></div>
    <div className="mt-6 border-t border-[#dce3d8] pt-5"><p className="text-sm text-[#566451]">Investimento pelos 8 encontros</p><p className="mt-1 text-3xl font-semibold text-[#005000]">{formatCurrency(JORNADA_YOGA_AMOUNT)} <span className="text-sm">à vista</span></p></div>
   </div>
  </div></section>
  <section className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[.85fr_1.15fr] lg:py-16">
   <aside><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#8a5a18]">Datas</p><h2 className="mt-2 text-2xl font-semibold text-[#005000]">Encontros semanais para integrar corpo, mente e cotidiano.</h2>
    <div className="mt-6 grid grid-cols-2 gap-2">{JORNADA_YOGA_DATES.map((d,i)=><div key={d} className="rounded-lg border border-[#d5ded1] bg-white p-3"><span className="text-[11px] font-semibold uppercase text-[#8a5a18]">Encontro {i+1}</span><p className="mt-1 text-sm font-semibold text-[#315f31]">{d}</p></div>)}</div>
    <div className="mt-6 rounded-xl border border-[#d5ded1] bg-white p-5 text-sm leading-6 text-[#566451]"><p className="font-semibold text-[#005000]">Incluso na Jornada</p><p className="mt-3">Material de apoio em PDF e grupo de WhatsApp para integração dos participantes e recebimento dos links de acesso.</p></div>
   </aside>
   <div className="rounded-2xl border border-[#d5ded1] bg-white p-5 shadow-sm sm:p-9">
    {result?<div className="py-6"><CheckCircle2 className="size-12 text-[#3a8036]"/><p className="mt-5 text-xs font-semibold uppercase tracking-[.12em] text-[#8a5a18]">{result.existingRegistration?"Inscrição já localizada":"Cadastro concluído"}</p><h2 className="mt-2 text-3xl font-semibold text-[#005000]">Agora falta apenas concluir o pagamento.</h2><p className="mt-4 leading-7 text-[#566451]">Sua cobrança de {formatCurrency(result.value||JORNADA_YOGA_AMOUNT)} está no Asaas. Após a identificação do pagamento, sua inscrição será considerada confirmada.</p>{result.invoiceUrl?<a href={result.invoiceUrl} target="_blank" rel="noreferrer" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-white"><CreditCard className="size-5"/>Ir para o pagamento no Asaas</a>:<p className="mt-6 rounded-lg bg-[#fff8ee] p-4 text-sm text-[#754000]">A cobrança foi criada, mas o link não pôde ser exibido. Fale com a Conexão Seres.</p>}</div>:
    <><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#8a5a18]">Inscrição</p><h2 className="mt-2 text-3xl font-semibold text-[#005000]">Garanta sua participação</h2><p className="mt-3 text-sm leading-6 text-[#687264]">Preencha os dados necessários para localizar ou criar seu cadastro no Asaas e gerar a cobrança de {formatCurrency(JORNADA_YOGA_AMOUNT)}.</p>
    <form onSubmit={submit} className="mt-7 space-y-5"><label className="block"><span className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#514821]"><UserRound className="size-4"/>Nome completo</span><input className={input} autoComplete="name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <div className="grid gap-5 sm:grid-cols-2"><label><span className="mb-2 block text-sm font-semibold text-[#514821]">CPF</span><input className={input} inputMode="numeric" value={form.cpf} onChange={e=>setForm({...form,cpf:formatCpf(e.target.value)})} placeholder="000.000.000-00"/></label><label><span className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#514821]"><MessageCircle className="size-4"/>WhatsApp</span><input className={input} inputMode="tel" value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:formatWhatsapp(e.target.value)})} placeholder="(11) 99999-9999"/></label></div>
    <label className="block"><span className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#514821]"><Mail className="size-4"/>E-mail</span><input className={input} type="email" autoComplete="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
    <input className="sr-only" tabIndex={-1} autoComplete="off" value={form.website} onChange={e=>setForm({...form,website:e.target.value})}/>
    <label className="flex gap-3 rounded-lg border border-[#dfe4db] bg-[#fafbf9] p-4 text-sm leading-6 text-[#566451]"><input type="checkbox" className="mt-1 accent-[#005000]" checked={form.consent} onChange={e=>setForm({...form,consent:e.target.checked})}/><span>Confirmo que os dados informados estão corretos e autorizo seu uso para processar minha inscrição e cobrança.</span></label>
    <TurnstileWidget action="jornada_yoga" onTokenChange={setToken} resetKey={reset}/>
    {error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <button disabled={loading} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-white disabled:opacity-60">{loading?<Loader2 className="size-5 animate-spin"/>:<CreditCard className="size-5"/>}{loading?"Gerando cobrança...":`Inscrever-se por ${formatCurrency(JORNADA_YOGA_AMOUNT)}`}</button>
    </form></>}</div>
  </section>
  <footer className="border-t border-[#dce3d8] bg-white py-6 text-center text-xs text-[#7a8176]">Conexão Seres · Jornada de Expansão Mental e Corporal · <AppVersion/></footer>
 </main>;
}
