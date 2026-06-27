// WebGL "deluxe" post pass: samples the Canvas2D scene as a texture and adds a
// soft ink-bloom, ordered-dither halftone, chromatic aberration (eased up on
// impact), scanlines, vignette and grain — all while keeping the day/parchment
// palette. Falls back gracefully (ok=false) when WebGL is unavailable.

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

void main(){
  vec2 uv = vUv;
  vec2 cen = uv - 0.5;
  vec2 px = 1.0 / uRes;

  // chromatic aberration — tiny at rest, jumps on impact (uShake)
  float ab = (0.0012 + uShake * 0.010);
  vec3 col;
  col.r = texture2D(uScene, uv + cen * ab).r;
  col.g = texture2D(uScene, uv).g;
  col.b = texture2D(uScene, uv - cen * ab).b;

  // cheap ink-bloom: bleed the colored/dark marks (not the bright parchment)
  vec3 glow = vec3(0.0); float gw = 0.0;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec3 s = texture2D(uScene, uv + vec2(float(i), float(j)) * px * 2.0).rgb;
    float ink = 1.0 - luma(s);
    glow += s * ink; gw += ink;
  }
  glow = gw > 0.0 ? glow / gw : col;
  float bloomAmt = 0.16 + uShake * 0.28;
  col += (glow - col) * clamp(1.0 - luma(col), 0.0, 1.0) * bloomAmt;

  // ordered-dither halftone (subtle printed texture)
  col += (bayer4(gl_FragCoord.xy) - 0.5) * 0.045;

  // scanlines (gentle, resolution-aware)
  float sl = 0.96 + 0.04 * sin(gl_FragCoord.y * 2.094);
  col *= sl;

  // vignette
  float vig = smoothstep(1.2, 0.35, length(cen) * 1.25);
  col *= mix(0.84, 1.0, vig);

  // grain
  col += (ign(gl_FragCoord.xy + uTime * 60.0) - 0.5) * 0.022;

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
