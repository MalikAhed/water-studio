import * as THREE from 'three';
import { createLagoon } from './lagoon.js';
import { terrainHeight } from './terrain.js';
import { createWaveField } from './waves.js';
import { materialDiagnostics } from './materials.js';
import { createNavigation } from './navigation.js';
const canvas = document.querySelector('#water');
let renderer;
try { renderer = new THREE.WebGLRenderer({canvas, antialias:false, preserveDrawingBuffer:true}); }
catch(e) { document.querySelector('#toast').textContent = 'WebGL is unavailable. Please enable hardware acceleration and reload.'; document.querySelector('#toast').classList.add('show'); throw e; }
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.03;
const lagoon=createLagoon(renderer);
const waveField=createWaveField(renderer);
const scene = new THREE.Scene();
const camera = new THREE.Camera();
const uniforms = {
 uWaveField:{value:waveField.texture},uWaveOrigin:{value:waveField.origin},uReflectionDepth:{value:lagoon.reflectionDepth},uInverseReflectionMatrix:{value:lagoon.inverseReflectionMatrix},uUnderwater:{value:lagoon.texture}, uSceneDepth:{value:lagoon.depth}, uReflection:{value:lagoon.reflection},
 uViewProjection:{value:lagoon.viewProjection},uInverseProjection:{value:lagoon.inverseProjection},uCameraMatrix:{value:lagoon.cameraMatrix},uReflectionMatrix:{value:lagoon.reflectionMatrix}, uTime:{value:0}, uResolution:{value:new THREE.Vector2()}, uWaves:{value:1.5},uDetail:{value:1},
 uCameraPosition:{value:new THREE.Vector3(0,5.2,8)},uTheme:{value:0},uYaw:{value:0},uPitch:{value:.12},uHeight:{value:5.2},
 uRipples:{value:Array.from({length:12},()=>new THREE.Vector4(0,0,-100,0))}
};
const vertexShader=`varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const fragmentShader=`
precision highp float;
varying vec2 vUv;
uniform sampler2D uUnderwater,uSceneDepth,uReflection,uReflectionDepth,uWaveField;
uniform vec2 uWaveOrigin;
uniform mat4 uInverseReflectionMatrix;
uniform mat4 uInverseProjection,uCameraMatrix,uReflectionMatrix,uViewProjection;
uniform vec2 uResolution;
uniform vec3 uCameraPosition;
uniform float uTime,uWaves,uDetail,uTheme,uYaw,uPitch,uHeight;
uniform vec4 uRipples[12];
const float PI=3.14159265;
vec3 sunDir(){return normalize(vec3(-.48, mix(.82,.13,min(uTheme,1.)), -1.3));}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
vec3 sky(vec3 rd){
 float h=max(rd.y,0.);float sunset=1.-abs(uTheme-1.);float night=max(uTheme-1.,0.);
 vec3 horizon=mix(vec3(.27,.55,.72),vec3(.87,.34,.12),sunset);
 vec3 zenith=mix(vec3(.035,.19,.43),vec3(.13,.16,.32),sunset);
 horizon=mix(horizon,vec3(.035,.065,.13),night);zenith=mix(zenith,vec3(.004,.012,.035),night);
 vec3 col=mix(horizon,zenith,smoothstep(0.,.8,pow(h,.52)));
 float s=max(dot(rd,sunDir()),0.);
 vec3 light=mix(vec3(1.,.94,.74),vec3(1.,.45,.16),sunset);light=mix(light,vec3(.55,.72,1.),night);
 // Broad sky illumination only: no sun disc or water glare.
 col+=light*pow(s,24.)*.055;
 // A thin atmospheric band preserves a distinct horizon without a white bloom.
 col+=vec3(.09,.10,.09)*exp(-h*45.)*(1.-night);
 if(h>.015){
   vec2 cloudUV=rd.xz/(h+.14)*1.8+vec2(uTime*.004,0.);
   float cloud=noise(cloudUV)*.58+noise(cloudUV*2.1)*.28+noise(cloudUV*4.3)*.14;
   float density=smoothstep(.58,.77,cloud)*smoothstep(.018,.1,h)*(1.-smoothstep(.35,.8,h));
   col=mix(col,mix(vec3(.74,.83,.86),vec3(.12,.16,.23),night),density*.7);
 }
 return col;
}
float waveCoverage(vec2 q){return 1.-smoothstep(.38,.49,max(abs(q.x-.5),abs(q.y-.5)));}
float heightAt(vec2 p){vec2 q=(p-uWaveOrigin)/96.+.5;return texture2D(uWaveField,clamp(q,.001,.999)).r*waveCoverage(q);}
vec3 waterNormal(vec2 p){
 vec2 q=(p-uWaveOrigin)/96.+.5;
 // Evan Wallace's iterative normal lookup gives the simulated ripples a peaked crest.
 vec4 info=texture2D(uWaveField,clamp(q,.001,.999));
 for(int i=0;i<5;i++){q+=info.ba*.005*mix(.35,1.35,uDetail);info=texture2D(uWaveField,clamp(q,.001,.999));}
 vec2 slope=info.ba*waveCoverage(q);
 return normalize(vec3(slope.x,sqrt(max(.01,1.-dot(slope,slope))),slope.y));
}
vec3 worldAt(vec2 uv, float depth){
 vec4 view=uInverseProjection*vec4(uv*2.-1.,depth*2.-1.,1.);
 return (uCameraMatrix*vec4(view.xyz/view.w,1.)).xyz;
}
void main(){
 vec2 uv=(gl_FragCoord.xy*2.-uResolution)/uResolution.y;
 vec3 ro=uCameraPosition;
 vec3 rd=normalize(vec3(uv.x,uv.y-.28,-1.65));
 float cp=cos(uPitch),sp=sin(uPitch);rd.yz=mat2(cp,-sp,sp,cp)*rd.yz;
 float cy=cos(uYaw),sy=sin(uYaw);rd.xz=mat2(cy,-sy,sy,cy)*rd.xz;
 vec3 col=sky(rd);
 float sceneDepth=texture2D(uSceneDepth,vUv).r;
 vec3 scenePosition=worldAt(vUv,sceneDepth);
 float sceneDistance=length(scenePosition-ro);
 vec3 sceneColor=texture2D(uUnderwater,vUv).rgb;
 if(sceneDepth<.999999)col=sceneColor;
 if(ro.y<heightAt(ro.xz)){
   // A slight moving lens distortion retains detail and scales with water motion.
   vec2 lens=vec2(sin(vUv.y*13.+uTime*.85),cos(vUv.x*15.-uTime*.7))*.0009*uWaves;
   vec2 wetUV=clamp(vUv+lens,.001,.999);
   float wetDepth=texture2D(uSceneDepth,wetUV).r;
   vec3 wetPosition=worldAt(wetUV,wetDepth);
   float path=wetDepth<.999999?length(wetPosition-ro):95.;
   vec3 fog=mix(vec3(.015,.26,.34),vec3(.006,.038,.075),max(0.,uTheme-1.));
   vec3 absorption=vec3(.095,.033,.022);
   vec3 transmission=exp(-absorption*path);
   col=texture2D(uUnderwater,wetUV).rgb*transmission+fog*(1.-transmission);
   if(rd.y>.005){
     float lo=0.,hi=min((-ro.y+1.)/rd.y,400.),t=0.;
     float hlo=ro.y-heightAt(ro.xz),hhi=ro.y+rd.y*hi-heightAt((ro+rd*hi).xz);
     for(int j=0;j<6;j++){
       t=mix(lo,hi,clamp(-hlo/max(hhi-hlo,.00001),.04,.96));
       vec3 hit=ro+rd*t;float delta=hit.y-heightAt(hit.xz);
       if(delta<0.){lo=t;hlo=delta;}else{hi=t;hhi=delta;}
     }
     if(sceneDepth>=.999999 || sceneDistance>t+.015){
       vec3 hit=ro+rd*t;
       vec3 n=waterNormal(hit.xz);
       vec3 intoAir=refract(rd,-n,1.333);
       float cosine=clamp(dot(rd,n),0.,1.);
       float sinTransmitted2=1.333*1.333*(1.-cosine*cosine);
       float reflectionAmount=1.;
       vec3 through=fog;
       if(sinTransmitted2<1.){
         float ct=sqrt(1.-sinTransmitted2);
         float rs=(1.333*cosine-ct)/(1.333*cosine+ct);
         float rp=(cosine-1.333*ct)/(cosine+1.333*ct);
         reflectionAmount=(rs*rs+rp*rp)*.5;
         through=sky(intoAir);
         // Trace the refracted ray through the captured scene to show the island
         // and wooden structures through the rippling underside of the surface.
         for(int j=0;j<12;j++){
           float distanceAlong=.18+float(j)*float(j)*.5;
           vec3 samplePosition=hit+intoAir*distanceAlong;
           vec4 projected=uViewProjection*vec4(samplePosition,1.);
           vec2 q=projected.xy/projected.w*.5+.5;
           if(projected.w<=0.||q.x<.002||q.x>.998||q.y<.002||q.y>.998)break;
           float d=texture2D(uSceneDepth,q).r;
           vec3 objectPosition=worldAt(q,d);
           float separation=length(samplePosition-ro)-length(objectPosition-ro);
           if(d<.999999&&objectPosition.y>-.03&&separation>0.&&separation<.3+distanceAlong*.08){through=texture2D(uUnderwater,q).rgb;break;}
         }
       }
       // Trace the actual reflected ray using the mirrored camera's depth.
       // Its full underwater segment must absorb light too; a flat screen offset
       // omits this distance and produces a bright, pasted-on seabed overhead.
       vec3 reflectedRay=reflect(rd,-n);
       float reflectedDistance=reflectedRay.y<-.015?clamp((-3.25-hit.y)/reflectedRay.y,.1,90.):35.;
       vec2 reflectedUV=vec2(-1.);float reflectionDepth=1.;vec3 reflectedObject=hit;
       for(int j=0;j<4;j++){
         vec4 projected=uReflectionMatrix*vec4(hit+reflectedRay*reflectedDistance,1.);
         reflectedUV=projected.xy/projected.w*.5+.5;
         if(projected.w<=0.||reflectedUV.x<.003||reflectedUV.x>.997||reflectedUV.y<.003||reflectedUV.y>.997){reflectionDepth=1.;break;}
         reflectionDepth=texture2D(uReflectionDepth,reflectedUV).r;
         if(reflectionDepth>=.999999)break;
         vec4 w=uInverseReflectionMatrix*vec4(reflectedUV*2.-1.,reflectionDepth*2.-1.,1.);
         reflectedObject=w.xyz/w.w;
         reflectedDistance=max(.02,dot(reflectedObject-hit,reflectedRay));
       }
       vec3 reflectedColor=fog;
       if(reflectionDepth<.999999&&reflectedObject.y<.05){
         float miss=length(cross(reflectedObject-hit,reflectedRay));
         float edge=min(min(reflectedUV.x,1.-reflectedUV.x),min(reflectedUV.y,1.-reflectedUV.y));
         float valid=(1.-smoothstep(.25,1.5,miss))*smoothstep(.003,.055,edge);
         vec2 pixel=1./(uResolution*.5);
         vec3 mirrored=(texture2D(uReflection,reflectedUV+pixel*.35).rgb+texture2D(uReflection,reflectedUV-pixel*.35).rgb)*.5;
         vec3 reflectedAbsorption=exp(-absorption*reflectedDistance);
         reflectedColor=mix(fog,mirrored*reflectedAbsorption+fog*(1.-reflectedAbsorption),valid);
       }
       vec3 surface=mix(through,reflectedColor,reflectionAmount);
       vec3 waterPath=exp(-absorption*t);
       col=surface*waterPath+fog*(1.-waterPath);
     }
   }
 }else if(rd.y<-.006){
  float lo=0.;float hi=min((ro.y+2.)/-rd.y,650.);float t=0.;
  float hlo=ro.y-heightAt(ro.xz);float hhi=ro.y+rd.y*hi-heightAt((ro+rd*hi).xz);
  for(int j=0;j<6;j++){
   t=mix(lo,hi,clamp(hlo/(hlo-hhi),.05,.95));vec3 p=ro+rd*t;
   float delta=p.y-heightAt(p.xz);
   if(delta>0.){lo=t;hlo=delta;}else{hi=t;hhi=delta;}
  }
  vec3 p=ro+rd*t;
  float distantCalm=1.-smoothstep(28.,180.,t)*.91;
  vec3 n=waterNormal(p.xz);n=normalize(vec3(n.x*distantCalm,n.y,n.z*distantCalm));
  vec3 reflected=reflect(rd,n);
  float cosine=clamp(dot(-rd,n),0.,1.);
  float ct=sqrt(max(0.,1.-(1./(1.333*1.333))*(1.-cosine*cosine)));
  float rs=(cosine-1.333*ct)/(cosine+1.333*ct);
  float rp=(1.333*cosine-ct)/(1.333*cosine+ct);
  float fresnel=(rs*rs+rp*rp)*.5;
  float sunset=1.-abs(uTheme-1.);float night=max(uTheme-1.,0.);
  if(sceneDepth>=.999999 || sceneDistance>t+.02){
    // Project the change from a flat-water ray to the simulated normal's
    // Snell ray. Relative sampling avoids inventing offscreen scene data.
    vec3 flatRay=refract(rd,vec3(0.,1.,0.),1./1.333);
    vec3 refractedRay=refract(rd,n,1./1.333);
    float refractedDistance=clamp((min(scenePosition.y,-.1)-p.y)/min(flatRay.y,-.01),.05,50.);
    vec4 flatPoint=uViewProjection*vec4(p+flatRay*refractedDistance,1.);
    vec4 bentPoint=uViewProjection*vec4(p+refractedRay*refractedDistance,1.);
    vec2 distortion=(bentPoint.xy/bentPoint.w-flatPoint.xy/flatPoint.w)*.5;
    distortion*=min(1.,.035/max(length(distortion),.00001));
    float edge=min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y));
    vec2 refractedUV=clamp(vUv+distortion*smoothstep(.005,.07,edge),.001,.999);
    float bottomDepth=texture2D(uSceneDepth,refractedUV).r;
    vec3 bottomPosition=worldAt(refractedUV,bottomDepth);
    if(bottomPosition.y>p.y-.035){refractedUV=vUv;bottomPosition=scenePosition;bottomDepth=sceneDepth;}
    vec3 bottom=texture2D(uUnderwater,refractedUV).rgb;
    float path=bottomDepth<.999999?length(bottomPosition-p):80.;
    vec3 absorption=exp(-vec3(.095,.033,.022)*path);
    vec3 waterColor=mix(vec3(.035,.48,.53),vec3(.014,.06,.105),night);
    vec3 transmitted=bottom*absorption+waterColor*(1.-absorption);
    vec4 reflectedPoint=uReflectionMatrix*vec4(p,1.);
    vec2 reflectedUV=reflectedPoint.xy/reflectedPoint.w*.5+.5+n.xz*.016;
    vec4 reflectedScene=texture2D(uReflection,clamp(reflectedUV,.001,.999));
    vec3 reflectedColor=mix(sky(reflected),reflectedScene.rgb,reflectedScene.a);
    float reflection=fresnel;
    col=mix(transmitted,reflectedColor,reflection);
    // A narrow, broken wash marks shallow beach and rock intersections.
    float depth=max(0.,p.y-bottomPosition.y);
    float wash=sin(depth*19.-uTime*1.7+sin(p.x*2.1+p.z)*.55)*.5+.5;
    float foam=(1.-smoothstep(.005,.07,depth))*smoothstep(.45,.85,wash);
    col=mix(col,vec3(.8,.9,.87)*(1.-night*.83),foam*.18);
    col=mix(col,sky(vec3(rd.x,.0,rd.z)),1.-exp(-t*.0018));
  }
 }
 col=max(col,0.);
 gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
