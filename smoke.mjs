import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:640,height:480},deviceScaleFactor:1});
  page.setDefaultTimeout(120000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  // Drive the actual animation callback deterministically: SwiftShader is much slower than a GPU.
  await page.addInitScript(()=>{window.requestAnimationFrame=callback=>{window.nextWaterFrame=callback;return 1;};});
  const step=async(count=1)=>page.evaluate(count=>{
    let now=performance.now();
    for(let i=0;i<count;i++)window.nextWaterFrame(now+=100);
  },count);
  const diagnostics=()=>page.evaluate(()=>window.waterDiagnostics());
  await page.goto(process.env.WATER_URL||'http://localhost:4174/',{waitUntil:'load',timeout:60000});
  await page.waitForFunction(()=>window.waterDiagnostics?.().assetsReady,{},{polling:200,timeout:60000});
  await step();
  let state=await diagnostics();
  assert.equal(state.fish,30);assert.equal(state.palms,18);assert.equal(state.rocks,70);assert.equal(state.water.motion,'continuous-ocean');
  await page.locator('#pause').dispatchEvent('click');
  const frozen=(await diagnostics()).time;await step();assert.equal((await diagnostics()).time,frozen);

  // Pausing the water must not prevent free camera travel.
  const before=(await diagnostics()).position;
  await page.keyboard.down('w');await step(3);await page.keyboard.up('w');
  const after=(await diagnostics()).position;assert(after[2]<before[2]-.1,'W moves forward');
  await page.keyboard.down('d');await page.keyboard.down('e');await step(3);
  await page.keyboard.up('d');await page.keyboard.up('e');
  state=await diagnostics();assert(state.position[0]>after[0],'D strafes');assert(state.position[1]>after[1],'E ascends');
  await page.locator('#reset').dispatchEvent('click');
  await page.keyboard.down('q');await step(12);await page.keyboard.up('q');
  state=await diagnostics();assert(state.underwater,'Q dives below the surface');
  assert(state.height > -3,'Diving stops above the seabed');
  assert.equal(state.collisionViolations,0);
  assert.equal(state.creatures.turtles,4);assert.equal(state.creatures.seahorses,7);
  const [diveDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#capture').dispatchEvent('click')]);
  await diveDownload.saveAs('artifacts/underwater.png');
  await page.keyboard.down('e');await step(12);await page.keyboard.up('e');
  assert(!(await diagnostics()).underwater,'E returns above the surface');
  await page.locator('#reset').dispatchEvent('click');
  assert.deepEqual((await diagnostics()).position,[0,5.2,8]);
  await page.locator('#pause').dispatchEvent('click');
  // Mouse drag and click interactions use a clear canvas area.
  await page.locator('#hide').dispatchEvent('click');
  await page.mouse.move(220,250);await page.mouse.down();await page.mouse.move(285,270,{steps:2});await page.mouse.up();
  assert.notEqual((await diagnostics()).yaw,0);
  const beforeClick=(await diagnostics()).water.revision;
  await page.mouse.click(250,350);assert.equal((await diagnostics()).ripples,1);await step();
  assert((await diagnostics()).water.revision>beforeClick,'Clicking paused water refreshes its ripple');
  await page.locator('#restore').dispatchEvent('click');
  await page.locator('#waves').fill('1.2');await page.locator('#waves').dispatchEvent('input');
  await page.locator('#rain').dispatchEvent('click');
  assert.equal((await diagnostics()).waves,1.2);assert.equal((await diagnostics()).rain,true);
  await page.locator('[data-preset=sunset]').dispatchEvent('click');await step(2);
  assert.equal((await diagnostics()).theme,1);
  await page.locator('[data-preset=night]').dispatchEvent('click');await step(2);
  assert.equal((await diagnostics()).theme,2);
  await page.locator('#pause').dispatchEvent('click');
  await page.locator('#speed').fill('0');await page.locator('#speed').dispatchEvent('input');
  const stopped=await diagnostics();await step(3);state=await diagnostics();
  assert.equal(state.time,stopped.time,'Zero flow freezes wave time');
  assert.equal(state.ripples,stopped.ripples,'Zero flow stops automatic rainfall');
  assert.equal(state.water.revision,stopped.water.revision,'Frozen water reuses the cached field');
  await page.locator('#speed').fill('2');await page.locator('#speed').dispatchEvent('input');await step(3);
  state=await diagnostics();assert(state.time>stopped.time,'Flow resumes');assert(state.ripples>stopped.ripples,'Rain resumes with flow');
  await page.locator('#reset').dispatchEvent('click');await page.locator('#pause').dispatchEvent('click');
  assert.equal((await diagnostics()).rain,false);assert.equal((await diagnostics()).waves,1.5);assert.equal((await diagnostics()).time,0);assert.equal((await diagnostics()).ripples,0);

  await page.setViewportSize({width:1100,height:740});
  // Capture through the app's export path, which also ensures a complete render after resize.
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#capture').dispatchEvent('click')]);
  await download.saveAs('artifacts/lagoon-export.png');
  await page.screenshot({path:'artifacts/daylight.png',timeout:60000});
  console.log('Desktop controls, free movement, lighting, export: passed');
  await page.setViewportSize({width:390,height:844});await step();
  await page.screenshot({path:'artifacts/mobile.png',timeout:60000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log('Mobile viewport: passed');
  assert.deepEqual(errors,[],'No browser or shader errors');
  console.log(JSON.stringify({errors,diagnostics:await diagnostics()}));
} finally { await browser.close(); }
