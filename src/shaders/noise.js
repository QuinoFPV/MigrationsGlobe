export const NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), u.x),
                 mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x),
                 mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y), u.z);
}
// fbm whose high octaves fade out when they would alias (pixel footprint fp in noise units)
float fbmAA(vec3 p, float fp, int oct) {
  float a = 0.5, s = 0.0, w = 0.0;
  for (int i = 0; i < 9; i++) {
    if (i >= oct) break;
    if (fp > 0.6) {
      // remaining octaves would alias: add their mean and stop
      float tail = 2.0 * a * (1.0 - pow(0.5, float(oct - i)));
      s += 0.5 * tail; w += tail;
      break;
    }
    float fade = 1.0 - smoothstep(0.25, 0.6, fp);
    s += a * vnoise(p) * fade + a * 0.5 * (1.0 - fade);
    w += a;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    fp *= 2.03;
    a *= 0.5;
  }
  return s / w;
}
float fbm3(vec3 p) {
  return (vnoise(p) * 0.5 + vnoise(p * 2.02 + 3.7) * 0.25 + vnoise(p * 4.08 + 7.4) * 0.125) / 0.875;
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.02 + 3.7; a *= 0.5; }
  return s / 0.96875;
}
`;
