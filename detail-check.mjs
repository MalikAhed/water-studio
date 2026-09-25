import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const p=await browser.newPage({viewport:{width:700,height:500}}),errors=[];p.setDefaultTimeout(120000);
p.on('pageerror',e=>{errors.push(e.message);console.log(e.message);});p.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log(m.text().slice(0,500));}});
await p.addInitScript(()=>{window.requestAnimationFrame=cb=>{window.nextWaterFrame=cb;return 1;};});
const shot=async name=>{const [download]=await Promise.all([p.waitForEvent('download',{timeout:120000}),p.locator('#capture').dispatchEvent('click')]);await download.saveAs(`artifacts/${name}.png`);console.log('Captured',name,await p.evaluate(()=>window.waterDiagnostics().renderProfile));};
try{
 await p.goto('http://localhost:4174');await p.waitForFunction(()=>window.waterDiagnostics?.().assetsReady,null,{timeout:90000});
 let d=await p.evaluate(()=>window.waterDiagnostics());assert.equal(d.fish,30);assert.deepEqual(d.importedAssets.errors,[]);assert(d.textureMaps>=24);assert.equal(d.palms,18);
 await shot('expanded-island');
 await p.locator('#water').dispatchEvent('wheel',{deltaY:-490});
 // Level underwater view: inspect transparent jellyfish, modeled fish and reef textures.
 await p.locator('#hide').dispatchEvent('click');
 await p.mouse.move(300,350);await p.mouse.down();await p.mouse.move(300,215);await p.mouse.up();
 await shot('detailed-reef');
 assert((await p.evaluate(()=>window.waterDiagnostics())).underwater);
 await p.mouse.move(300,350);await p.mouse.down();await p.mouse.move(300,90);await p.mouse.up();
 await shot('surface-from-below');
 await p.locator('#restore').dispatchEvent('click');await p.locator('#speed').fill('2');await p.locator('#speed').dispatchEvent('input');
 await p.evaluate(()=>{let now=performance.now();for(let i=0;i<4;i++)window.nextWaterFrame(now+=100);});
 await shot('surface-moving');
 const {readFile}=await import('node:fs/promises');assert(!(await readFile('artifacts/surface-from-below.png')).equals(await readFile('artifacts/surface-moving.png')),'Surface must change with wave motion');
 assert.deepEqual(errors,[]);console.log(JSON.stringify(await p.evaluate(()=>window.waterDiagnostics())));
}finally{await browser.close();}
