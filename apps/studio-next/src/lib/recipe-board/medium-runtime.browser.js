// Medium pass for recipe-board shots, run in a browser page by medium.mjs.
// A finished flat motion frame is shown on an emulated display (LED / CRT / halftone) and filmed by a
// virtual camera with a 0.75-frame shutter (8 camera subframes), then a lens pass adds bloom, edge
// chroma and defocus, vignette and grain. Every output frame is a pure function of (frame image, t).
// Ported from work/recipe-board-v1/style-lab/display-v2 (see its STYLE.md for the measured numbers).
(function () {
  const KINDS = { led: 0, crt: 1, halftone: 2 };
  const bez = (x1, y1, x2, y2) => (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const cx = 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3 - x;
      const dx = 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
      if (Math.abs(dx) < 1e-6) break; t = Math.min(1, Math.max(0, t - cx / dx));
    }
    return 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
  };
  const EASE = { enter: bez(0.16, 1, 0.3, 1), move: bez(0.76, 0, 0.24, 1) };
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const prog = (f, a, len) => clamp01((f - a) / len);
  const lerp = (a, b, p) => a + (b - a) * p;

  // Camera grammar (work/recipe-board-v1/CAMERA.md). One camera owner per shot: the card's own preset may
  // already move its content, so the medium camera is LOCKED unless the shot asks for a move. No continuous
  // wobble: measured on the reference, holds are still (median 0.001 px/frame) and moves are smooth
  // (frame-to-frame velocity change ~0.1 px). Distances are in screen heights; 1.866 frames the screen
  // exactly with the 30-degree lens, `overscan` crops a little so the screen edge never shows at rest.
  //   cam: { move: 'locked'|'push'|'reframe'|'punch', amount, at, frames, to: [x, y],
  //          in: 'cut'|'whip', out: 'cut'|'whip', shake: [{ at, px, frames }], handheld: { px, hz } }
  const sineIO = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x));
  const expoOut = EASE.enter, quartIO = EASE.move;
  function camera(cam, t, fps, duration) {
    const f = t * fps, N = duration * fps, tanHalf = Math.tan(15 * Math.PI / 180);
    const rest = 1.866 / (1 + (cam.overscan ?? 0.02));
    const pxToUnits = (px, d) => px / 1080 * 2 * d * tanHalf;
    let zoom = 1, x = 0, y = 0, yaw = 0, pitch = 0;
    const move = cam.move || 'locked';
    if (move === 'push') {                     // slow push across the shot; sine in-out so it never starts or stops with a hitch
      zoom = 1 + (cam.amount ?? 0.03) * sineIO(prog(f, (cam.at ?? 0) * fps, N - (cam.at ?? 0) * fps));
    } else if (move === 'reframe') {           // A -> B in 12-20 frames, then hold
      const p = quartIO(prog(f, (cam.at ?? 0) * fps, cam.frames ?? 16));
      zoom = 1 + (cam.amount ?? 0.1) * p; x = (cam.to?.[0] ?? 0) * p; y = (cam.to?.[1] ?? 0) * p;
    } else if (move === 'punch') {             // impact: snap in 3-4 frames, then hold
      const p = expoOut(prog(f, (cam.at ?? 0) * fps, cam.frames ?? 4));
      zoom = 1 + (cam.amount ?? 0.08) * p; x = (cam.to?.[0] ?? 0) * p; y = (cam.to?.[1] ?? 0) * p;
    }
    const d = rest / zoom;
    const whip = fps * 0.3;                    // whip pans only at cuts: 9 frames in (expo out), 4 frames out (ease in)
    if (cam.in === 'whip') yaw += -0.32 * (1 - expoOut(prog(f, 0, whip)));
    if (cam.out === 'whip') { const w = prog(f, N - whip * 0.45, whip * 0.45); yaw += 0.32 * w * w; }
    for (const s of cam.shake || []) {         // impact shake: damped (zeta 0.3), gone within ~8 frames
      const k = f - s.at * fps, len = s.frames ?? 8;
      if (k < 0 || k > len) continue;
      const a = pxToUnits(s.px ?? 6, d) / d * Math.exp(-0.3 * 2 * Math.PI * (k / len) * 2.2);
      yaw += a * Math.sin(2 * Math.PI * k / len * 2); pitch += a * 0.6 * Math.sin(2 * Math.PI * k / len * 2 + 1.3);
    }
    if (cam.handheld) {                        // documentary option only: low frequency, no roll, about a pixel
      const hz = Math.min(cam.handheld.hz ?? 0.25, 0.4), a = pxToUnits(Math.min(cam.handheld.px ?? 1, 1.5), d) / d, w = 2 * Math.PI * hz * t;
      yaw += a * (Math.sin(w) * 0.7 + Math.sin(w * 1.618 + 2) * 0.3); pitch += a * (Math.sin(w * 0.83 + 1) * 0.7 + Math.sin(w * 1.41 + 4) * 0.3);
    }
    return { pos: [x, y, d], yaw, pitch, roll: 0 };
  }
  function rotMat(yaw, pitch, roll) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const Ry = [cy, 0, -sy, 0, 1, 0, sy, 0, cy], Rx = [1, 0, 0, 0, cp, sp, 0, -sp, cp], Rz = [cr, sr, 0, -sr, cr, 0, 0, 0, 1];
    const mul = (a, b) => { const o = []; for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) { let s = 0; for (let k = 0; k < 3; k++) s += a[k * 3 + r] * b[c * 3 + k]; o[c * 3 + r] = s; } return o; };
    return mul(mul(Ry, Rx), Rz);
  }

  const VS = `#version 300 es
in vec2 p; out vec2 vUv; void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p,0,1); }`;
  const SHOOT = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D content; uniform vec3 camPos; uniform mat3 camRot; uniform float tanHalf, aspect, k, medium, polarity, ledGain, ledRadius, strength, lod; uniform vec2 cells, res;
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
vec3 shade(vec2 suv){
  vec2 ndc = suv*2.0-1.0;
  vec3 dir = camRot * normalize(vec3(ndc.x*tanHalf*aspect, ndc.y*tanHalf, -1.0));
  if (dir.z >= -1e-4) return vec3(0.0);
  float s = -camPos.z / dir.z; vec3 hit = camPos + dir*s;
  vec2 uv = vec2(hit.x/aspect + 0.5, 0.5 - hit.y);
  vec3 col = vec3(0.0);
  bool inside = all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
  vec2 cellUv = uv*cells; vec2 cid = floor(cellUv); vec2 cf = fract(cellUv)-0.5;
  float foot = length(fwidth(cellUv))*0.5;
  if (medium < 0.5) {
    // LED: colour fringing happens on the content per bead, so the bead grid stays aligned in every channel
    vec2 ca = (uv-0.5)*vec2(1.6, 0.9)*smoothstep(0.15, 0.6, length(uv-0.5));
    vec2 cc = (cid+0.5)/cells;
    // one value per bead: the mip level whose texel is one cell (a box average of the full-resolution frame)
    vec3 c = vec3(textureLod(content, cc + ca/cells, lod).r, textureLod(content, cc, lod).g, textureLod(content, cc - ca/cells, lod).b);
    float r = length(cf);
    float m = 1.0 - smoothstep(ledRadius, ledRadius + max(0.1, foot*0.5), r);
    m = mix(m, 0.45, clamp((foot-0.9)/0.6, 0.0, 1.0));
    // strength fades the bead structure toward the plain picture (mean bead coverage keeps brightness)
    vec3 beads = (c*ledGain*m + vec3(0.018)*(1.0-m)*smoothstep(0.5,0.2,r)) * (0.94 + 0.12*hash(cid));
    col = mix(texture(content, uv).rgb, beads, strength);
  } else if (medium < 1.5) {
    vec2 c2 = uv*2.0-1.0; c2 *= 1.0 + 0.06*strength*dot(c2,c2); vec2 bu = c2*0.5+0.5;
    inside = all(greaterThanEqual(bu, vec2(0.0))) && all(lessThanEqual(bu, vec2(1.0)));
    vec3 c = texture(content, bu).rgb;
    float row = fract(bu.y*cells.y); float sl = mix(1.0, 0.55 + 0.45*sin(row*3.14159), clamp(1.2-foot, 0.0, 1.0));
    float gx = mod(floor(bu.x*cells.x*3.0), 3.0); vec3 grille = gx < 1.0 ? vec3(1.2,0.75,0.75) : gx < 2.0 ? vec3(0.75,1.2,0.75) : vec3(0.75,0.75,1.2);
    sl = mix(1.0, sl, strength);
    col = c*mix(1.0, 1.3, strength)*sl*mix(vec3(1.0), grille, 0.35*strength);
    col *= mix(vec3(1.0), mix(vec3(0.75,1.0,0.85), vec3(1.0), 0.6), strength);
  } else {
    // halftone: ink amount from the content; polarity 1 = light content is ink (dark themes), 0 = dark content is ink (paper themes)
    vec3 c = texture(content, uv).rgb; float l = max(c.r, max(c.g, c.b));
    float inkAmt = mix(1.0 - dot(c, vec3(0.299,0.587,0.114)), l, polarity);
    mat2 rot = mat2(0.7071,-0.7071,0.7071,0.7071); vec2 hp = rot*(uv*cells*0.8); vec2 hf = fract(hp)-0.5;
    float dotR = sqrt(clamp(inkAmt,0.0,1.0))*0.62; float ink = 1.0 - smoothstep(dotR-0.06, dotR+0.06, length(hf));
    vec3 paper = vec3(0.90,0.86,0.78) * (0.92 + 0.08*hash(floor(uv*700.0)));
    vec3 inkCol = mix(vec3(0.08,0.07,0.07), mix(c, c*0.35, polarity), 0.35);
    col = mix(paper, inkCol, ink*0.95);
    col = mix(c, col, strength);
  }
  if (!inside) col = medium > 1.5 ? vec3(0.05) : vec3(0.004);
  return col;
}
// 4 rotated-grid samples per output pixel against moire between the bead grid and the pixel grid
void main(){
  vec2 px = 1.0/res;
  vec3 col = shade(vUv + px*vec2(0.125,0.375)) + shade(vUv + px*vec2(-0.375,0.125)) + shade(vUv + px*vec2(0.375,-0.125)) + shade(vUv + px*vec2(-0.125,-0.375));
  o = vec4(col*0.25*k, 1.0);
}`;
  const BRIGHT = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D s; uniform float th; uniform vec2 span; out vec4 o;
// box-average the source footprint (4x4 taps): one tap would alias against the bead grid and leave blotches
void main(){ vec3 c = vec3(0.0); for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) c += texture(s, vUv + (vec2(float(i), float(j)) - 1.5)/4.0*span).rgb; c /= 16.0;
  float l = dot(c, vec3(.299,.587,.114)); o = vec4(c * smoothstep(th, th+0.3, l), 1.0); }`;
  const BLUR = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D s; uniform vec2 dir; out vec4 o;
