"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export default function ContinueRuns({solo}: {solo:string|null}) {
 const [offline,setOffline]=useState<string|null>(null);
 useEffect(()=>{
  let disposed=false;
  async function read(){try{
   const [{migrateSave,validateRunSnapshot},{CHARACTER_DEFINITIONS,MAP_DEFINITIONS}]=await Promise.all([import("../../game/core/save"),import("../../game/content/catalog")]);
   const run=migrateSave(JSON.parse(localStorage.getItem("limiar.save.v1")||"null")).activeRun;
   if(!disposed)setOffline(run&&validateRunSnapshot(run,false)?`${Math.floor(run.time/60).toString().padStart(2,"0")}:${Math.floor(run.time%60).toString().padStart(2,"0")} · ${CHARACTER_DEFINITIONS[run.character].name} · ${MAP_DEFINITIONS[run.mapId].name}`:null);
  }catch{if(!disposed)setOffline(null);}}
  void read(); window.addEventListener("storage",read);window.addEventListener("pageshow",read);
  return ()=>{disposed=true;window.removeEventListener("storage",read);window.removeEventListener("pageshow",read);};
 },[]);
 return <div className="hub-continue" aria-label="Expedições retomáveis">{solo&&<Link href="/solo"><strong>Continuar solo online <span aria-hidden="true">→</span></strong><small>{solo}</small></Link>}{offline&&<Link href="/offline"><strong>Continuar offline <span aria-hidden="true">→</span></strong><small>{offline}</small></Link>}</div>;
}
