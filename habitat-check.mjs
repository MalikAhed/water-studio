import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rockBounds, safeSpawn, swimTo, aquaticFree, createHabitat } from './src/habitat.js';
import { createFish } from './src/life.js';
import { createTerrain } from './src/terrain.js';
// Deliberately obstruct the main swimming lanes with large rock bounds.
rockBounds.push(new THREE.Box3(new THREE.Vector3(-3,-4,-5),new THREE.Vector3(1,.5,-2)));
rockBounds.push(new THREE.Box3(new THREE.Vector3(3,-4,-14),new THREE.Vector3(7,1,-10)));
const start=safeSpawn(new THREE.Vector3(-5,-1.6,-3),.95);
swimTo(start,new THREE.Vector3(5,-1.6,-3),.95);
assert(aquaticFree(start,.95));assert(start.x< -3,'Swept steps must not tunnel through a rock');
let seed=931;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const scene=new THREE.Scene(),fish=createFish(scene,new THREE.Texture(),{value:0},random),habitat=createHabitat(scene,random);
for(let frame=0;frame<1800;frame++){
  const t=frame/15;fish.update(t);habitat.update(t);
  assert.equal(fish.collisionViolations(),0,`Fish collision at ${t}`);
  assert.equal(habitat.collisionViolations(),0,`Animal collision at ${t}`);
}
console.log('120 simulated seconds: fish and swimming animals clear rocks, seabed, and surface; swept collision passed.');

rockBounds.length=0;
THREE.TextureLoader.prototype.load=function(_url,onLoad){onLoad?.();return new THREE.Texture();};
const realScene=new THREE.Scene();createTerrain(realScene,{capabilities:{getMaxAnisotropy:()=>4}},new THREE.Texture(),random);
const realFish=createFish(realScene,new THREE.Texture(),{value:0},random),realHabitat=createHabitat(realScene,random);
for(let frame=0;frame<1800;frame++){
  realFish.update(frame/15);realHabitat.update(frame/15);
  assert.equal(realFish.collisionViolations()+realHabitat.collisionViolations(),0,`Collision with actual island geometry at frame ${frame}`);
}
assert.equal(rockBounds.length,70);
console.log('120 additional simulated seconds: all swimmers clear the 70 actual angular-rock bounds.');
