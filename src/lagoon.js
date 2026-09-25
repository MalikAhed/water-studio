import * as THREE from 'three';
import { createTerrain } from './terrain.js';
import { createHabitat } from './habitat.js';
import { createPlants, createFish } from './life.js';

export function createLagoon(renderer) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2*Math.atan(1/1.65)),1,.1,500);
  const reflectedCamera = camera.clone();
  const target = new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
  target.depthTexture = new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  const reflection = new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
  reflection.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  const reflectionMatrix = new THREE.Matrix4(), inverseReflectionMatrix=new THREE.Matrix4(), viewProjection = new THREE.Matrix4();
  const inverseProjection = new THREE.Matrix4(), cameraMatrix = new THREE.Matrix4();
  renderer.setClearColor(0x000000,0);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  const ambient = new THREE.HemisphereLight('#deeff5','#8e8265',1.6);scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff1d9',2.6);sun.position.set(-18,32,12);scene.add(sun);
  sun.target.position.set(-5,0,-28);scene.add(sun.target);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-55,right:55,top:60,bottom:-60,near:1,far:140});
  sun.shadow.normalBias=.045;sun.shadow.bias=-.00015;
  let seed=931;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const time={value:0};
  // Water lighting is disabled: no caustic render target or material sampling.
  const caustics={texture:null};
  const terrain=createTerrain(scene,renderer,caustics.texture,random);
  const plants=createPlants(scene,caustics.texture,time,random);
  const fish=createFish(scene,caustics.texture,time,random);
  const habitat=createHabitat(scene,random,caustics.texture,time);
  const clipPlane = new THREE.Plane(new THREE.Vector3(0,1,0),-.035);
  const look=new THREE.Vector3(),up=new THREE.Vector3(),normal=new THREE.Vector3(0,1,0);
  let lastReflection=-1,lastTheme=-1;const lastReflectionPosition=new THREE.Vector3(999,999,999);let lastReflectionYaw=999,lastReflectionPitch=999;
  function render(uniforms) {
    const t=uniforms.uTime.value;time.value=t;
    const night=Math.max(0,uniforms.uTheme.value-1),gold=1-Math.abs(uniforms.uTheme.value-1);
    ambient.intensity=1.6*(1-night*.86);sun.intensity=2.6*(1-night*.94);
    sun.color.set('#fff1d9').lerp(new THREE.Color('#ffad67'),gold*.7).lerp(new THREE.Color('#a7c4ff'),night);
    plants.update(t);fish.update(t);habitat.update(t);
    camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[9]=-.28;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.position.copy(uniforms.uCameraPosition.value);
    camera.rotation.set(-uniforms.uPitch.value,uniforms.uYaw.value,0,'YXZ');camera.updateMatrixWorld();
    inverseProjection.copy(camera.projectionMatrixInverse);cameraMatrix.copy(camera.matrixWorld);
    viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const size=uniforms.uResolution.value;
    if(target.width!==size.x||target.height!==size.y){lastReflection=-1;target.setSize(size.x,size.y);reflection.setSize(Math.max(1,Math.round(size.x*.5)),Math.max(1,Math.round(size.y*.5)));}
    renderer.setRenderTarget(target);renderer.render(scene,camera);
    const reflectionChanged=lastReflection<0||(camera.position.y<0)!==(lastReflectionPosition.y<0)||Math.abs(lastTheme-uniforms.uTheme.value)>.025||Math.abs(t-lastReflection)>.10||camera.position.distanceToSquared(lastReflectionPosition)>.3||Math.abs(uniforms.uYaw.value-lastReflectionYaw)>.05||Math.abs(uniforms.uPitch.value-lastReflectionPitch)>.05;
    if(reflectionChanged){
    reflectedCamera.position.copy(camera.position).reflect(normal);
    camera.getWorldDirection(look).add(camera.position).reflect(normal);
    up.set(0,1,0).applyQuaternion(camera.quaternion).reflect(normal);
    reflectedCamera.up.copy(up);reflectedCamera.lookAt(look);
    reflectedCamera.projectionMatrix.copy(camera.projectionMatrix);reflectedCamera.updateMatrixWorld();
    reflectionMatrix.multiplyMatrices(reflectedCamera.projectionMatrix,reflectedCamera.matrixWorldInverse);
    inverseReflectionMatrix.copy(reflectionMatrix).invert();
    clipPlane.normal.set(0,camera.position.y<0?-1:1,0);
    renderer.clippingPlanes=[clipPlane];renderer.setRenderTarget(reflection);renderer.render(scene,reflectedCamera);
    renderer.clippingPlanes=[];lastReflection=t;lastTheme=uniforms.uTheme.value;lastReflectionPosition.copy(camera.position);lastReflectionYaw=uniforms.uYaw.value;lastReflectionPitch=uniforms.uPitch.value;
    }renderer.setRenderTarget(null);
  }
  return {texture:target.texture,depth:target.depthTexture,reflection:reflection.texture,reflectionDepth:reflection.depthTexture,reflectionMatrix,inverseReflectionMatrix,
    inverseProjection,cameraMatrix,viewProjection,render,creatureStates:habitat.creatureStates,fishCount:fish.count,plantCount:plants.count,palmCount:plants.palms,
    creatures:habitat.counts,collisionViolations:()=>fish.collisionViolations()+habitat.collisionViolations(),rockCount:terrain.rocks,importedAssets:()=>({rocks:terrain.importedRocks(),fish:fish.importedFish(),errors:[terrain.modelError(),fish.modelError()].filter(Boolean)}),assetsReady:()=>terrain.assetsReady()&&fish.assetsReady()};
}
