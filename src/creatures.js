import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { detailedMaterial } from './materials.js';
import { safeSpawn, swimTo, aquaticFree, rockBounds } from './habitat.js';
import { terrainHeight } from './terrain.js';

export function createCreatures(scene,random,caustics,time){
  const animals=[],cache=new Map();
  const mat=(color,kind='skin',extra={})=>{const key=color+kind+JSON.stringify(extra);if(!cache.has(key))cache.set(key,detailedMaterial(color,kind,caustics,extra));return cache.get(key);};
  const sphere=new THREE.SphereGeometry(1,18,12),smallSphere=new THREE.SphereGeometry(1,10,7);
  function mesh(g,geo,material,pos=[0,0,0],scale=[1,1,1]){const m=new THREE.Mesh(geo,material);m.position.set(...pos);m.scale.set(...scale);m.castShadow=!material.transparent;m.receiveShadow=true;g.add(m);return m;}
  const ball=(g,m,p,s)=>mesh(g,Math.max(...s)<.13?smallSphere:sphere,m,p,s);
  function tube(g,points,r,m,taper=false){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),geo=new THREE.TubeGeometry(curve,Math.min(24,Math.max(10,points.length)),r,5,false);
    if(taper){const p=geo.attributes.position;for(let i=0;i<p.count;i++){const t=Math.floor(i/6)/geo.parameters.tubularSegments,c=curve.getPointAt(t),s=1-t*.87;p.setXYZ(i,c.x+(p.getX(i)-c.x)*s,c.y+(p.getY(i)-c.y)*s,c.z+(p.getZ(i)-c.z)*s);}geo.computeVertexNormals();}
    return mesh(g,geo,m);
  }
  function eyes(g,x,y,z,separation,size=.04){for(const s of [-1,1]){ball(g,mat('#d6b753','shell'),[x,y,z+s*separation],[size*1.3,size*1.4,size]);ball(g,mat('#091f26','skin',{roughness:.12,clearcoat:1}),[x+size*.65,y,z+s*(separation+size*.5)],[size*.7,size,size*.55]);ball(g,mat('#f7ffff','skin'),[x+size*.8,y+size*.4,z+s*(separation+size*.8)],[size*.2,size*.2,size*.18]);}}
  function paddle(g,p,s,m){const shape=new THREE.Shape();shape.moveTo(0,0);shape.bezierCurveTo(.12,-.12,.5,-.19,.63,-.03);shape.bezierCurveTo(.48,.1,.2,.21,0,.06);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:true,bevelSize:.022,bevelThickness:.02,bevelSegments:3,steps:1,curveSegments:16});geo.rotateX(Math.PI/2);const f=mesh(g,geo,m,p);f.scale.set(s,1,s);return f;}
  // Batch the rigid details inside each animal; retain articulated joints as groups.
  function batch(g,transparent=false){const buckets=new Map();for(const c of [...g.children]){if(!c.isMesh||(!transparent&&c.material.transparent))continue;c.updateMatrix();const geo=c.geometry.clone().applyMatrix4(c.matrix);if(!buckets.has(c.material))buckets.set(c.material,[]);buckets.get(c.material).push(geo.index?geo.toNonIndexed():geo);g.remove(c);}
    for(const [m,geos] of buckets){const merged=mergeGeometries(geos);mesh(g,merged,m);geos.forEach(x=>x.dispose());}}
  function flattenCrab(g){
    g.updateMatrixWorld(true);const buckets=new Map();
    g.traverse(c=>{if(!c.isMesh)return;const geo=c.geometry.clone().applyMatrix4(c.matrixWorld);if(!buckets.has(c.material))buckets.set(c.material,[]);buckets.get(c.material).push(geo.index?geo.toNonIndexed():geo);});
    g.clear();for(const [source,geos] of buckets){const m=source.clone(),previous=source.onBeforeCompile,key=source.customProgramCacheKey();
      m.onBeforeCompile=shader=>{previous.call(m,shader);shader.uniforms.uCrabTime=time;shader.vertexShader='uniform float uCrabTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        float leg=smoothstep(.19,.43,abs(position.z))*(1.-smoothstep(.16,.28,position.y));
        transformed.y+=sin(uCrabTime*7.+position.x*23.+sign(position.z)*1.7)*leg*.035;
        transformed.x+=cos(uCrabTime*7.+position.x*23.)*leg*.025;`);};m.customProgramCacheKey=()=>key+'-crab-scuttle';
      mesh(g,mergeGeometries(geos),m);geos.forEach(x=>x.dispose());
    }
  }
  function add(kind,g,preferred,radius,phase,extras={}){const center=safeSpawn(preferred,radius);g.position.copy(center);scene.add(g);animals.push({kind,g,center,radius,phase,...extras});}
  for(let i=0;i<4;i++){
    const g=new THREE.Group(),flippers=[],skin=mat('#82ac6d'),shell=mat('#809b48','shell'),seam=mat('#435c31','shell');
    ball(g,mat('#d9c991','shell'),[0,-.11,0],[.67,.16,.46]);ball(g,seam,[0,.055,0],[.71,.30,.49]);ball(g,shell,[0,.115,0],[.67,.28,.45]);
    // Raised scutes follow the shell dome, with etched growth rings in the material.
    for(let row=-1;row<=1;row++)for(let j=-1;j<=1;j++){const x=j*.32+Math.abs(row)*.03,z=row*.25,y=.13+.26*Math.sqrt(Math.max(.05,1-(x/.72)**2-(z/.53)**2));ball(g,mat(row===0?'#b1b967':'#8da35b','shell'),[x,y,z],[.185,.035,.135]);}
    for(let j=0;j<24;j++){const a=j*Math.PI/12;ball(g,mat('#b5ba76','shell'),[Math.cos(a)*.67,.09,Math.sin(a)*.46],[.08,.045,.05]);}
    ball(g,skin,[.68,.0,0],[.27,.14,.17]);ball(g,skin,[.87,.025,0],[.24,.17,.19]);eyes(g,1.0,.075,0,.145,.037);
    tube(g,[[.96,-.046,-.13],[1.08,-.035,0],[.96,-.046,.13]],.009,mat('#496943'));
    for(const side of [-1,1])for(const x of [-.42,.3]){const joint=new THREE.Group();joint.position.set(x,-.065,side*.35);g.add(joint);const f=paddle(joint,[0,0,0],x>0?.87:.55,skin);f.rotation.y=side*(x>0?-1.1:-2.1);if(side<0)f.scale.z*=-1;flippers.push({joint,side,front:x>0});}
    tube(g,[[-.61,-.05,0],[-.79,-.08,0],[-.87,-.06,0]],.07,skin,true);batch(g);
    add('turtle',g,new THREE.Vector3(-1+i*3,-1.55,-4-i*3),1.2,i*1.7,{flippers});
  }
  for(let i=0;i<9;i++){
    const g=new THREE.Group(),legs=[],claws=[],shell=mat('#e87743','shell'),skin=mat('#e08b57');
    ball(g,shell,[0,.035,0],[.26,.14,.23]);ball(g,mat('#ecc099','shell'),[0,-.035,0],[.23,.07,.2]);
    for(let j=0;j<9;j++){const a=j*Math.PI/4.5;ball(g,shell,[Math.cos(a)*.24,.035,Math.sin(a)*.19],[.055,.035,.045]);}
    for(const side of [-1,1]){
      for(let j=0;j<4;j++){const xx=-.18+j*.11,joint=new THREE.Group();joint.position.set(xx,0,side*.16);g.add(joint);tube(joint,[[0,0,0],[-.09,.035,side*.18],[.03,-.16,side*.31]],.025,skin,true);ball(joint,shell,[-.09,.035,side*.18],[.034,.035,.034]);batch(joint);legs.push({joint,side,j});}
      const joint=new THREE.Group();joint.position.set(.15,.025,side*.17);g.add(joint);tube(joint,[[0,0,0],[.15,.13,side*.1],[.28,.16,side*.12]],.047,skin);ball(joint,shell,[.28,.16,side*.12],[.13,.085,.085]);
      for(const s of [-1,1])tube(joint,[[.30,.16,side*.12+s*.045],[.41,.16,side*.12+s*.07],[.46,.16,side*.12+s*.018]],.034,shell,true);batch(joint);claws.push(joint);
      tube(g,[[.1,.13,side*.11],[.14,.25,side*.12]],.021,skin);ball(g,mat('#17282d','skin',{clearcoat:1}),[.14,.25,side*.12],[.037,.043,.034]);}
    flattenCrab(g);const center=safeSpawn(new THREE.Vector3(-4+i*1.2,-1.8,-3-i%3*4),.65);center.y=terrainHeight(center.x,center.z)+.19;g.position.copy(center);scene.add(g);animals.push({kind:'crab',g,center,phase:i,legs,claws});
  }
  for(let i=0;i<7;i++){
    const g=new THREE.Group(),skin=mat(i%2?'#ffc06e':'#e88cae','scales'),ridge=mat('#ffdaa3','shell');
    tube(g,[[0,-.25,0],[-.015,-.06,0],[0,.14,0],[-.055,.30,0],[.035,.43,0]],.102,skin);
    ball(g,skin,[.035,.4,0],[.13,.115,.087]);tube(g,[[.09,.38,0],[.20,.35,0],[.28,.35,0]],.04,skin);ball(g,mat('#8a5a58'),[.281,.35,0],[.012,.032,.032]);eyes(g,.08,.435,0,.073,.027);
    const tail=[];for(let j=0;j<=28;j++){const t=j/28,a=t*Math.PI*2.3;tail.push([-.02+Math.sin(a)*(.17-t*.09),-.23-t*.3+Math.cos(a)*.07,0]);}tube(g,tail,.034,skin,true);
    for(let j=0;j<11;j++){const y=-.22+j*.052;mesh(g,new THREE.TorusGeometry(.094,.012,6,14),ridge,[0,y,0]).rotation.x=Math.PI/2;const spike=mesh(g,new THREE.ConeGeometry(.028,.07,6),ridge,[-.10,y,0]);spike.rotation.z=.6;}
    for(let j=0;j<3;j++){const spike=mesh(g,new THREE.ConeGeometry(.027,.075,6),ridge,[-.03+j*.04,.52,0]);spike.rotation.z=.4;}
    const joint=new THREE.Group();g.add(joint);mesh(joint,new THREE.CircleGeometry(.14,24),mat('#eecce4','fin',{transparent:true,opacity:.65,depthWrite:false}),[-.105,.075,0],[.85,1,1]);batch(g);
    add('seahorse',g,new THREE.Vector3(1+i*.55,-1.8,-5-i%3),.65,i,{fin:joint});
  }
  // Scalloped translucent bells reveal radial canals and four inner oral organs.
  for(let i=0;i<5;i++){
    const g=new THREE.Group(),bell=new THREE.Group();g.add(bell);
    const jelly=mat(i%2?'#b0def7':'#e1bbf0','jelly',{transparent:true,opacity:.30,depthWrite:false,roughness:.13,clearcoat:1,clearcoatRoughness:.08,iridescence:.5,iridescenceIOR:1.32});
    const glow=mat('#c5b5f5','jelly',{transparent:true,opacity:.72,depthWrite:false,emissive:'#543c89',emissiveIntensity:.24,roughness:.25});
    const profile=Array.from({length:25},(_,j)=>{const a=j/24*Math.PI*.53;return new THREE.Vector2(Math.sin(a)*.38,Math.cos(a)*.28);});
    const geo=new THREE.LatheGeometry(profile,40);const p=geo.attributes.position;
    for(let j=0;j<p.count;j++){const a=Math.atan2(p.getX(j),p.getZ(j)),weight=1-smooth01((p.getY(j)+.03)/.18);p.setY(j,p.getY(j)+Math.sin(a*16)*.022*weight);}geo.computeVertexNormals();mesh(bell,geo,jelly);
    for(let j=0;j<12;j++){const a=j*Math.PI/6,points=[];for(let k=1;k<=16;k++){const t=k/16*Math.PI*.5;points.push([Math.sin(t)*.36*Math.cos(a),Math.cos(t)*.258,Math.sin(t)*.36*Math.sin(a)]);}tube(bell,points,.0045,glow);}
    for(let j=0;j<24;j++){const a=j*Math.PI/12;ball(bell,glow,[Math.cos(a)*.373,-.018,Math.sin(a)*.373],[.022,.023,.022]);}
    for(let j=0;j<4;j++){const a=j*Math.PI/2;const organ=mesh(bell,new THREE.TorusGeometry(.066,.017,8,24),glow,[Math.cos(a)*.083,.10,Math.sin(a)*.083]);organ.rotation.x=Math.PI/2;}
    const tentacles=new THREE.Group();g.add(tentacles);
    let tentacleMaterial;
    for(let j=0;j<12;j++){const a=j*Math.PI/8,r=j<4?.12:.30,length=j<4?.58:.70+random()*.14,points=[];
      for(let k=0;k<=20;k++){const t=k/20;points.push([Math.cos(a)*r+Math.sin(t*8+j)*t*.065,-t*length,Math.sin(a)*r+Math.cos(t*7+j)*t*.055]);}
      const m=tentacleMaterial||glow.clone();tentacleMaterial=m;const previous=glow.onBeforeCompile;m.onBeforeCompile=shader=>{previous.call(m,shader);shader.uniforms.uJellyTime=time;shader.vertexShader='uniform float uJellyTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        float trail=max(0.,-position.y);transformed.x+=sin(uJellyTime*2.1+position.y*5.+position.x*11.)*trail*.16;
        transformed.z+=cos(uJellyTime*1.7+position.y*4.+position.z*9.)*trail*.12;`);};m.customProgramCacheKey=()=>'jelly-tentacle-v2';
      tube(tentacles,points,j<4?.028:.008,m,true);
    }
    batch(bell,true);batch(tentacles,true);
    add('jellyfish',g,new THREE.Vector3(-3+i*1.7,-1.5,3),1.02,i*1.3,{bell,tentacles});
  }
  const instanceGroups=new Map(),instances=[];
  for(const animal of animals){if(!['turtle','seahorse'].includes(animal.kind))continue;
    for(const child of animal.g.children){if(!child.isMesh||child.material.transparent)continue;
      const key=animal.kind+child.material.uuid;
      if(!instanceGroups.has(key))instanceGroups.set(key,[]);instanceGroups.get(key).push({animal,child});
    }
  }
  for(const members of instanceGroups.values()){
    const first=members[0].child,instanced=new THREE.InstancedMesh(first.geometry,first.material,members.length);instanced.frustumCulled=false;instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(instanced);
    members.forEach(({child})=>child.visible=false);instances.push({instanced,members});
  }
  const instanceTransform=new THREE.Matrix4();
  let lastTime;
  return {update(t){const dt=lastTime===undefined?0:Math.max(0,Math.min(.1,t-lastTime));lastTime=t;
    for(const c of animals){const a=t*.22+c.phase;
      if(c.kind==='crab'){
        const target=c.center.clone();target.x+=Math.sin(a)*.65;target.z+=Math.sin(a*.8)*.22;target.y=terrainHeight(target.x,target.z)+.19;
        const blocked=rockBounds.some(b=>b.clone().expandByScalar(.65).containsPoint(target));if(!blocked)c.g.position.lerp(target,1-Math.exp(-dt*3));
        c.g.rotation.y=Math.sin(a)*.25;continue;
      }
      const target=c.center.clone();target.x+=Math.sin(a)*(c.kind==='turtle'?2.0:.20);target.z+=Math.cos(a)*(c.kind==='turtle'?1.2:.15);target.y+=Math.sin(t*.8+c.phase)*.10;
      const old=c.g.position.clone(),desired=old.clone().lerp(target,1-Math.exp(-dt*(c.kind==='turtle'?1.2:2.0)));swimTo(c.g.position,desired,c.radius);
      if(c.kind==='turtle'){const d=c.g.position.clone().sub(old);if(d.lengthSq()>.0000001){const wanted=Math.atan2(-d.z,d.x),angle=Math.atan2(Math.sin(wanted-c.g.rotation.y),Math.cos(wanted-c.g.rotation.y));c.g.rotation.y+=angle*(1-Math.exp(-dt*2));}c.flippers.forEach(({joint,side,front})=>{joint.rotation.x=Math.sin(t*2.5+c.phase)*side*(front?.38:.2);joint.rotation.y=Math.cos(t*2.5+c.phase)*.12;});}
      if(c.kind==='seahorse'){c.fin.rotation.y=Math.sin(t*24+c.phase)*.45;c.g.rotation.z=Math.sin(t*1.1+c.phase)*.065;}
      if(c.kind==='jellyfish'){const pulse=Math.pow(.5+.5*Math.sin(t*2.6+c.phase),3);c.bell.scale.set(1-pulse*.14,1+pulse*.22,1-pulse*.14);c.tentacles.scale.set(1-pulse*.08,1-pulse*.10,1-pulse*.08);c.g.rotation.z=Math.sin(t*.6+c.phase)*.08;}
    }
    for(const {instanced,members} of instances){members.forEach(({animal,child},i)=>{animal.g.updateMatrix();child.updateMatrix();instanceTransform.multiplyMatrices(animal.g.matrix,child.matrix);instanced.setMatrixAt(i,instanceTransform);});instanced.instanceMatrix.needsUpdate=true;}
  },collisionViolations:()=>animals.filter(c=>c.radius&&!aquaticFree(c.g.position,c.radius)).length,
    states:()=>animals.map(c=>({kind:c.kind,position:c.g.position.toArray()}))};
}
function smooth01(t){return THREE.MathUtils.clamp(t,0,1);}
