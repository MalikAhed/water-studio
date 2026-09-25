import * as THREE from 'three';
import { addCaustics } from './caustics.js';

// Tileable albedo, micro-height and roughness maps, shared by all matching assets.
const textureSets=new Map();
const fract=x=>x-Math.floor(x);
const hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453);
const smooth=(a,b,v)=>{const t=THREE.MathUtils.clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
function cell(u,v,n){const x=u*n,y=v*n,ix=Math.floor(x),iy=Math.floor(y);let first=9,second=9;
  for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const xx=ix+i,yy=iy+j,dx=x-xx-.2-hash(xx,yy)*.6,dy=y-yy-.2-hash(yy+19,xx)*.6,d=dx*dx+dy*dy;if(d<first){second=first;first=d;}else if(d<second)second=d;}
  return [Math.sqrt(first),Math.sqrt(second)-Math.sqrt(first)];
}
export function detailTextures(kind){
  if(textureSets.has(kind))return textureSets.get(kind);
  const size=256,albedo=new Uint8Array(size*size*4),height=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,n=hash(x,y);let shade=.86,h=.5,r=.7;
    if(kind==='leaf'){
      const rib=Math.exp(-Math.pow((u-.5)*100,2)),veins=Math.pow(.5+.5*Math.cos((v+Math.abs(u-.5)*.55)*Math.PI*36),22);
      const edge=smooth(0,.1,u)*smooth(0,.1,1-u),mottle=.5+.5*Math.sin(u*65+Math.sin(v*22)*2);
      shade=.67+.2*edge+.13*veins+.17*rib+.05*mottle;h=.3+.26*veins+.4*rib+n*.05;r=.52+veins*.2;
    }else if(kind==='shell'){
      const [d,gap]=cell(u,v,7),seam=1-smooth(.015,.052,gap),rings=.5+.5*Math.sin(d*100);
      shade=.72+.16*rings-seam*.42+n*.04;h=.55-seam*.42+rings*.06;r=.43+seam*.35;
    }else if(kind==='scales'||kind==='skin'){
      const count=kind==='scales'?32:19,row=Math.floor(v*count),dx=fract(u*count+(row%2)*.5)-.5,dy=fract(v*count)-.48,d=Math.sqrt(dx*dx+dy*dy*1.35),rim=smooth(.34,.47,d);
      shade=.82-rim*.22+(.5-d)*.25+n*.06;h=(1-rim)*.5+n*.08;r=.3+rim*.3;
    }else if(kind==='sponge'){
      const [d]=cell(u,v,22),pore=1-smooth(.075,.17,d),lip=Math.exp(-Math.pow((d-.18)*38,2));
      shade=.82-pore*.55+lip*.14+n*.08;h=.54-pore*.45+lip*.13+n*.08;r=.85;
    }else if(kind==='coral'){
      const [d]=cell(u,v,17),polyp=Math.exp(-Math.pow((d-.17)*25,2));shade=.73+polyp*.23+n*.08;h=.3+polyp*.45;r=.76;
    }else if(kind==='wood'){
      const grain=.5+.5*Math.sin(u*210+Math.sin(v*14)*2+Math.sin(u*35+v*5)*3),fine=.5+.5*Math.sin(u*760+Math.sin(v*35));
      shade=.68+grain*.22+fine*.06;h=.38+grain*.2+fine*.07;r=.66+grain*.16;
    }else if(kind==='fin'){
      const rays=Math.pow(.5+.5*Math.sin((u*.6+v)*160),16);shade=.72+rays*.26;h=.3+rays*.35;r=.35;
    }else if(kind==='jelly'){
      const canal=Math.pow(.5+.5*Math.cos(u*Math.PI*24),28);shade=.86+canal*.14;h=.45+canal*.25+n*.03;r=.12;
    }else{shade=.8+n*.16;h=.4+n*.2;}
    const k=(y*size+x)*4;
    for(let c=0;c<3;c++){albedo[k+c]=Math.min(255,Math.max(0,shade*255));height[k+c]=Math.min(255,Math.max(0,h*255));rough[k+c]=r*255;}
    albedo[k+3]=height[k+3]=rough[k+3]=255;
  }
  function texture(data,color=false){const t=new THREE.DataTexture(data,size,size);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=4;if(color)t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;}
  const set={map:texture(albedo,true),bumpMap:texture(height),roughnessMap:texture(rough)};textureSets.set(kind,set);return set;
}
export function detailedMaterial(color,kind='coral',caustics=null,extra={}){
  const {clearcoat,clearcoatRoughness,iridescence,iridescenceIOR,...standardExtra}=extra;
  const jelly=kind==='jelly';
  const Material=jelly?THREE.MeshPhysicalMaterial:THREE.MeshStandardMaterial;
  const textures=detailTextures(kind);
  const mat=new Material({color,map:textures.map,bumpMap:textures.bumpMap,bumpScale:kind==='leaf'?.018:kind==='sponge'?.035:.014,roughness:kind==='leaf'?.65:.7,side:THREE.DoubleSide,
    ...(jelly?extra:standardExtra)});
  if(caustics)addCaustics(mat,caustics);return mat;
}
export function swayMaterial(mat,time,amount=.13){
  const prior=mat.onBeforeCompile,key=mat.customProgramCacheKey();mat.customProgramCacheKey=()=>key+'-sway-'+amount;
  mat.onBeforeCompile=shader=>{prior.call(mat,shader);shader.uniforms.uSwayTime=time;
    shader.vertexShader='uniform float uSwayTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      float swayWeight=uv.y*uv.y;
      transformed.x+=sin(uSwayTime*1.15+position.z*.65+position.y)*swayWeight*${amount.toFixed(3)};
      transformed.z+=cos(uSwayTime*.85+position.x*.8)*swayWeight*${(amount*.65).toFixed(3)};`);
  };return mat;
}
export const materialDiagnostics=()=>({textureFamilies:textureSets.size,textureMaps:textureSets.size*3});