const material=new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader});
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
renderer.info.autoReset=false;let renderProfile={};
function renderWater(){renderer.info.reset();const start=performance.now();waveField.render(uniforms);uniforms.uWaveField.value=waveField.texture;lagoon.render(uniforms);renderer.render(scene,camera);renderProfile={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,cpuMs:Math.round(performance.now()-start),textures:renderer.info.memory.textures};}
// Keep the requested full render scale, including on slower devices.
const renderScale=1;
function resize(){renderer.setPixelRatio((devicePixelRatio||1)*renderScale);renderer.setSize(innerWidth,innerHeight);renderer.getDrawingBufferSize(uniforms.uResolution.value);}
resize();addEventListener('resize',resize);
let speed=2,paused=false,rain=false,theme=0,nextRipple=0,last=performance.now(),frames=0,fpsTime=last;
const sliders=['waves','speed','detail'];
function updateSlider(id){const el=document.getElementById(id);const v=+el.value;document.getElementById(id+'-value').textContent=v.toFixed(2);el.style.background=`linear-gradient(to right,#cdddbd ${(v-el.min)/(el.max-el.min)*100}%,#ffffff21 0%)`;if(id==='speed')speed=v;else uniforms[id==='waves'?'uWaves':'uDetail'].value=v;}
sliders.forEach(id=>{document.getElementById(id).addEventListener('input',()=>updateSlider(id));updateSlider(id);});
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{theme={day:0,sunset:1,night:2}[button.dataset.preset];document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b===button));}));
function setPause(value){paused=value;document.querySelector('#pause').innerHTML=paused?'▶ <span>Resume</span>':'Ⅱ <span>Pause</span>';document.querySelector('#pause').setAttribute('aria-label',paused?'Resume simulation':'Pause simulation');}
document.querySelector('#pause').onclick=()=>setPause(!paused);
document.querySelector('#rain').onclick=()=>{rain=!rain;document.querySelector('#rain').setAttribute('aria-checked',String(rain));};
document.querySelector('#reset').onclick=()=>{[1.5,2,1].forEach((v,i)=>{document.getElementById(sliders[i]).value=v;updateSlider(sliders[i]);});navigation.reset();theme=0;uniforms.uTheme.value=0;document.querySelector('[data-preset=day]').click();uniforms.uYaw.value=0;uniforms.uPitch.value=.12;uniforms.uHeight.value=5.2;rain=false;document.querySelector('#rain').setAttribute('aria-checked','false');setPause(false);uniforms.uRipples.value.forEach(r=>r.z=-100);uniforms.uTime.value=0;nextRipple=0;rainTimer=0;wakeTimer=0;previousHeight=5.2;waveField.reset();lastSignature='';toast('Back to the lagoon.');};
function ripple(x,z,strength=.2){uniforms.uRipples.value[nextRipple].set(x,z,uniforms.uTime.value,strength);nextRipple=(nextRipple+1)%12;lastSignature="";}
function clickWater(x,y){const uv=new THREE.Vector3((x/innerWidth*2-1)*innerWidth/innerHeight,1-y/innerHeight*2-.28,-1.65).normalize();uv.applyAxisAngle(new THREE.Vector3(1,0,0),-uniforms.uPitch.value);uv.applyAxisAngle(new THREE.Vector3(0,1,0),uniforms.uYaw.value);if(Math.abs(uv.y)>.01){const t=-uniforms.uCameraPosition.value.y/uv.y;if(t<=0)return;ripple(uniforms.uCameraPosition.value.x+uv.x*t,uniforms.uCameraPosition.value.z+uv.z*t,.28);}}
let pointer=null;
canvas.addEventListener('pointerdown',e=>{if(document.pointerLockElement===canvas){clickWater(innerWidth/2,innerHeight/2);return;}pointer={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!pointer)return;if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>5)pointer.moved=true;if(pointer.moved){uniforms.uYaw.value-=(e.clientX-pointer.lastX)*.003;uniforms.uPitch.value=THREE.MathUtils.clamp(uniforms.uPitch.value+(e.clientY-pointer.lastY)*.002,-1.48,1.48);}pointer.lastX=e.clientX;pointer.lastY=e.clientY;});
canvas.addEventListener('pointerup',e=>{if(pointer&&!pointer.moved)clickWater(e.clientX,e.clientY);pointer=null;});canvas.addEventListener('pointercancel',()=>pointer=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();navigation.verticalStep(e.deltaY*.014);},{passive:false});
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2600);}
document.querySelector('#capture').onclick=()=>{renderWater();const a=document.createElement('a');a.download='stillwater.png';a.href=canvas.toDataURL('image/png');a.click();toast('A moment, saved.');};
document.querySelector('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen is unavailable in this browser.');}};
function toggleUI(){document.body.classList.toggle('hidden-ui');}
document.querySelector('#hide').onclick=toggleUI;document.querySelector('#restore').onclick=toggleUI;
addEventListener('keydown',e=>{if(e.target.matches('input,button'))return;if(e.key.toLowerCase()==='h')toggleUI();if(e.code==='Space'){e.preventDefault();setPause(!paused);}});
const navigation=createNavigation(canvas,uniforms,toast);
let rainTimer=0,wakeTimer=0,previousHeight=5.2,lastSignature="";
function animate(now){
 requestAnimationFrame(animate);
 const dt=Math.max(0,Math.min((now-last)/1000,.1));last=now;
 navigation.update(dt);
 const pos=uniforms.uCameraPosition.value,waterDt=paused?0:dt*speed;
 if(waterDt>0){
   uniforms.uTime.value+=waterDt;
   wakeTimer+=waterDt;
   if((pos.y*previousHeight<0)||(Math.abs(pos.y)<.25&&navigation.moving()&&wakeTimer>.22)){
     ripple(pos.x,pos.z,.10);wakeTimer=0;
   }
   rainTimer+=waterDt;
   if(rain&&rainTimer>.13){rainTimer%=.13;ripple(pos.x+(Math.random()-.5)*35,pos.z-Math.random()*40,.11);}
 }
 previousHeight=pos.y;
 uniforms.uTheme.value=THREE.MathUtils.damp(uniforms.uTheme.value,theme,3,dt);
 const signature=[uniforms.uTime.value,uniforms.uTheme.value.toFixed(3),uniforms.uWaves.value,uniforms.uDetail.value,uniforms.uYaw.value,uniforms.uPitch.value,uniforms.uHeight.value,...pos.toArray(),innerWidth,innerHeight,renderScale,lagoon.assetsReady()].join();
 if(signature!==lastSignature){renderWater();lastSignature=signature;}
 frames++;
 if(now-fpsTime>1000){
   document.querySelector('#fps').textContent=`${Math.round(frames*1000/(now-fpsTime))} FPS`;
   frames=0;fpsTime=now;
 }
}
requestAnimationFrame(animate);
// Expose read-only diagnostics for smoke checks.
window.waterDiagnostics=()=>({time:uniforms.uTime.value,paused,rain,theme,waves:uniforms.uWaves.value,speed,detail:uniforms.uDetail.value,programs:renderer.info.programs.length,renderProfile,water:waveField.diagnostics(),...materialDiagnostics(),importedAssets:lagoon.importedAssets(),creatureStates:lagoon.creatureStates(),pitch:uniforms.uPitch.value,fish:lagoon.fishCount,creatures:lagoon.creatures,collisionViolations:lagoon.collisionViolations(),underwater:uniforms.uCameraPosition.value.y<-.08,plants:lagoon.plantCount,rocks:lagoon.rockCount,palms:lagoon.palmCount,assetsReady:lagoon.assetsReady(),ripples:uniforms.uRipples.value.filter(r=>r.z>=0&&uniforms.uTime.value-r.z<9).length,yaw:uniforms.uYaw.value,height:uniforms.uHeight.value,position:uniforms.uCameraPosition.value.toArray(),renderScale});
