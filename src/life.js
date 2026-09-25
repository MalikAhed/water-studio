import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainHeight } from './terrain.js';
import { safeSpawn, swimTo, aquaticFree } from './habitat.js';
import { detailTextures } from './materials.js';
import { addCaustics } from './caustics.js';

function ribbon(points, widths) {
  const positions=[],uvs=[],indices=[];
  points.forEach((p,i)=>{
    const tangent=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(0,i-1)]).normalize();
    let side=new THREE.Vector3().crossVectors(tangent,new THREE.Vector3(0,0,1)).normalize();
    if(side.lengthSq()<.1)side.set(1,0,0);
    for(const sign of [-1,1]){
      const v=p.clone().addScaledVector(side,widths[i]*sign);
      positions.push(v.x,v.y,v.z);uvs.push((sign+1)/2,i/(points.length-1));
    }
    if(i<points.length-1){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
  });
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();return geo;
}

export function createPlants(scene, caustics, time, random) {
  const grassMaterial=new THREE.MeshStandardMaterial({...detailTextures('leaf'),bumpScale:.018,color:'#37aa78',roughness:.82,side:THREE.DoubleSide});
  grassMaterial.onBeforeCompile=shader=>{
    shader.uniforms.uPlantTime=time;
    shader.vertexShader='uniform float uPlantTime; varying vec2 vLeafUV;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vLeafUV=uv;
      transformed.x += sin(uPlantTime*.95 + position.y*1.1 + position.x*.6) * uv.y*uv.y*.16;
      transformed.z += cos(uPlantTime*.65 + position.z*.7) * uv.y*uv.y*.11;`);
    shader.fragmentShader='varying vec2 vLeafUV;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= mix(vec3(.43,.62,.38),vec3(1.1,1.2,.73),vLeafUV.y);
      diffuseColor.rgb *= .88 + .12 * cos(vLeafUV.x*24.);
      diffuseColor.rgb += vec3(.05,.07,.016)*pow(1.-abs(vLeafUV.x*2.-1.),18.);`);
  };
  addCaustics(grassMaterial,caustics);
  const kelpMaterial=grassMaterial.clone();kelpMaterial.color.set('#a6c951');
  kelpMaterial.onBeforeCompile=grassMaterial.onBeforeCompile;
  kelpMaterial.customProgramCacheKey=grassMaterial.customProgramCacheKey;
  const geometries=[[],[]];let count=0;
  const clusters=[[-8,1,3], [7,-5,4], [-5,-10,3], [10,-17,4], [-16,-14,4], [12,4,3],[-11,-6,2]];
  for(const [cx,cz,r] of clusters) for(let i=0;i<16;i++){
    const x=cx+(random()-.5)*r*2,z=cz+(random()-.5)*r*2,y=terrainHeight(x,z);
    if(y>-.6)continue;count++;
    const type=i%4===0?1:0;
    for(let j=0;j<(type?6:11);j++){
      const angle=random()*6.28,h=(.4+random()*.7)*(type?1.45:1),bend=.15+random()*.6;
      const points=[],widths=[];
      for(let k=0;k<=10;k++){
        const t=k/10;
        points.push(new THREE.Vector3(x+Math.cos(angle)*t*t*bend,y+h*t,z+Math.sin(angle)*t*t*bend));
        widths.push((type?.085:.018)*Math.pow(Math.sin(Math.PI*t),.7)+.001);
      }
      geometries[type].push(ribbon(points,widths));
    }
  }
  geometries.forEach((list,i)=>{
    const merged=mergeGeometries(list);list.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(merged,i?kelpMaterial:grassMaterial);mesh.receiveShadow=true;scene.add(mesh);
  });

  // Curved, ringed trunks and feathered fronds form the island canopy.
  const trunkMaterial=new THREE.MeshStandardMaterial({...detailTextures('wood'),bumpScale:.035,color:'#74644c',roughness:1});
  trunkMaterial.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vTrunk;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTrunk=position;');
    shader.fragmentShader='varying vec3 vTrunk;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb *= .72 + .28*smoothstep(.05,.25,fract(vTrunk.y*5.));');
  };
  const palmMaterial=new THREE.MeshStandardMaterial({...detailTextures('leaf'),bumpScale:.015,color:'#388a3d',side:THREE.DoubleSide,roughness:.8});
  const palms=[];
  const palmLocations=[[-15,-31,9.5],[-7,-35,10.8],[-1,-29,8.8],[-23,-35,8.2],[-13,-44,10.3],[7,-34,9.8],
    [-25,-43,8.8],[-19,-50,9.5],[-6,-49,10.4],[2,-45,9.2],[13,-42,10.6],[10,-50,8.5],
    [-29,-36,7.5],[-19,-28,7.8],[-5,-27,8.0],[5,-29,8.6],[-27,-48,8.9],[-11,-54,7.8]];
  for(const [x,z,h] of palmLocations){
    const y=terrainHeight(x,z),lean=(random()-.5)*2;
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x,y-.15,z),new THREE.Vector3(x+lean*.2,y+h*.5,z),new THREE.Vector3(x+lean,y+h,z+.6)]);
    const trunkGeo=new THREE.TubeGeometry(curve,20,.25,9,false);
    const p=trunkGeo.attributes.position;
    for(let i=0;i<p.count;i++){
      const t=THREE.MathUtils.clamp((p.getY(i)-y)/h,0,1),c=curve.getPoint(t);
      p.setX(i,c.x+(p.getX(i)-c.x)*(1.5-t*.7));p.setZ(i,c.z+(p.getZ(i)-c.z)*(1.5-t*.7));
    }
    trunkGeo.computeVertexNormals();
    const trunk=new THREE.Mesh(trunkGeo,trunkMaterial);trunk.castShadow=true;scene.add(trunk);
    const crown=new THREE.Group();crown.position.copy(curve.getPoint(1));scene.add(crown);
    const coconutMaterial=new THREE.MeshStandardMaterial({color:'#a48a42',...detailTextures('wood'),roughness:.85,bumpScale:.025});
    const nuts=[];for(let j=0;j<6;j++){const a=j*2.399,geo=new THREE.SphereGeometry(.23,10,6);geo.scale(.9,1.18,.9);geo.translate(Math.cos(a)*.35,-.28-(j%2)*.18,Math.sin(a)*.35);nuts.push(geo);}
    const coconuts=new THREE.Mesh(mergeGeometries(nuts),coconutMaterial);coconuts.castShadow=true;crown.add(coconuts);nuts.forEach(g=>g.dispose());
    const pieces=[];
    for(let i=0;i<13;i++){
      const a=i*2.399+random()*.2,len=3.6+random()*1.7;
      const center=t=>new THREE.Vector3(Math.cos(a)*len*t,Math.sin(t*Math.PI)*.55-t*t*1.05,Math.sin(a)*len*t);
      const stem=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({length:12},(_,k)=>center(k/11))),12,.024,4,false);
      pieces.push(stem);
      for(let j=1;j<17;j++){
        const t=j/18,base=center(t),w=Math.sin(t*Math.PI)*1.1;
        for(const side of [-1,1]){
          const points=[],widths=[];
          for(let k=0;k<4;k++){
            const f=k/3;
            points.push(base.clone().add(new THREE.Vector3(-Math.sin(a)*side*w*f+Math.cos(a)*f*.23,-.3*f*f,Math.cos(a)*side*w*f+Math.sin(a)*f*.23)));
            widths.push(.09*Math.sin(Math.PI*f)+.001);
          }
          pieces.push(ribbon(points,widths));
        }
      }
    }
    const leaves=new THREE.Mesh(mergeGeometries(pieces),palmMaterial);pieces.forEach(g=>g.dispose());
    leaves.castShadow=true;crown.add(leaves);palms.push({crown,phase:random()*6});
  }
  return {count,palms:palms.length,update(t){for(const p of palms){p.crown.rotation.z=Math.sin(t*.45+p.phase)*.024;p.crown.rotation.x=Math.cos(t*.34+p.phase)*.018;}}};
}

