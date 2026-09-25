import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { detailedMaterial, swayMaterial } from './materials.js';
import { createCreatures } from './creatures.js';
import { terrainHeight } from './terrain.js';

// Conservative world-space rock bounds include the complete displaced rock surface.
export const rockBounds=[];
export function aquaticFree(p, radius=.55) {
  return p.y < -.25-radius && p.y > terrainHeight(p.x,p.z)+radius &&
    !rockBounds.some(b=>p.x>b.min.x-radius&&p.x<b.max.x+radius&&p.y>b.min.y-radius&&p.y<b.max.y+radius&&p.z>b.min.z-radius&&p.z<b.max.z+radius);
}
export function swimTo(position, target, radius=.55) {
  // Small swept steps prevent tunneling, even when the animation time jumps.
  const delta=target.clone().sub(position),length=delta.length();
  const steps=Math.max(1,Math.ceil(length/.12));delta.divideScalar(steps);
  const next=new THREE.Vector3();
  for(let i=0;i<steps;i++) {
    next.copy(position).add(delta);
    if(aquaticFree(next,radius)){position.copy(next);continue;}
    for(const axis of ['x','z','y']){next.copy(position);next[axis]+=delta[axis];if(aquaticFree(next,radius))position.copy(next);}
  }
}
export function safeSpawn(preferred,radius=.55) {
  if(aquaticFree(preferred,radius))return preferred;
  for(let r=.5;r<35;r+=.5)for(let i=0;i<32;i++){
    const p=new THREE.Vector3(preferred.x+Math.cos(i*Math.PI/16)*r,-1.6,preferred.z+Math.sin(i*Math.PI/16)*r);
    if(aquaticFree(p,radius))return p;
  }
  throw new Error('No free swimming habitat');
}

