"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { navigation, loginHref } from "./navigation";
export default function HubMenu({authenticated,unavailable,children}: {authenticated:boolean;unavailable:boolean;children:React.ReactNode}) {
 const [section,setSection]=useState("play"), [destination,setDestination]=useState("/solo");
 const dialog=useRef<HTMLDialogElement>(null);
 const active=navigation.find(s=>s.id===section)!;
 return <div className="hub-menu">
   <nav className="hub-categories" aria-label="Menu principal">{navigation.map(s=><button key={s.id} aria-pressed={section===s.id} aria-controls="hub-section" onClick={()=>setSection(s.id)}><span>{s.label}</span><span aria-hidden="true">{section===s.id?"◆":"·"}</span></button>)}<Link href={authenticated?"/account#settings":"/offline?menu=settings"}>Configurações <span aria-hidden="true">↗</span></Link><Link href="/offline?menu=codex">Códice <span aria-hidden="true">↗</span></Link></nav>
   <section id="hub-section" className="hub-section" aria-label={active.label}>
    <div className="hub-section-heading"><span className="eyebrow">{section==="play"?"ESCOLHA SUA TRAVESSIA":"ALÉM DA NÉVOA"}</span><h2>{active.label}</h2></div>
    {section==="play" && children}
    <div className="hub-mode-list">{active.items.map(item=>{
      const locked=!("public" in item && item.public) && !authenticated;
      return locked ? <button className="hub-mode locked" key={item.href} onClick={()=>{setDestination(item.href);dialog.current?.showModal();}}><span className="hub-mode-title">{item.label}<span aria-hidden="true">◇</span></span><span>{item.description}</span><small>{unavailable?"Online indisponível":"Requer conta · Entrar para acessar"}</small></button> : <Link className="hub-mode" key={item.href} href={item.href}><span className="hub-mode-title">{item.label}<span aria-hidden="true">↗</span></span><span>{item.description}</span></Link>;
    })}</div>
   </section>
   <dialog ref={dialog} className="hub-dialog" aria-labelledby="auth-title" onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}><span className="eyebrow">ATRAVESSE EM COMPANHIA</span><h2 id="auth-title">Entre na sua conta para jogar online.</h2><p>{unavailable?"Os serviços online estão indisponíveis agora. Sua expedição offline continua disponível.":"Salve suas expedições, reúna aliados e descubra os ecos do Limiar."}</p><div className="actions"><Link href={loginHref(destination)}>Entrar</Link><Link href={`/register?callbackUrl=${encodeURIComponent(destination)}`}>Criar conta</Link><button onClick={()=>dialog.current?.close()}>Voltar ao menu</button></div></dialog>
 </div>;
}
