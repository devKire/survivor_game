import AuthForm from "../AuthForm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hubSession } from "../../server/hub";
import { safeCallback } from "../hub/navigation";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{callbackUrl?:string}>}) {
 const callbackUrl=safeCallback((await searchParams).callbackUrl);
 const {user,unavailable}=await hubSession();
 if(user)redirect(callbackUrl);
 return unavailable?<main id="screen" className="auth-screen"><section className="panel"><span className="eyebrow">LIMIAR · ECOS DO OBELISCO</span><h1>Online indisponível</h1><p role="status">Não foi possível conectar aos serviços online. Você pode continuar jogando neste navegador.</p><div className="actions"><Link href="/offline">Jogar offline</Link><Link href="/">← Menu principal</Link></div></section></main>:<AuthForm callbackUrl={callbackUrl}/>;
}
