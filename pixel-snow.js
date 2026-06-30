import {
  Color,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer
} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const vertexShader = `
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

// Combined wave generation + dithering in a single pass
// (replaces the original's two-pass Canvas + EffectComposer pipeline)
const fragmentShader = `
precision highp float;

uniform vec2  uResolution;
uniform float uTime;
uniform float uWaveSpeed;
uniform float uWaveFrequency;
uniform float uWaveAmplitude;
uniform vec3  uWaveColor;
uniform vec2  uMousePos;
uniform int   uEnableMouseInteraction;
uniform float uMouseRadius;
uniform float uColorNum;
uniform float uPixelSize;

vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0,0.0,1.0,1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0,0.0,1.0,1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0/41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00,g00), dot(g01,g01), dot(g10,g10), dot(g11,g11)));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
}

const int OCTAVES = 4;
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  float freq = uWaveFrequency;
  for (int i = 0; i < OCTAVES; i++) {
    value += amp * abs(cnoise(p));
    p *= freq;
    amp *= uWaveAmplitude;
  }
  return value;
}

float pattern(vec2 p) {
  vec2 p2 = p - uTime * uWaveSpeed;
  return fbm(p + fbm(p2));
}

const float bayerMatrix8x8[64] = float[64](
  0.0/64.0, 48.0/64.0, 12.0/64.0, 60.0/64.0,  3.0/64.0, 51.0/64.0, 15.0/64.0, 63.0/64.0,
  32.0/64.0,16.0/64.0, 44.0/64.0, 28.0/64.0, 35.0/64.0,19.0/64.0, 47.0/64.0, 31.0/64.0,
  8.0/64.0, 56.0/64.0,  4.0/64.0, 52.0/64.0, 11.0/64.0,59.0/64.0,  7.0/64.0, 55.0/64.0,
  40.0/64.0,24.0/64.0, 36.0/64.0, 20.0/64.0, 43.0/64.0,27.0/64.0, 39.0/64.0, 23.0/64.0,
  2.0/64.0, 50.0/64.0, 14.0/64.0, 62.0/64.0,  1.0/64.0,49.0/64.0, 13.0/64.0, 61.0/64.0,
  34.0/64.0,18.0/64.0, 46.0/64.0, 30.0/64.0, 33.0/64.0,17.0/64.0, 45.0/64.0, 29.0/64.0,
  10.0/64.0,58.0/64.0,  6.0/64.0, 54.0/64.0,  9.0/64.0,57.0/64.0,  5.0/64.0, 53.0/64.0,
  42.0/64.0,26.0/64.0, 38.0/64.0, 22.0/64.0, 41.0/64.0,25.0/64.0, 37.0/64.0, 21.0/64.0
);

