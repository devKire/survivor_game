import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { diagnostics } from '../../src/game/client/diagnostics';
import 'dotenv/config';
import { db } from '../../src/server/db';
const counts = process.env.QA_PLAYERS ? [Number(process.env.QA_PLAYERS)] : [2,5];
for (const count of counts) test(`V16/V17 stability ${count} clients`, async ({ browser }) => {
  const seconds = Number(process.env.QA_SECONDS || 60);
  test.setTimeout((seconds + 240) * 1000);
  const prefix = 'stability_' + randomUUID().slice(0,6);
  const contexts = await Promise.all(Array.from({length:count}, () => browser.newContext()));
  const errors: string[] = [];
  const pages = await Promise.all(contexts.map(async context => {
    await context.addInitScript(() => sessionStorage.setItem('limiar.diagnostics','1'));
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if(m.type()==='error') errors.push(m.text()); });
    return page;
  }));
  try {
    for (const [i,p] of pages.entries()) {
      await p.goto('/register');
      await p.getByLabel('Nome de usuário').fill(prefix+'_'+i);
      await p.getByLabel('E-mail').fill(prefix+'_'+i+'@example.test');
      await p.getByLabel('Senha',{exact:true}).fill('Stability-secure-2026');
      await p.getByLabel('Confirmar senha').fill('Stability-secure-2026');
      await p.getByRole('button',{name:'CRIAR CONTA',exact:true}).click();
      await expect(p.getByText('Online',{exact:true})).toBeVisible();
    }
    await pages[0].getByRole('button',{name:'CRIAR EQUIPE',exact:true}).click();
    const codeNode = pages[0].locator('p').filter({has:pages[0].getByRole('button',{name:'Copiar código'})}).locator('strong');
    await expect(codeNode).toBeVisible();
    const code = await codeNode.innerText();
    for (const p of pages.slice(1)) {
      await p.getByLabel('CÓDIGO DA EQUIPE').fill(code);
      await p.getByRole('button',{name:'ENTRAR',exact:true}).click();
      await expect(p.getByText('Online',{exact:true})).toBeVisible();
      await expect(p.getByRole('button',{name:'PRONTO',exact:true})).toBeVisible();
    }
    await expect(pages[0].getByText(`${count} / 5`,{exact:true})).toBeVisible();
    for(const p of pages) await p.getByRole('button',{name:'PRONTO',exact:true}).click();
    const start = pages[0].getByRole('button',{name:'INICIAR EXPEDIÇÃO',exact:true});
    await expect(start).toBeEnabled();
    await start.click();
    for(const p of pages) await expect(p.locator('.party-hud')).toBeVisible();
    const started = Date.now();
    for(let elapsed=0; elapsed<seconds; elapsed+=10) {
      await pages[0].keyboard.down(elapsed%20 ? 'a':'d');
      await pages[0].waitForTimeout(Math.min(10,seconds-elapsed)*1000);
      await pages[0].keyboard.up('a'); await pages[0].keyboard.up('d');
      if(elapsed===10) {
        await pages[0].keyboard.press('Enter');
        await pages[0].getByLabel('Mensagem').fill('Teste de estabilidade');
        await pages[0].getByRole('button',{name:'Enviar',exact:true}).click();
        await pages[0].keyboard.press('Escape');
      }
    }
    const metrics = await Promise.all(pages.map(p => p.evaluate(() => {
      const d = (window as unknown as {limiarDiagnostics: typeof diagnostics}).limiarDiagnostics;
      const f = [...d.frames].sort((a,b)=>a-b);
      return {...d, frames:undefined, fps:1000/(f.reduce((a,b)=>a+b,0)/f.length), low1:1000/f[Math.floor(f.length*.99)]};
    })));
    writeFileSync(`docs/stability-${process.env.STABILITY_BASELINE ? 'baseline' : 'after'}-${count}-${process.env.QA_ENEMIES || 'natural'}.json`, JSON.stringify({seconds:(Date.now()-started)/1000, metrics, errors},null,2));
    if (!process.env.STABILITY_BASELINE) for(const d of metrics) {
      expect(d.remoteGameInstances).toBe(1); expect(d.rafLoops).toBe(1);
      expect(d.resyncRequests).toBe(0); expect(d.canvasResizes).toBeLessThanOrEqual(2);
    }
    expect(errors).toEqual([]);
    await pages[0].screenshot({path:`docs/stability-${count}.png`});
  } finally {
    await Promise.all(contexts.map(c=>c.close()));
    const users = await db().user.findMany({where:{username:{startsWith:prefix}}});
    const ids = users.map(u=>u.id);
    const memberships = await db().teamMember.findMany({where:{userId:{in:ids}}});
    const teamIds = memberships.map(m=>m.teamId);
    await db().gameSession.deleteMany({where:{teamId:{in:teamIds}}});
    await db().team.deleteMany({where:{id:{in:teamIds}}});
    await db().user.deleteMany({where:{id:{in:ids}}});
    await db().$disconnect();
  }
});