function fishBody(type) {
  const positions=[],uvs=[],indices=[],rings=20,sides=14;
  for(let i=0;i<=rings;i++){
    const u=i/rings,x=(u-.5)*1.15;
    const profile=Math.pow(Math.sin(Math.PI*u),.8);
    for(let j=0;j<=sides;j++){
      const a=j/sides*Math.PI*2;
      positions.push(x,Math.cos(a)*profile*(type===3?.17:.29),Math.sin(a)*profile*.12);
      uvs.push(u,j/sides);
      if(i<rings&&j<sides){const n=i*(sides+1)+j;indices.push(n,n+sides+1,n+1,n+1,n+sides+1,n+sides+2);}
    }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();return geo;
}

export function createFish(scene, caustics, time, random) {
  // Four instanced schools: one draw per species, including eyes and fins.
  const palette=['#ff721c','#048fff','#fa39b2','#45e5b0'],fish=[],schools=[];
  const object=new THREE.Object3D();
  function paint(geo,color,kind){const count=geo.attributes.position.count,c=new THREE.Color(color),colors=[],parts=[];for(let i=0;i<count;i++){colors.push(c.r,c.g,c.b);parts.push(kind);}geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setAttribute('fishPart',new THREE.Float32BufferAttribute(parts,1));return geo;}
  for(let type=0;type<4;type++){
    const pieces=[paint(fishBody(type),palette[type],0)];
    const tail=new THREE.Shape();tail.moveTo(-.48,.045);tail.quadraticCurveTo(-.65,.10,-.88,.27);tail.quadraticCurveTo(-.77,0,-.88,-.27);tail.quadraticCurveTo(-.63,-.09,-.48,-.045);tail.closePath();
    pieces.push(paint(new THREE.ShapeGeometry(tail,10),type===1||type===2?'#ffe329':palette[type],1));
    for(const side of [-1,1]){
      const shape=new THREE.Shape();shape.moveTo(-.4,side*.08);shape.quadraticCurveTo(-.12,side*.48,.25,side*.18);shape.lineTo(.24,side*.07);shape.closePath();pieces.push(paint(new THREE.ShapeGeometry(shape,10),type===1?'#35bdff':palette[type],1));
      const eye=new THREE.SphereGeometry(.038,10,7);eye.scale(1,1,.65);eye.translate(.4,.07,side*.082);pieces.push(paint(eye,'#ffefa3',2));
      const pupil=new THREE.SphereGeometry(.025,10,7);pupil.scale(1,1,.55);pupil.translate(.405,.073,side*.105);pieces.push(paint(pupil,'#0c1936',2));
      const shine=new THREE.SphereGeometry(.009,6,4);shine.translate(.414,.086,side*.119);pieces.push(paint(shine,'#ffffff',2));
    }
    const geometry=mergeGeometries(pieces.map(g=>g.index?g.toNonIndexed():g));pieces.forEach(g=>g.dispose());
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.35,metalness:.035,side:THREE.DoubleSide,emissive:palette[type],emissiveIntensity:.12});
    material.onBeforeCompile=shader=>{
      shader.uniforms.uFishTime=time;
      shader.vertexShader='uniform float uFishTime; attribute float fishPart; varying float vFishPart; varying vec3 vFishLocal;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vFishPart=fishPart;vFishLocal=position;
        float tailWeight=pow(1.-smoothstep(-.9,.35,position.x),2.);
        transformed.z+=sin(uFishTime*7.+position.x*5.+instanceMatrix[3].x*.7)*tailWeight*.11;`);
      shader.fragmentShader='varying float vFishPart; varying vec3 vFishLocal;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        if(vFishPart<.5){
          float scales=pow(.5+.5*sin(vFishLocal.x*150.+sin(vFishLocal.y*160.)*2.),8.);
          diffuseColor.rgb*=.94+scales*.12;
          ${type===0?'float stripe=1.-smoothstep(.055,.085,min(abs(vFishLocal.x-.22),abs(vFishLocal.x+.22)));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.98,.95,.84),stripe);':''}
          ${type===1?'float stripe=smoothstep(.03,.07,vFishLocal.y)*(1.-smoothstep(.27,.35,abs(vFishLocal.x)));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.015,.045,.21),stripe*.83);':''}
          ${type===2?'diffuseColor.rgb=mix(vec3(1.,.76,.025),diffuseColor.rgb,smoothstep(-.15,.05,vFishLocal.x));':''}
          ${type===3?'float stripe=1.-smoothstep(.015,.035,abs(vFishLocal.y));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.025,.25,.9),stripe);':''}
        }else if(vFishPart<1.5){diffuseColor.rgb*=.85+.15*pow(.5+.5*sin(vFishLocal.y*160.+vFishLocal.x*65.),4.);}`);
    };
    material.customProgramCacheKey=()=>`vibrant-school-${type}`;addCaustics(material,caustics);
    const count=type<2?8:7,school=new THREE.InstancedMesh(geometry,material,count);school.frustumCulled=false;school.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(school);schools.push(school);
    for(let j=0;j<count;j++){
      const i=type+j*4,lane=i<18?i%3:3,cx=lane===0?-1.4:lane===1?3.8:lane===2?-5.5:(random()-.5)*19,cz=lane===0?-4:lane===1?-13:lane===2?1:-7-random()*9;
      fish.push({school,index:j,position:safeSpawn(new THREE.Vector3(cx,-1.7,cz),.95),yaw:0,scale:.6+random()*.35,cx,cz,depth:1.3+random()*.9,radius:1.7+random()*1.5,phase:random()*6.28,speed:.16+random()*.14});
    }
  }
  let previousTime;
  return {count:fish.length,importedFish:()=>0,assetsReady:()=>true,modelError:()=>null,collisionViolations:()=>fish.filter(f=>!aquaticFree(f.position,.95)).length,update(t){
    const dt=previousTime===undefined?0:Math.max(0,Math.min(.1,t-previousTime));previousTime=t;
    for(const f of fish){const a=t*f.speed+f.phase,x=f.cx+Math.cos(a)*f.radius,z=f.cz+Math.sin(a)*f.radius*.6,floor=terrainHeight(x,z),old=f.position.clone();
      const target=new THREE.Vector3(x,Math.min(-1.22,Math.max(floor+1,-f.depth+Math.sin(a*2)*.08)),z);
      swimTo(f.position,old.clone().lerp(target,1-Math.exp(-dt*2.5)),.95);
      const d=f.position.clone().sub(old);if(d.lengthSq()>.000001){const wanted=Math.atan2(-d.z,d.x);f.yaw+=Math.atan2(Math.sin(wanted-f.yaw),Math.cos(wanted-f.yaw))*(1-Math.exp(-dt*4));}
      object.position.copy(f.position);object.rotation.set(0,f.yaw,Math.sin(t*1.2+f.phase)*.025);object.scale.setScalar(f.scale);object.updateMatrix();f.school.setMatrixAt(f.index,object.matrix);
    }
    for(const school of schools)school.instanceMatrix.needsUpdate=true;
  }};
}
