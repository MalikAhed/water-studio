import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/wave-test.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Water motion check</title>'}));
 await page.goto('http://localhost:4174/wave-test.html');
 const result=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {createWaveField}=await import('/src/waves.js');
  const renderer=new THREE.WebGLRenderer();renderer.setSize(16,16);
  const source={uTime:{value:0},uWaves:{value:.65},uDetail:{value:.55},uCameraPosition:{value:new THREE.Vector3()},uRipples:{value:Array.from({length:12},()=>new THREE.Vector4(0,0,-100,0))}};
  const field=createWaveField(renderer);
  const read=()=>{const p=new Uint16Array(256*256*4);renderer.readRenderTargetPixels(field.target,0,0,256,256,p);return Array.from(p,THREE.DataUtils.fromHalfFloat);};
  const sample=t=>{source.uTime.value=t;field.render(source);return read();};
  const difference=(a,b)=>a.reduce((sum,v,i)=>sum+(i%4===0?Math.abs(v-b[i]):0),0)/(256*256);
  const start=sample(0),moving=sample(1),later=sample(60),laterMoving=sample(61);
  const beforePause=field.diagnostics().revision;field.render(source);const paused=field.diagnostics().revision===beforePause;
  source.uWaves.value=.325;const lower=sample(61);let heightScaleError=0;
  for(let i=0;i<lower.length;i+=4)heightScaleError=Math.max(heightScaleError,Math.abs(lower[i]-laterMoving[i]*.5));
  source.uWaves.value=.65;source.uDetail.value=.1;const smooth=sample(61);source.uDetail.value=.9;const detailed=sample(61);source.uDetail.value=.55;
  const beforeMove=sample(61);source.uCameraPosition.value.x=24;field.render(source);const shifted=read();let shiftError=0;
  for(let y=40;y<210;y++)for(let x=70;x<200;x++)shiftError=Math.max(shiftError,Math.abs(beforeMove[(y*256+x)*4]-shifted[(y*256+x-64)*4]));
  source.uCameraPosition.value.x=0;source.uWaves.value=0;source.uRipples.value[0].set(0,0,0,.28);
  const ringStats=t=>{
    const p=sample(t);let energy=0,radius=0,peak=0;
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      const height=p[(y*256+x)*4],weight=height*height;
      energy+=weight;radius+=weight*Math.hypot((x+.5-128)*.375,(y+.5-128)*.375);peak=Math.max(peak,Math.abs(height));
    }
    return {energy,radius:radius/Math.max(energy,1e-20),peak};
  };
  const earlyRing=ringStats(.8),lateRing=ringStats(2.5),expiredRing=ringStats(9);
  source.uRipples.value.forEach(r=>r.z=-100);source.uWaves.value=.65;field.reset();const reset=sample(0);
  for(let i=1;i<=30;i++)sample(i/30);const cadence=read();
  field.dispose();renderer.dispose();
  return {initialMotion:difference(start,moving),ongoingMotion:difference(later,laterMoving),paused,heightScaleError,detailChange:difference(smooth,detailed),shiftError,earlyRing,lateRing,expiredRing,resetDifference:difference(start,reset),cadenceDifference:difference(moving,cadence),finite:[start,moving,shifted].every(p=>p.every(Number.isFinite))};
 });
 assert(result.initialMotion>.002,'Ocean moves without input');assert(result.ongoingMotion>.002,'Ocean does not decay into a still pool');assert(result.paused);assert(result.heightScaleError<.0001,'Wave-height control scales once');assert(result.detailChange>.001);assert(result.shiftError<.0001,'Camera motion must not move the waves');assert(result.lateRing.radius>result.earlyRing.radius+2);assert(result.lateRing.radius<5);assert(result.lateRing.peak<result.earlyRing.peak,'Ripples fade as they spread');assert.equal(result.expiredRing.energy,0);assert(result.resetDifference<.0001);assert(result.cadenceDifference<.0001);assert(result.finite);assert.deepEqual(errors,[]);
 console.log('Continuous ocean motion, controls, pause, world anchoring, ripple speed/decay, reset and cadence: passed',JSON.stringify(result));
}finally{await browser.close();}
