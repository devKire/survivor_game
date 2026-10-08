"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "./navigation";
export default function GameNavigation({rpgEnabled=false}: {rpgEnabled?:boolean}){const path=usePathname();return <nav className="game-navigation" aria-label="Navegação do jogo"><Link href="/">← Menu principal</Link><details><summary>Explorar o Limiar</summary><div>{navigation.map(section=><section key={section.id}><strong>{section.label}</strong>{section.items.map(item=>{const itemPath=item.href.split(/[?#]/,1)[0];return <Link key={item.href} href={item.href} aria-current={path===itemPath?"page":undefined}>{item.label}</Link>;})}</section>)}{rpgEnabled&&<section><strong>RPG</strong><Link href="/rpg/character" aria-current={path==="/rpg/character"?"page":undefined}>Personagens</Link><Link href="/rpg/inventory" aria-current={path==="/rpg/inventory"?"page":undefined}>Inventário</Link></section>}</div></details></nav>;}
