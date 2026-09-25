import * as THREE from 'three';
import { rockBounds } from './habitat.js';
import { terrainHeight } from './terrain.js';

export function createNavigation(canvas, uniforms, toast) {
  canvas.tabIndex=0;
  const keys=new Set();
  const touch={forward:0,right:0,vertical:0};
  const position=uniforms.uCameraPosition.value;
  const velocity=new THREE.Vector3(),desired=new THREE.Vector3();
  const movementKeys=['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','KeyC'];
  const editable=element=>element?.matches('input,textarea,select,[contenteditable=true]');
  addEventListener('keydown',event=>{
    if(editable(event.target)||!movementKeys.includes(event.code))return;
    event.preventDefault();keys.add(event.code);
  });
  addEventListener('keyup',event=>keys.delete(event.code));
  const clear=()=>{keys.clear();velocity.set(0,0,0);touch.forward=touch.right=touch.vertical=0;};
  addEventListener('blur',clear);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  document.addEventListener('mousemove',event=>{
    if(document.pointerLockElement!==canvas)return;
    uniforms.uYaw.value-=event.movementX*.002;
    uniforms.uPitch.value=THREE.MathUtils.clamp(uniforms.uPitch.value+event.movementY*.002,-1.48,1.48);
  });
  document.querySelector('#explore').onclick=async()=>{
    if(document.pointerLockElement){document.exitPointerLock();return;}
    try{await canvas.requestPointerLock();}catch{toast('Use WASD to move and drag to look around.');}
  };
  document.addEventListener('pointerlockchange',()=>{
    const active=document.pointerLockElement===canvas;
    document.body.classList.toggle('exploring',active);
    if(active)canvas.focus({preventScroll:true});
    document.querySelector('#explore').setAttribute('aria-pressed',String(active));
    if(!active)clear();
  });
  for(const button of document.querySelectorAll('[data-move]')){
    const action=button.dataset.move;
    const apply=active=>{
      if(action==='up'||action==='down')touch.vertical=active?(action==='up'?1:-1):0;
      if(action==='forward'||action==='back')touch.forward=active?(action==='forward'?1:-1):0;
      if(action==='left'||action==='right')touch.right=active?(action==='right'?1:-1):0;
      button.classList.toggle('pressed',active);
    };
    button.onpointerdown=event=>{event.preventDefault();button.setPointerCapture(event.pointerId);apply(true);};
    button.onpointerup=button.onpointercancel=()=>apply(false);
  }
  const next=new THREE.Vector3(),step=new THREE.Vector3();
  const clearOfRock=p=>!rockBounds.some(b=>p.x>b.min.x-.22&&p.x<b.max.x+.22&&p.y>b.min.y-.22&&p.y<b.max.y+.22&&p.z>b.min.z-.22&&p.z<b.max.z+.22);
  function travel(delta){
    const count=Math.max(1,Math.ceil(delta.length()/.12));step.copy(delta).divideScalar(count);
    for(let i=0;i<count;i++)for(const axis of ['x','z','y']){
      next.copy(position);next[axis]+=step[axis];next.y=THREE.MathUtils.clamp(next.y,terrainHeight(next.x,next.z)+.45,55);
      if(clearOfRock(next))position.copy(next);else velocity[axis]=0;
    }
    uniforms.uHeight.value=position.y;
  }
  return {
    verticalStep(amount){travel(new THREE.Vector3(0,amount,0));},
    moving:()=>velocity.lengthSq()>.3,
    reset(){clear();position.set(0,5.2,8);},
    update(dt){
      const f=touch.forward+Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
      const r=touch.right+Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
      const y=touch.vertical+Number(keys.has('KeyE'))-Number(keys.has('KeyQ'));
      const yaw=uniforms.uYaw.value,pitch=uniforms.uPitch.value+Math.atan(.28/1.65);
      const speed=keys.has('KeyC')?2.2:keys.has('ShiftLeft')||keys.has('ShiftRight')?25:10;
      desired.set(-Math.sin(yaw)*Math.cos(pitch)*f+Math.cos(yaw)*r,y-Math.sin(pitch)*f,-Math.cos(yaw)*Math.cos(pitch)*f-Math.sin(yaw)*r);
      if(desired.lengthSq()>1)desired.normalize();desired.multiplyScalar(speed);
      velocity.lerp(desired,1-Math.exp(-dt*(desired.lengthSq()>0?7:11)));travel(velocity.clone().multiplyScalar(dt));
      // Follow the seabed, allowing free diving below the water surface.
      position.y=THREE.MathUtils.clamp(position.y,terrainHeight(position.x,position.z)+.45,55);
      uniforms.uHeight.value=position.y;
    },
  };
}