void main(){ float w[5] = float[](0.227027,0.1945946,0.1216216,0.054054,0.016216); vec3 c = texture(s,vUv).rgb*w[0];
for(int i=1;i<5;i++){ c += texture(s, vUv+dir*float(i)).rgb*w[i]; c += texture(s, vUv-dir*float(i)).rgb*w[i]; } o = vec4(c,1.0); }`;
  const LENS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D src, bloom, soft; uniform vec2 res; uniform float frame, bloomK, chroma, defocus, vig, grain, paper;
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
void main(){
  vec2 c = vUv-0.5; float e = smoothstep(0.2, 0.62, length(c*vec2(1.0,0.75)));
  vec2 off = c*chroma*2.0/res.x*(2.4*e*e);
  vec3 a = mix(texture(src, vUv+off).rgb, texture(soft, vUv+off).rgb, defocus*e);
  vec3 b = mix(texture(src, vUv).rgb, texture(soft, vUv).rgb, defocus*e);
  vec3 d = mix(texture(src, vUv-off).rgb, texture(soft, vUv-off).rgb, defocus*e);
  vec3 col = vec3(a.r, b.g, d.b) + texture(bloom, vUv).rgb*bloomK*(1.0-paper*0.8);
  col = col/(1.0+col*0.18*(1.0-paper));
  col *= 1.0 - vig*pow(length(c*vec2(1.0,0.85))*1.55, 2.4);
  col += (hash(vUv*res + frame*17.0)-0.5)*grain;
  o = vec4(max(col,0.0), 1.0);
}`;

  let gl, W, H, cfg, P = {}, T = {}, contentTex;
  function program(fs) {
    const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
    const pr = gl.createProgram(); gl.attachShader(pr, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr); return pr;
  }
  function texParams() { for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v); }
  function target(w, h) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null); texParams();
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, fb, w, h };
  }
  function pass(pr, tgt, uniforms, textures) {
    gl.useProgram(pr); gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.fb : null); gl.viewport(0, 0, tgt ? tgt.w : W, tgt ? tgt.h : H);
    let unit = 0;
    for (const [name, t] of Object.entries(textures || {})) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(gl.getUniformLocation(pr, name), unit++); }
    for (const [name, v] of Object.entries(uniforms || {})) {
      const loc = gl.getUniformLocation(pr, name);
      if (Array.isArray(v)) { if (v.length === 9) gl.uniformMatrix3fv(loc, false, v); else (v.length === 2 ? gl.uniform2fv : gl.uniform3fv).call(gl, loc, v); } else gl.uniform1f(loc, v);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function blur(a, b, k) { pass(P.blur, b, { dir: [k / a.w, 0] }, { s: a.t }); pass(P.blur, a, { dir: [0, k / a.h] }, { s: b.t }); }

  // cfg: { kind, cells:[w,h], lens:{...}, led:{gain,radius}, camera:{...}, fps, duration, subframes, shutter, polarity, width, height }
  function setup(canvas, config) {
    cfg = config; W = canvas.width = config.width; H = canvas.height = config.height;
    gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float unavailable');
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    P = { shoot: program(SHOOT), bright: program(BRIGHT), blur: program(BLUR), lens: program(LENS) };
    contentTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, contentTex); texParams();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    T = { acc: target(W, H), q1: target(W / 4, H / 4), q2: target(W / 4, H / 4), s1: target(W / 2, H / 2), s2: target(W / 2, H / 2) };
  }

  // Draw output frame f from its flat content image.
  function frame(image, f) {
    const c = cfg, L = c.lens;
    gl.bindTexture(gl.TEXTURE_2D, contentTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.acc.fb); gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = 0; i < c.subframes; i++) {
      const t = Math.max(0, (f + (i / c.subframes - 0.5) * c.shutter) / c.fps);
      const cam = camera(c.camera, t, c.fps, c.duration);
      pass(P.shoot, T.acc, {
        camPos: cam.pos, camRot: rotMat(cam.yaw, cam.pitch, cam.roll), tanHalf: Math.tan(15 * Math.PI / 180), aspect: W / H,
        k: 1 / c.subframes, medium: KINDS[c.kind], polarity: c.polarity, ledGain: c.led.gain, ledRadius: c.led.radius, strength: c.strength, lod: Math.log2(image.width / c.cells[0]), cells: c.cells, res: [W, H],
      }, { content: contentTex });
    }
    gl.disable(gl.BLEND);
    pass(P.bright, T.q1, { th: L.threshold, span: [4 / W, 4 / H] }, { s: T.acc.t }); blur(T.q1, T.q2, 1.5); blur(T.q1, T.q2, 3.0);
    pass(P.bright, T.s1, { th: -1, span: [2 / W, 2 / H] }, { s: T.acc.t }); blur(T.s1, T.s2, 1.2);
    const st = c.strength;   // the lens follows the medium strength
    pass(P.lens, null, { res: [W, H], frame: f, bloomK: L.bloom * st, chroma: L.chroma * st, defocus: L.defocus * st, vig: L.vignette * st, grain: L.grain * st, paper: c.kind === 'halftone' ? st : 0 },
      { src: T.acc.t, bloom: T.q1.t, soft: T.s1.t });
    gl.finish();
  }

  window.A1Medium = { setup, frame, camera };
})();
