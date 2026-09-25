import * as THREE from 'three';

// A refracted light grid concentrates energy where its projected triangles shrink.
export function createCaustics(renderer) {
  const target = new THREE.WebGLRenderTarget(384, 384, {
    type: THREE.HalfFloatType, depthBuffer: false,
    wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
  });
  const scene = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uStrength: { value: .65 } },
    depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    transparent: true, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime, uStrength;
      varying vec2 vOriginal, vFocused;
      void main() {
        vec2 p = position.xy;
        vec2 gradient = vec2(0.);
        for (int i = 0; i < 5; i++) {
          float f = float(i);
          vec2 k = vec2(2. + f, 3. - f * 2.) * .2617994;
          float phase = dot(k, p) + uTime * (.6 + f * .17);
          gradient += k * cos(phase) * (.12 / (1. + f * .3));
        }
        vec3 n = normalize(vec3(-gradient.x * uStrength, 1., -gradient.y * uStrength));
        vec3 ray = refract(normalize(vec3(.24,-1.,.12)), n, 1./1.333);
        vec2 hit = p + ray.xz * (-3.6 / ray.y);
        vOriginal = p; vFocused = hit;
        gl_Position = vec4(hit / 12., 0., 1.);
      }`,
    fragmentShader: `
      varying vec2 vOriginal, vFocused;
      float area(vec2 dx, vec2 dy) { return abs(dx.x * dy.y - dx.y * dy.x); }
      void main() {
        float before = area(dFdx(vOriginal), dFdy(vOriginal));
        float after = area(dFdx(vFocused), dFdy(vFocused));
        float focus = min(before / max(after, .000001), 10.);
        gl_FragColor = vec4(vec3(focus * .18), 1.);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(32, 32, 100, 100), material));
  return {
    texture: target.texture,
    render(time, strength) {
      material.uniforms.uTime.value = time;
      material.uniforms.uStrength.value = .7 + strength * .9;
      renderer.setRenderTarget(target);
      renderer.render(scene, new THREE.Camera());
      renderer.setRenderTarget(null);
    },
  };
}

export function addCaustics(material, texture) {
  if(!texture)return material;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => previousKey + "-caustics-v1";
  material.onBeforeCompile = shader => {
    previous.call(material, shader);
    shader.uniforms.uCaustics = { value: texture };
    shader.vertexShader = 'varying vec3 vCausticWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      vec4 causticPosition=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        causticPosition=instanceMatrix*causticPosition;
      #endif
      vCausticWorld = (modelMatrix * causticPosition).xyz;
      #include <project_vertex>`);
    shader.fragmentShader = 'uniform sampler2D uCaustics; varying vec3 vCausticWorld;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float underwater = 1. - smoothstep(-.3, .05, vCausticWorld.y);
      float focus = texture2D(uCaustics, vCausticWorld.xz / 24.).r;
      outgoingLight *= 1. + underwater * (focus - .16) * 1.45;
      #include <opaque_fragment>`);
  };
  return material;
}
