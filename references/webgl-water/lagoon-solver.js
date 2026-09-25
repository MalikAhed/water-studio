import * as THREE from 'three';

/*
 * GPU height-field solver ported from WebGL Water, Copyright 2011 Evan Wallace.
 * https://github.com/evanw/webgl-water — MIT, see THIRD_PARTY_NOTICES.md.
 * Original four-neighbour update, velocity damping, cosine drops and normal
 * reconstruction; Three.js replaces LightGL. State = height, velocity, nx, nz.
 */
export function createWaveField(renderer, {ambient=true, seed=true}={}) {
  const size=256, span=96, fixedStep=1/60;
  const options={type:THREE.HalfFloatType,depthBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter};
  let front=new THREE.WebGLRenderTarget(size,size,options),back=front.clone();
  const origin=new THREE.Vector2(),scene=new THREE.Scene(),camera=new THREE.Camera();
  const uniforms={uState:{value:null},uDelta:{value:new THREE.Vector2(1/size,1/size)},uShift:{value:new THREE.Vector2()},uCount:{value:0},uDrops:{value:Array.from({length:24},()=>new THREE.Vector4())}};
  const vertexShader='varying vec2 coord;void main(){coord=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const shader=body=>new THREE.ShaderMaterial({uniforms,vertexShader,depthTest:false,depthWrite:false,fragmentShader:`
    precision highp float;varying vec2 coord;uniform sampler2D uState;uniform vec2 uDelta,uShift;uniform int uCount;uniform vec4 uDrops[24];
    void main(){vec4 info=texture2D(uState,coord);${body}gl_FragColor=info;}`});
  const update=shader(`
    vec2 dx=vec2(uDelta.x,0.0),dy=vec2(0.0,uDelta.y);
    float average=(texture2D(uState,coord-dx).r+texture2D(uState,coord-dy).r+texture2D(uState,coord+dx).r+texture2D(uState,coord+dy).r)*0.25;
    info.g+=(average-info.r)*2.0;
    info.g*=0.995;
    info.r+=info.g;
    // An open sea uses an absorbing border instead of the demo's pool walls.
    float edge=min(min(coord.x,1.0-coord.x),min(coord.y,1.0-coord.y));
    info.rg*=mix(0.90,1.0,smoothstep(0.0,0.06,edge));`);
  const normals=shader(`
    vec3 dx=vec3(uDelta.x*96.0,texture2D(uState,coord+vec2(uDelta.x,0.0)).r-info.r,0.0);
    vec3 dy=vec3(0.0,texture2D(uState,coord+vec2(0.0,uDelta.y)).r-info.r,uDelta.y*96.0);
    info.ba=normalize(cross(dy,dx)).xz;`);
  const drops=shader(`
    for(int i=0;i<24;i++){
      if(i>=uCount)break;
      float drop=max(0.0,1.0-length(uDrops[i].xy-coord)/uDrops[i].z);
      drop=0.5-cos(drop*3.141592653589793)*0.5;
      info.r+=drop*uDrops[i].w;
    }`);
  const shift=shader(`vec2 q=coord+uShift;info=(q.x<0.0||q.x>1.0||q.y<0.0||q.y>1.0)?vec4(0.0):texture2D(uState,q);`);
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),update);scene.add(quad);
  let initialized=false,lastTime=0,accumulator=0,nextWind=0,windIndex=0,steps=0,revision=0,pendingReset=false;
  const seen=Array(12).fill('');
  function pass(material){uniforms.uState.value=front.texture;quad.material=material;renderer.setRenderTarget(back);renderer.render(scene,camera);[front,back]=[back,front];revision++;}
  function addDrops(list){
    if(!list.length)return;
    uniforms.uCount.value=list.length;
    list.forEach((d,i)=>uniforms.uDrops.value[i].set((d[0]-origin.x)/span+.5,(d[1]-origin.y)/span+.5,d[2]/span,d[3]));
    pass(drops);
  }
  function clear(){
    const color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
    renderer.setClearColor(0,0);
    for(const target of [front,back]){renderer.setRenderTarget(target);renderer.clear();}
    renderer.setClearColor(color,alpha);seen.fill('');accumulator=0;windIndex=0;steps=0;
  }
  return {
    get texture(){return front.texture;},get target(){return front;},origin,
    reset(){pendingReset=true;},
    diagnostics(){return {solver:'evanw-heightfield',size,steps,revision,lighting:false};},
    render(source){
      const savedTarget=renderer.getRenderTarget(),t=source.uTime.value,pos=source.uCameraPosition.value;
      let changed=false;
      if(!initialized||pendingReset){
        origin.set(Math.round(pos.x/12)*12,Math.round(pos.z/12)*12);
        clear();lastTime=t;nextWind=t+.35;
        const seeds=Array.from({length:20},(_,i)=>{const a=i*2.399,r=3+Math.sqrt(i)*4;return [origin.x+Math.sin(a)*r,origin.y+Math.cos(a)*r,1.6+(i%4)*.45,(i%2?1:-1)*.36];});
        if(seed){addDrops(seeds);for(let i=0;i<12;i++){pass(update);steps++;}}
        initialized=true;pendingReset=false;changed=true;
      }
      // Recenter on integral texels so existing waves stay in world coordinates.
      const x=Math.abs(pos.x-origin.x)>18?Math.round(pos.x/12)*12:origin.x;
      const z=Math.abs(pos.z-origin.y)>18?Math.round(pos.z/12)*12:origin.y;
      if(x!==origin.x||z!==origin.y){uniforms.uShift.value.set((x-origin.x)/span,(z-origin.y)/span);pass(shift);origin.set(x,z);changed=true;}
      const incoming=[];
      source.uRipples.value.forEach((r,i)=>{
        const key=r.toArray().join(',');
        if(r.z>=0&&key!==seen[i])incoming.push([r.x,r.y,1.1,r.w]);
        seen[i]=key;
      });
      if(ambient&&t>=nextWind){
        const a=windIndex++*2.399;
        incoming.push([pos.x+Math.sin(a)*15,pos.z+Math.cos(a)*15,2.2,.17*(windIndex%2?1:-1)]);
        nextWind=t+.35;
      }
      if(incoming.length){addDrops(incoming);changed=true;}
      accumulator+=Math.max(0,Math.min(t-lastTime,.2));lastTime=t;
      while(accumulator+1e-8>=fixedStep){pass(update);steps++;accumulator-=fixedStep;changed=true;}
      if(changed)pass(normals);
      renderer.setRenderTarget(savedTarget);
    },
    dispose(){front.dispose();back.dispose();quad.geometry.dispose();[update,normals,drops,shift].forEach(m=>m.dispose());}
  };
}
