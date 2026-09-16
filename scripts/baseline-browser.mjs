import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
const assets={'/':'index.html','/game.js':'game.js','/style.css':'style.css'};
const server=createServer(async(req,res)=>{const file=assets[req.url];if(!file){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(`baseline/v1.3.0/${file}`));});
await new Promise(resolve=>server.listen(8081,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8081');
 await page.getByRole('button',{name:'INICIAR EXPEDIÇÃO'}).click();
 await page.getByRole('button',{name:'ATRAVESSAR A NÉVOA'}).click();
 await page.getByRole('button',{name:'ESTOU PRONTO'}).click();
 await page.keyboard.down('d');await page.waitForTimeout(1600);await page.keyboard.up('d');await page.keyboard.press('Escape');
 const save=JSON.parse(await page.evaluate(()=>localStorage.getItem('limiar.save.v1')));
 const result={title:await page.title(),saveVersion:save.version,time:save.activeRun.time,x:save.activeRun.x,map:save.activeRun.mapId,character:save.activeRun.character,pause:await page.getByRole('heading',{name:'Travessia suspensa'}).isVisible(),errors};
 await page.screenshot({path:'docs/baseline.png'});
 await writeFile('tests/legacy-save.json',JSON.stringify(save,null,2));
 await writeFile('docs/baseline-result.json',JSON.stringify(result,null,2));
 console.log(result);
 if(errors.length||!result.pause||result.x<=0)process.exitCode=1;
}finally{await browser.close();server.close();}
