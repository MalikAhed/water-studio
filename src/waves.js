import * as THREE from 'three';

// Restore the lagoon's continuous ocean motion and short-lived ripple rings.
// Keep the newer water renderer's RGBA layout: height, unused, normal.x, normal.z.
const waveFunction=/* glsl */ `
float heightAtWorld(vec2 p){
  vec2 q=p;
  float height=0.,amplitude=.28,frequency=.6,weight=1.;
  for(int i=0;i<4;i++){
    float layer=float(i);
    vec2 direction=vec2(sin(layer*2.399+1.1),cos(layer*2.399+1.1));
    float phase=dot(q,direction)*frequency+uTime*(.72+layer*.18);
    height+=(exp(sin(phase)-1.)-.46)*amplitude*weight;
    q+=direction*cos(phase)*amplitude*.65;
    frequency*=1.85;amplitude*=.52;weight=mix(.45,1.35,uDetail);
  }
  height*=uWaves*.52;
  for(int i=0;i<12;i++){
    float age=uTime-uRipples[i].z;
    if(uRipples[i].z>=0.&&age>=0.&&age<9.){
      float distanceFromCenter=length(p-uRipples[i].xy);
      float ring=distanceFromCenter-age*1.7;
      // Filter frequencies near the field's texel limit to keep rings smooth.
      float frequency=6.;
      float fade=exp(-age*.38)*(1.-smoothstep(7.,9.,age));
      height+=sin(ring*frequency)*exp(-ring*ring*1.4)*fade*uRipples[i].w;
    }
  }
  return height;
}
`;

export function createWaveField(renderer){
  const size=256,span=96;
  const target=new THREE.WebGLRenderTarget(size,size,{type:THREE.HalfFloatType,depthBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
  const origin=new THREE.Vector2(),scene=new THREE.Scene(),camera=new THREE.Camera();
  const uniforms={uTime:{value:0},uWaves:{value:1.5},uDetail:{value:1},uOrigin:{value:origin},uRipples:{value:Array.from({length:12},()=>new THREE.Vector4(0,0,-100,0))}};
  const material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 coord;void main(){coord=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`precision highp float;varying vec2 coord;uniform float uTime,uWaves,uDetail;uniform vec2 uOrigin;uniform vec4 uRipples[12];
      ${waveFunction}
      void main(){
        float height=heightAtWorld(uOrigin+(coord-.5)*96.);
        vec3 normal=normalize(vec3(-dFdx(height)*256./96.,1.,-dFdy(height)*256./96.));
        gl_FragColor=vec4(height,0.,normal.x,normal.z);
      }`});
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);scene.add(quad);
  let previous='',revision=0;
  return {
    texture:target.texture,target,origin,
    reset(){previous='';},
    diagnostics(){return {motion:'continuous-ocean',size,revision,lighting:false};},
    render(source){
      const pos=source.uCameraPosition.value;
      // The field follows the swimmer; the waves remain anchored to world space.
      // Integral texel shifts keep sampling identical where the fields overlap.
      if(Math.abs(pos.x-origin.x)>18)origin.x=Math.round(pos.x/12)*12;
      if(Math.abs(pos.z-origin.y)>18)origin.y=Math.round(pos.z/12)*12;
      uniforms.uTime.value=source.uTime.value;
      uniforms.uWaves.value=source.uWaves.value;
      uniforms.uDetail.value=source.uDetail.value;
      uniforms.uRipples.value=source.uRipples.value;
      const signature=[source.uTime.value,source.uWaves.value,source.uDetail.value,origin.x,origin.y,...source.uRipples.value.flatMap(r=>r.toArray())].join(',');
      if(signature===previous)return;
      const savedTarget=renderer.getRenderTarget();
      renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.setRenderTarget(savedTarget);
      previous=signature;revision++;
    },
    dispose(){target.dispose();quad.geometry.dispose();material.dispose();}
  };
}