vec3 dither(vec2 fragCoord, vec3 color) {
  vec2 scaledCoord = floor(fragCoord / uPixelSize);
  int x = int(mod(scaledCoord.x, 8.0));
  int y = int(mod(scaledCoord.y, 8.0));
  float threshold = bayerMatrix8x8[y * 8 + x] - 0.25;
  float step = 1.0 / (uColorNum - 1.0);
  color += threshold * step;
  float bias = 0.2;
  color = clamp(color - bias, 0.0, 1.0);
  return floor(color * (uColorNum - 1.0) + 0.5) / (uColorNum - 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  uv -= 0.5;
  uv.x *= uResolution.x / uResolution.y;

  float f = pattern(uv);

  if (uEnableMouseInteraction == 1) {
    vec2 mouseNDC = (uMousePos / uResolution - 0.5) * vec2(1.0, -1.0);
    mouseNDC.x *= uResolution.x / uResolution.y;
    float dist = length(uv - mouseNDC);
    float effect = 1.0 - smoothstep(0.0, uMouseRadius, dist);
    f -= 0.5 * effect;
  }

  vec3 col = mix(vec3(0.0), uWaveColor, f);

  vec2 pixelFragCoord = floor(gl_FragCoord.xy / uPixelSize) * uPixelSize;
  col = dither(pixelFragCoord, col);

  gl_FragColor = vec4(col, 1.0);
}
`;

function createDither(container, options) {
  options = options || {};
  const config = {
    waveSpeed: options.waveSpeed ?? 0.05,
    waveFrequency: options.waveFrequency ?? 3,
    waveAmplitude: options.waveAmplitude ?? 0.3,
    waveColor: options.waveColor || [0.5, 0.5, 0.5],
    colorNum: options.colorNum ?? 4,
    pixelSize: options.pixelSize ?? 2,
    disableAnimation: options.disableAnimation || false,
    enableMouseInteraction: options.enableMouseInteraction !== false,
    mouseRadius: options.mouseRadius ?? 1
  };

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const renderer = new WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });

  renderer.setPixelRatio(1);
  renderer.setSize(container.offsetWidth || 1, container.offsetHeight || 1);
  container.appendChild(renderer.domElement);

  const waveColorObj = new Color(config.waveColor[0], config.waveColor[1], config.waveColor[2]);

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uResolution: { value: new Vector2(container.offsetWidth || 1, container.offsetHeight || 1) },
      uTime: { value: 0 },
      uWaveSpeed: { value: config.waveSpeed },
      uWaveFrequency: { value: config.waveFrequency },
      uWaveAmplitude: { value: config.waveAmplitude },
      uWaveColor: { value: waveColorObj },
      uMousePos: { value: new Vector2(0, 0) },
      uEnableMouseInteraction: { value: config.enableMouseInteraction ? 1 : 0 },
      uMouseRadius: { value: config.mouseRadius },
      uColorNum: { value: config.colorNum },
      uPixelSize: { value: config.pixelSize }
    }
  });

  const geometry = new PlaneGeometry(2, 2);
  scene.add(new Mesh(geometry, material));

  let isVisible = true;
  let isPlaying = true;
  let animationId = 0;
  let resizeTimeout = null;

  const observer = new IntersectionObserver(
    function (entries) { isVisible = entries[0].isIntersecting; },
    { threshold: 0 }
  );
  observer.observe(container);

  function handleResize() {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = window.setTimeout(function () {
      const w = container.offsetWidth || 1;
      const h = container.offsetHeight || 1;
      renderer.setSize(w, h);
      material.uniforms.uResolution.value.set(w, h);
    }, 100);
  }
  window.addEventListener('resize', handleResize);

  function handlePointerMove(e) {
    if (!config.enableMouseInteraction) return;
    const rect = renderer.domElement.getBoundingClientRect();
    material.uniforms.uMousePos.value.set(e.clientX - rect.left, e.clientY - rect.top);
  }
  renderer.domElement.addEventListener('pointermove', handlePointerMove);

  const startTime = performance.now();
  function animate() {
    animationId = requestAnimationFrame(animate);
    if (isVisible && isPlaying) {
      if (!config.disableAnimation) {
        material.uniforms.uTime.value = (performance.now() - startTime) * 0.001;
      }
      renderer.render(scene, camera);
    }
  }
  animate();

  return {
    pause: function () { isPlaying = false; },
    resume: function () {
      isPlaying = true;
      handleResize();
    },
    setColor: function (hexOrRgb) {
      // Accepts either a hex string ("#0a6e66") or an [r,g,b] array in 0-1 range
      if (typeof hexOrRgb === 'string') {
        waveColorObj.set(hexOrRgb);
      } else {
        waveColorObj.setRGB(hexOrRgb[0], hexOrRgb[1], hexOrRgb[2]);
      }
    },
    destroy: function () {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      observer.disconnect();
      if (resizeTimeout) clearTimeout(resizeTimeout);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
      renderer.forceContextLoss();
      geometry.dispose();
      material.dispose();
    }
  };
}

// Auto-init on the #pixel-snow-bg container behind the welcome state
const container = document.getElementById('pixel-snow-bg');
if (container) {
  const savedColor = localStorage.getItem('pixelSnowColor');
  const initialColor = savedColor ? hexToRgbArray(savedColor) : [0.0, 0.43, 0.4];

  window.pixelSnow = createDither(container, {
    waveColor: initialColor,
    waveSpeed: 0.04,
    waveFrequency: 3,
    waveAmplitude: 0.3,
    colorNum: 4,
    pixelSize: 2,
    enableMouseInteraction: true,
    mouseRadius: 0.3
  });
}

function hexToRgbArray(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  return [r, g, b];
}