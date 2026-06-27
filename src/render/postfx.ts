// WebGL "DARK PHOSPHOR" post pass: samples the Canvas2D scene as a texture and
// adds a phosphor bloom on the BRIGHT glyphs (CRT glow over the near-black
// field), ordered-dither halftone, scanlines, vignette and gated grain — no
// chromatic aberration (reads as a glitch). All effects respond to a LOW/HIGH
// quality uniform and a reduced-motion grain gate. Falls back gracefully
// (ok=false) to a 2D blit when WebGL is unavailable.
import { getQuality, prefersReducedMotion } from "./quality";

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 1.0 - (aPos.y * 0.5 + 0.5));
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uTime;
uniform float uShake;
uniform float uQuality; // 0.0 LOW .. 1.0 HIGH
uniform float uGrain;   // 0 disables grain (reduced-motion / LOW)

float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
float ign(vec2 p){ return fract(52.9829189 * fract(0.06711056*p.x + 0.00583715*p.y)); }

float bayer4(vec2 c){
  float x = mod(c.x, 4.0), y = mod(c.y, 4.0);
  float i = y*4.0 + x; float m;
  if(i<0.5)m=0.0; else if(i<1.5)m=8.0; else if(i<2.5)m=2.0; else if(i<3.5)m=10.0;
  else if(i<4.5)m=12.0; else if(i<5.5)m=4.0; else if(i<6.5)m=14.0; else if(i<7.5)m=6.0;
  else if(i<8.5)m=3.0; else if(i<9.5)m=11.0; else if(i<10.5)m=1.0; else if(i<11.5)m=9.0;
  else if(i<12.5)m=15.0; else if(i<13.5)m=7.0; else if(i<14.5)m=13.0; else m=5.0;
  return (m + 0.5) / 16.0;
}

// keep only the upper luminance range — the glowing glyphs
vec3 brightPass(vec3 c){ return c * smoothstep(0.20, 0.72, luma(c)); }

void main(){
  vec2 uv = vUv;
  vec2 cen = uv - 0.5;
  vec2 px = 1.0 / uRes;

  vec3 col = texture2D(uScene, uv).rgb;

  // --- phosphor bloom: ring-blur the bright glyphs, add the halo back ---
  vec3 glow = vec3(0.0); float gsum = 0.0;
  float rad = mix(2.0, 3.4, uQuality);
  for(int i=0;i<12;i++){
    float a = float(i) / 12.0 * 6.2831853;
    vec2 o = vec2(cos(a), sin(a));
    glow += brightPass(texture2D(uScene, uv + o * px * rad).rgb); gsum += 1.0;
    if(uQuality > 0.5){
      glow += brightPass(texture2D(uScene, uv + o * px * rad * 2.0).rgb) * 0.55; gsum += 0.55;
    }
  }
  glow = gsum > 0.0 ? glow / gsum : vec3(0.0);
  float bloomAmt = (0.55 + uShake * 0.5) * mix(0.7, 1.0, uQuality);
  col += glow * bloomAmt;

  // --- ordered-dither halftone (very subtle) ---
  col += (bayer4(gl_FragCoord.xy) - 0.5) * 0.03;

  // --- scanlines (gentle, resolution-aware) ---
  float sl = 0.93 + 0.07 * sin(gl_FragCoord.y * 2.094);
  col *= sl;

  // --- vignette + faint edge halation ---
  float vig = smoothstep(1.25, 0.3, length(cen) * 1.25);
  col *= mix(0.58, 1.0, vig);

  // --- grain (gated by reduced-motion / LOW) ---
  col += (ign(gl_FragCoord.xy + uTime * 60.0) - 0.5) * 0.03 * uGrain;

  gl_FragColor = vec4(col, 1.0);
}`;

export class PostFX {
  ok = false;
  private gl: WebGLRenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  constructor(private canvas: HTMLCanvasElement) {
    const gl = (canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: false }) ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return;
    try {
      const prog = this.link(gl, VERT, FRAG);
      if (!prog) return;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

      gl.useProgram(prog);
      this.loc = {
        uScene: gl.getUniformLocation(prog, "uScene"),
        uRes: gl.getUniformLocation(prog, "uRes"),
        uTime: gl.getUniformLocation(prog, "uTime"),
        uShake: gl.getUniformLocation(prog, "uShake"),
        uQuality: gl.getUniformLocation(prog, "uQuality"),
        uGrain: gl.getUniformLocation(prog, "uGrain"),
      };
      gl.uniform1i(this.loc.uScene ?? null, 0);

      this.gl = gl;
      this.prog = prog;
      this.ok = true;
    } catch {
      this.ok = false;
    }
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    if (!this.gl) return;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  render(scene: HTMLCanvasElement, time: number, shake: number): void {
    const gl = this.gl;
    if (!gl || !this.prog) return;
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
    gl.uniform2f(this.loc.uRes ?? null, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.loc.uTime ?? null, time / 1000);
    gl.uniform1f(this.loc.uShake ?? null, Math.min(1, shake));
    const high = getQuality() === "HIGH";
    gl.uniform1f(this.loc.uQuality ?? null, high ? 1 : 0);
    gl.uniform1f(this.loc.uGrain ?? null, prefersReducedMotion() || !high ? 0 : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private link(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram | null {
    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn("postfx shader:", gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };
    const v = compile(gl.VERTEX_SHADER, vs);
    const f = compile(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram();
    if (!p) return null;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn("postfx link:", gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }
}
