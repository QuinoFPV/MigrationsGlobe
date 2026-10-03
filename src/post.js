import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uFocus: { value: new THREE.Vector2(0.5, 0.5) },
    uFocusR: { value: 0.35 },
    uBlur: { value: 0.4 },
    uWarp: { value: 0 },
    uGrain: { value: 0.055 },
    uVignette: { value: 1 },
    uFade: { value: 0 },
    uCA: { value: 1 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime;
    uniform vec2 uFocus; uniform float uFocusR; uniform float uBlur; uniform float uWarp;
    uniform float uGrain; uniform float uVignette; uniform float uFade; uniform float uCA;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 asp = vec2(uRes.x / uRes.y, 1.0);
      vec2 dv = (vUv - uFocus) * asp;
      float coc = smoothstep(uFocusR, uFocusR + 0.55, length(dv)) * uBlur;
      vec2 px = 1.0 / uRes;
      vec3 acc = vec3(0.0); float wsum = 0.0;
      float ga = 2.39996;
      // golden-angle bokeh disc
      for (int i = 0; i < 24; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / 24.0) * coc * 14.0;
        vec2 o = vec2(cos(fi * ga), sin(fi * ga)) * r * px * uRes.y / 900.0 * 1.5;
        vec3 c = texture2D(tDiffuse, vUv + o).rgb;
        float w = 1.0 + dot(c, vec3(0.3)) * 2.0;
        acc += c * w; wsum += w;
      }
      vec3 col = acc / wsum;
      // time-warp radial streak
      if (uWarp > 0.001) {
        vec3 wacc = vec3(0.0);
        vec2 dir = (vUv - uFocus);
        for (int i = 0; i < 12; i++) {
          float s = 1.0 - float(i) * 0.012 * uWarp;
          wacc += texture2D(tDiffuse, uFocus + dir * s).rgb;
        }
        col = mix(col, wacc / 12.0, clamp(uWarp, 0.0, 1.0) * 0.85);
      }
      // chromatic fringe toward the edges
      vec2 cd = (vUv - 0.5);
      float ca = dot(cd, cd) * 0.006 * uCA;
      col.r = mix(col.r, texture2D(tDiffuse, vUv + cd * ca * 2.0).r, 0.6);
      col.b = mix(col.b, texture2D(tDiffuse, vUv - cd * ca * 2.0).b, 0.6);
      // vignette
      float v = smoothstep(1.25, 0.25, length(cd * vec2(1.0, 0.85)) * 1.45);
      col *= mix(1.0, v, uVignette);
      // film grain (luma-weighted)
      float g = h(vUv * uRes + fract(uTime) * 1000.0) - 0.5;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col += g * uGrain * (0.35 + 0.65 * (1.0 - lum));
      col *= uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createPost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.9, 0.55, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const final = new ShaderPass(FinalShader);
  composer.addPass(final);
  return { composer, bloom, final, u: final.uniforms };
}
