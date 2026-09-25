import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rockBounds } from './habitat.js';
import { addCaustics } from './caustics.js';

export function terrainHeight(x, z) {
  const q = ((x + 8) / 30) ** 2 + ((z + 39) / 20) ** 2;
  const island = 6.3 * Math.exp(-q * 1.45);
  const dune = .45 * Math.sin(x * .23 + z * .17) * Math.exp(-q * 1.6);
  return -3.25 + island + dune + .065 * Math.sin(x * .7 + Math.sin(z * .3)) * Math.sin(z * .55);
}

export function createTerrain(scene, renderer, caustics, random) {
  const loader = new THREE.TextureLoader();
  let loaded = 0;
  const textures = ['coral-sand', 'volcanic-rock'].map(name => {
    const map = loader.load(`${import.meta.env?.BASE_URL || '/'}textures/${name}.webp`, () => loaded++);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return map;
  });
  const [sandMap, rockMap] = textures;
  const sand = new THREE.MeshStandardMaterial({ map: sandMap, roughness: .92, color: '#f5edda' });
  sand.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vSandWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSandWorld = (modelMatrix * vec4(position,1.)).xyz;');
    shader.fragmentShader = 'varying vec3 vSandWorld;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec3 tex = texture2D(map, vSandWorld.xz * .34).rgb;
      vec3 large = texture2D(map, vSandWorld.xz * .063 + .36).rgb;
      float ripples = sin(vSandWorld.z * 8.5 + sin(vSandWorld.x * .7) * 1.5);
      float wet = 1. - smoothstep(-.35, .55, vSandWorld.y);
      diffuseColor.rgb *= tex * (.9 + large * .2) * mix(1., .72, wet);
      diffuseColor.rgb *= 1. + ripples * .024 * wet;`);
  };
  addCaustics(sand, caustics);
  const geometry = new THREE.PlaneGeometry(220, 180, 120, 100);
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, 0, -35);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, sand);
  ground.receiveShadow = true; scene.add(ground);

  const rockMaterials = ['#9ba6b5', '#adb6c2', '#8693a5', '#a3adb9'].map(color => {
    const material = new THREE.MeshStandardMaterial({ color, map: rockMap, roughness: .91 });
    // World-space triplanar mapping keeps the texture scale consistent on every shape.
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 vRockWorld; varying vec3 vRockNormal;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vRockWorld = (modelMatrix * vec4(position,1.)).xyz;
        vRockNormal = normalize(mat3(modelMatrix) * normal);`);
      shader.fragmentShader = 'varying vec3 vRockWorld; varying vec3 vRockNormal;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        vec3 blend = pow(abs(normalize(vRockNormal)), vec3(5.)); blend /= dot(blend, vec3(1.));
        vec3 p = vRockWorld * .55;
        vec3 tex = texture2D(map,p.yz).rgb * blend.x + texture2D(map,p.xz).rgb * blend.y + texture2D(map,p.xy).rgb * blend.z;
        float grey = dot(tex,vec3(.299,.587,.114));
        diffuseColor.rgb *= .80 + grey * .24;
        float wet = 1. - smoothstep(-.25,.35,vRockWorld.y);
        diffuseColor.rgb *= mix(vec3(1.),vec3(.72),wet);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float bump = texture2D(map, vRockWorld.xz * .55).r;
        normal = normalize(normal + vec3(dFdx(bump),dFdy(bump),0.) * .35);`);
    };
    return addCaustics(material, caustics);
  });
  let rocks = 0;const rockPieces=[[],[],[],[]];
  function rock(x,z,sx,sy,sz,type=0) {
    // Broken strata and offset shoulders form angular outcrops, not ellipsoids.
    const points=[],phase=random()*Math.PI*2;
    const rings=[[-.85,.72,7],[-.18,1,7],[.40,.86,6],[.78,.56,5]];
    for(const [y,radius,count] of rings)for(let i=0;i<count;i++){
      const a=phase+i/count*Math.PI*2+(random()-.5)*.24,r=radius*(.83+random()*.25);
      points.push(new THREE.Vector3(Math.cos(a)*r+y*.19,y+(random()-.5)*.14+Math.cos(a)*.12,Math.sin(a)*r-y*.13));
    }
    const smooth=new ConvexGeometry(points);
    const mesh = new THREE.Mesh(smooth,rockMaterials[type%4]);
    mesh.scale.set(sx,sy,sz);mesh.position.set(x,terrainHeight(x,z)+sy*.63,z);
    mesh.rotation.y=random()*Math.PI*2;
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.updateMatrixWorld(true);rockBounds.push(new THREE.Box3().setFromObject(mesh));rockPieces[type%4].push(smooth.clone().applyMatrix4(mesh.matrixWorld));smooth.dispose();rocks++;
  }
  // Asymmetric clusters frame an open channel of sand and fish.
  const anchors=[[-7,0,2.6,2.25,2.05], [6.7,-4,3.3,2.4,2.15], [-4,-10,1.8,1.1,2.6],
    [9,-16,2.4,1.8,3.6], [-17,-15,3,2.8,2.4], [-19,-25,3,2.3,3.7], [5,-28,3,2.2,2],
    [-1,-31,1.2,.7,1.7], [13,3,3.5,1.5,2.7]];
  anchors.forEach(([x,z,sx,sy,sz],i)=>{
    rock(x,z,sx,sy,sz,i);
    for(let j=0;j<3;j++){
      const a=random()*6.28,r=sx*(.8+random()*.4),s=.4+random()*.75;
      rock(x+Math.cos(a)*r,z+Math.sin(a)*r,s*1.4,s*(.55+random()),s,i+j);
    }
  });
  for(let i=0;i<34;i++) {
    const x=(random()-.5)*42,z=8-random()*45,s=.1+random()*.23;
    rock(x,z,s*1.6,s*.6,s,i);
  }
  rockPieces.forEach((pieces,i)=>{const mesh=new THREE.Mesh(mergeGeometries(pieces),rockMaterials[i]);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);pieces.forEach(g=>g.dispose());});
  return { ground, rocks, importedRocks:()=>0,modelError:()=>null,assetsReady:()=>loaded===2 };
}