export function createHabitat(scene,random,caustics=null,time={value:0}) {
  const mats=new Map(), batches=new Map();
  const leafColors=['#247c43','#48ac48','#84c848','#8ed34f','#30aa80'];
  const woodColors=['#af713c','#c18c52','#765032','#c59861','#946337','#b7773e','#d39a58','#88542f','#dfad69','#71472b','#e0b57b','#bd8347'];
  function material(color){if(!mats.has(color)){
    const kind=leafColors.includes(color)?'leaf':woodColors.includes(color)?'wood':['#c36cdd','#e8a4ec','#573871'].includes(color)?'sponge':'coral';
    const m=detailedMaterial(color,kind,caustics);if(kind==='leaf')swayMaterial(m,time,.12);mats.set(color,m);
  }return mats.get(color);}
  const sphere=new THREE.SphereGeometry(1,12,8),bead=new THREE.IcosahedronGeometry(1,0);
  const box=new THREE.BoxGeometry(1,1,1);
  const dummy=new THREE.Object3D();
  function part(parent,geo,color,pos,scale=[1,1,1],rot=[0,0,0]){
    if(parent){const m=new THREE.Mesh(geo,material(color));m.position.set(...pos);m.scale.set(...scale);m.rotation.set(...rot);parent.add(m);return m;}
    dummy.position.set(...pos);dummy.scale.set(...scale);dummy.rotation.set(...rot);dummy.updateMatrix();
    const g=geo.clone().applyMatrix4(dummy.matrix);if(!batches.has(color))batches.set(color,[]);batches.get(color).push(g);
  }
  function ball(parent,color,pos,scale){return part(parent,Math.max(...scale)<.16?bead:sphere,color,pos,scale);}
  function beam(parent,a,b,r,color){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),d=vb.clone().sub(va);
    const geo=new THREE.CylinderGeometry(r*.85,r,d.length(),8);geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));
    const mesh=part(parent,geo,color,va.add(vb).multiplyScalar(.5).toArray());if(!parent)geo.dispose();return mesh;}
  function leaf(x,y,z,a,length,width,color){
    const points=[],uvs=[],indices=[],rows=8,columns=2;
    for(let i=0;i<=rows;i++){const t=i/rows,w=Math.sin(t*Math.PI)*width;
      for(let j=0;j<=columns;j++){const across=j/columns*2-1,fold=Math.abs(across);
        points.push(x+Math.cos(a)*length*t-Math.sin(a)*w*across,
          y+Math.sin(t*Math.PI)*length*.48-t*t*length*.13+.07*(1-fold)*Math.sin(t*Math.PI)+Math.sin(t*40)*fold*.018,
          z+Math.sin(a)*length*t+Math.cos(a)*w*across);uvs.push(j/columns,t);}
      if(i<rows)for(let j=0;j<columns;j++){const n=i*(columns+1)+j;indices.push(n,n+columns+1,n+1,n+1,n+columns+1,n+columns+2);}}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();part(null,geo,color,[0,0,0]);geo.dispose();
  }
  // Layered banana-like leaves and coastal rosettes replace the round shrubs.
  for(let i=0;i<145;i++){
    const x=-33+random()*50,z=-54+random()*29,y=terrainHeight(x,z);if(y<.2)continue;
    const h=.35+random()*.9;beam(null,[x,y,z],[x,y+h,z],.045,'#789d32');
    for(let j=0;j<9;j++)leaf(x,y+h,z,j*2.399,.65+random()*1.15,.14+random()*.15,['#247c43','#48ac48','#84c848'][j%3]);
    if(i%4===0)for(let j=0;j<5;j++)ball(null,'#ff9274',[x+Math.cos(j*1.256)*.12,y+h+.16,z+Math.sin(j*1.256)*.12],[.13,.06,.13]);
  }
  // An arched wooden footbridge runs from the island beach to a lagoon landing.
  const deckY=t=>1.05+Math.sin(t*Math.PI)*.65;
  for(let i=0;i<=40;i++){
    const t=i/40,z=-25+t*15,y=deckY(t);
    part(null,box,i%3===0?'#af713c':'#c18c52',[-9,y,z],[2.4,.14,.27]);
    for(const side of [-1,1]){
      if(i%5===0){beam(null,[-9+side*1.08,terrainHeight(-9+side*1.08,z),z],[-9+side*1.08,y+1.05,z],.085,'#765032');ball(null,'#c59861',[-9+side*1.08,y+1.08,z],[.12,.09,.12]);}
      if(i<40){beam(null,[-9+side*1.08,y+.88,z],[-9+side*1.08,deckY((i+1)/40)+.88,z+.375],.048,'#946337');}
    }
  }
  // Wooden rowboat: curved clinker planks, ribs, bench seats, and crossed oars.
  const boat=new THREE.Group();boat.position.set(-6.7,.14,-11.2);boat.rotation.y=.3;scene.add(boat);
  for(let k=0;k<5;k++)for(const side of [-1,1]){
    const pts=[];for(let i=0;i<=24;i++){const t=i/24;pts.push(new THREE.Vector3(side*Math.sin(Math.PI*t)*(.38+k*.075),-.37+k*.14,-1.8+t*3.6));}
    part(boat,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),32,.085,6,false),k%2?'#b7773e':'#d39a58',[0,0,0]);
  }
  part(boat,box,'#88542f',[0,-.35,0],[.65,.12,2.6]);
  for(const z of [-.85,.15,.95]){part(boat,box,'#dfad69',[0,.12,z],[1.12,.1,.24]);beam(boat,[-.5,-.25,z],[-.64,.17,z],.05,'#71472b');beam(boat,[.5,-.25,z],[.64,.17,z],.05,'#71472b');}
  for(const s of [-1,1]){beam(boat,[-s*.35,.32,-.65],[s*1.65,.25,.9],.045,'#e0b57b');part(boat,box,'#bd8347',[s*1.6,.25,.88],[.26,.065,.68],[0,s*.7,0]);}
  // Rich reef gardens: branching coral, tubular sponges, kelp, fans and anemones.
  let reefs=0;
  const centers=[[-3,0],[3,1],[2,-7],[-11,-5],[10,-9],[-3,-15],[13,-20],[-15,3]];
  for(const [cx,cz] of centers)for(let i=0;i<8;i++){
    const x=cx+(random()-.5)*4,z=cz+(random()-.5)*4,y=terrainHeight(x,z);
    const p=new THREE.Vector3(x,y+.65,z);if(!aquaticFree(p,.18))continue;reefs++;
    const kind=i%4,color=['#fc766d','#c36cdd','#eab53a','#27b69b'][i%4];
    if(kind===0){
      for(let j=0;j<5;j++){const a=j*2.4,h=.35+random()*.65,tip=[x+Math.cos(a)*.25,y+h,z+Math.sin(a)*.25];beam(null,[x,y,z],tip,.065,color);
        for(const s of [-1,1]){const end=[tip[0]+s*.22,tip[1]+.22,tip[2]+.1];beam(null,tip,end,.04,color);ball(null,'#ffb494',end,[.055,.065,.055]);}}
    }else if(kind===1){
      for(let j=0;j<5;j++){const xx=x+Math.cos(j*2.4)*.25,zz=z+Math.sin(j*2.4)*.25,h=.4+random()*.75,r=.12+random()*.05;
        part(null,new THREE.CylinderGeometry(r,r*.75,h,12,2,true),color,[xx,y+h/2,zz]);
        part(null,new THREE.TorusGeometry(r,.035,4,12),'#e8a4ec',[xx,y+h,zz],[1,1,1],[Math.PI/2,0,0]);
        ball(null,'#573871',[xx,y+h-.13,zz],[r*.8,.03,r*.8]);}
    }else if(kind===2){
      for(let j=0;j<7;j++){const a=j*2.4,h=.8+random()*.7;
        beam(null,[x,y,z],[x+.15*Math.sin(a),y+h,z],.02,'#39854a');
        for(let k=1;k<5;k++)leaf(x,y+k*h/5,z,a+k*1.7,.35,.10,j%2?'#8ed34f':'#30aa80');}
    }else{
      ball(null,'#e66c9e',[x,y+.1,z],[.4,.14,.4]);
      for(let j=0;j<22;j++){const a=j*2.4,r=.12+random()*.25,h=.2+random()*.35;
        const end=[x+Math.cos(a)*r,y+h,z+Math.sin(a)*r];beam(null,[x,y+.1,z],end,.026,'#54d7c5');ball(null,'#b9f29b',end,[.045,.055,.045]);}
    }
    // Broad scalloped sea fans frame each garden.
    if(i===0)for(let j=0;j<13;j++){const a=-1.2+j*.2;beam(null,[x+.7,y,z],[x+.7+Math.sin(a)*.7,y+.25+Math.cos(a)*1.05,z],.025,'#cc5c91');}
  }
  const creatures=createCreatures(scene,random,caustics,time);
  // Starfish on the open sandy floor.
  for(let i=0;i<18;i++){const x=-12+random()*25,z=5-random()*24,y=terrainHeight(x,z)+.05;if(y>-.4)continue;
    ball(null,'#f5a14e',[x,y,z],[.12,.06,.12]);for(let j=0;j<5;j++){const a=j*Math.PI*.4;beam(null,[x,y,z],[x+Math.cos(a)*.31,y,z+Math.sin(a)*.31],.06,i%2?'#f3955b':'#d96994');}}
  for(const [color,geos] of batches){const m=new THREE.Mesh(mergeGeometries(geos.map(g=>g.index?g.toNonIndexed():g)),material(color));m.castShadow=true;m.receiveShadow=true;scene.add(m);geos.forEach(g=>g.dispose());}
  // The boat moves as a whole, so its planks share a handful of draw calls.
  const boatParts=new Map();for(const child of [...boat.children]){child.updateMatrix();const geo=child.geometry.clone().applyMatrix4(child.matrix);if(!boatParts.has(child.material))boatParts.set(child.material,[]);boatParts.get(child.material).push(geo.index?geo.toNonIndexed():geo);boat.remove(child);}
  for(const [mat,geos] of boatParts){boat.add(new THREE.Mesh(mergeGeometries(geos),mat));geos.forEach(g=>g.dispose());}
  return {counts:{turtles:4,crabs:9,seahorses:7,jellyfish:5,reefGardens:reefs,bridges:1,boats:1},
    update(t){boat.position.y=.14+Math.sin(t*1.1)*.065;boat.rotation.z=Math.sin(t*.8)*.025;
      creatures.update(t);
    },collisionViolations:creatures.collisionViolations,creatureStates:creatures.states};
}
