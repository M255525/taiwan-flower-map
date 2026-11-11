/* ================= 台灣賞花地圖：3D 場景 =================
 * Three.js（importmap 指到 jsdelivr）。台灣本島與離島輪廓、山脈脊線地形、離岸距離場沿用台灣賞鳥地圖的做法。
 * 陸地 shader：各地點依「日期 × 花期」在周圍染上當季花色，近看時地面印出一朵朵「花布」小碎花。
 * 每個地點放一個程式自繪的台灣地標（廟、涼亭、三合院、小火車、紅磚斷橋、菸樓、燈塔…），
 * 周圍依花的型態長出花樹、灌叢、花田、荷池或芒草，盛開到尾聲時樹上的花瓣會依花色飄落。
 * 座標：x = 東西、z = 南北（北為 -z）、y = 高度；1 單位約 10 公里，山高與植物大小都有誇大。
 */
(function(){
'use strict';
var S = window.FlowerScene = {ready:false};
var T, Orbit;
var EXT = {x0:-36, z0:-36, x1:18, z1:28}, RES = .25, FW = 0, FH = 0, FIELD = null;
var U = {time:{value:0}};
var renderer, scene, camera, controls, raycaster, ndc, toonGrad, clock, seaMat, landMat;
var ISL = [], SPOT3 = {}, labels = [], clouds = [], pickables = [], petals = null;
var selId = null, fly = null, showLabels = true, curDay = 60, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
var host, labelRoot, tmpV, NS = 0, SPU = null;

function P(lon, lat){ return [(lon - 120.9) * 10.17, -(lat - 23.7) * 11.1]; }
S.proj = P;
function hash(n){ var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function smooth(a, b, x){ var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function col(h){ return new T.Color(h); }
function ease(t){ return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function noise(x, z){ return .5 * Math.sin(x * 1.9 + z * .7) * Math.sin(z * 1.4 - x * .5) + .3 * Math.sin(x * 4.1 + 1.3) * Math.sin(z * 3.7 + .4) + .2 * Math.sin(x * 8.3 + z * 6.1); }

/* ---------- 幾何：多邊形與距離場 ---------- */
function segD2(x, z, a, b){
  var dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz, t = l ? ((x - a[0]) * dx + (z - a[1]) * dz) / l : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  var px = a[0] + t * dx - x, pz = a[1] + t * dz - z; return px * px + pz * pz;
}
function inPoly(x, z, poly){
  var c = false;
  for (var i = 0, n = poly.length, j = n - 1; i < n; j = i++){
    var a = poly[i], b = poly[j];
    if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) c = !c;
  }
  return c;
}
function edgeDist(x, z, poly){
  var m = 1e9;
  for (var i = 0, n = poly.length, j = n - 1; i < n; j = i++){ var d = segD2(x, z, poly[j], poly[i]); if (d < m) m = d; }
  return Math.sqrt(m);
}
function sdIsland(x, z, I){ var d = edgeDist(x, z, I.poly); return inPoly(x, z, I.poly) ? -d : d; }
function sdAll(x, z){
  var best = 1e9;
  for (var k = 0; k < ISL.length; k++){
    var bb = ISL[k].bb, bx = Math.max(bb[0] - x, 0, x - bb[2]), bz = Math.max(bb[1] - z, 0, z - bb[3]);
    if (bx * bx + bz * bz > best * best) continue;
    var d = sdIsland(x, z, ISL[k]);
    if (d < best) best = d;
    if (best < 0) return best;
  }
  return best;
}
function field(x, z){
  var fx = (x - EXT.x0) / RES, fz = (z - EXT.z0) / RES;
  if (fx < 0 || fz < 0 || fx >= FW - 1 || fz >= FH - 1) return 12;
  var i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * FW + i;
  return (FIELD[k] * (1 - u) + FIELD[k + 1] * u) * (1 - v) + (FIELD[k + FW] * (1 - u) + FIELD[k + FW + 1] * u) * v;
}
S.field = field;

var HGT = {penghu:.12, baisha:.1, xiyu:.12, kinmen:.26, lieyu:.2, nangan:.38, beigan:.4, dongyin:.3, juguang:.25,
  qimei:.14, wangan:.12, ludao:.34, lanyu:.62, liuqiu:.16, guishan:.55, keelungi:.22};
function buildPolys(){
  TF.ISLANDS.forEach(function(I, k){
    var poly;
    if (I.poly) poly = I.poly.map(function(p){ return P(p[0], p[1]); });
    else {
      var c = P(I.c[0], I.c[1]), r = I.km / 10 * 1.5, sx = I.sx || 1, sy = I.sy || 1;
      poly = [];
      for (var i = 0; i < 24; i++){
        var a = i / 24 * Math.PI * 2, rr = r * (1 + .1 * Math.sin(3 * a + k) + .06 * Math.sin(5 * a + k * 2));
        poly.push([c[0] + Math.cos(a) * rr * sx, c[1] + Math.sin(a) * rr * sy]);
      }
    }
    var bb = [1e9, 1e9, -1e9, -1e9], cx = 0, cz = 0;
    poly.forEach(function(p){ bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); cx += p[0]; cz += p[1]; });
    ISL.push({id:I.id, name:I.name, main:!!I.main, poly:poly, bb:bb, hgt:HGT[I.id] || .2, c:[cx / poly.length, cz / poly.length]});
  });
}
function buildField(){
  FW = Math.ceil((EXT.x1 - EXT.x0) / RES) + 1; FH = Math.ceil((EXT.z1 - EXT.z0) / RES) + 1;
  FIELD = new Float32Array(FW * FH);
  for (var j = 0; j < FH; j++) for (var i = 0; i < FW; i++) FIELD[j * FW + i] = sdAll(EXT.x0 + i * RES, EXT.z0 + j * RES);
  var data = new Uint8Array(FW * FH * 4);
  for (var k = 0; k < FW * FH; k++){ var d = Math.max(0, Math.min(12, FIELD[k])); data[k * 4] = Math.round(d / 12 * 255); data[k * 4 + 3] = 255; }
  var tex = new T.DataTexture(data, FW, FH, T.RGBAFormat);
  tex.magFilter = tex.minFilter = T.LinearFilter; tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping; tex.needsUpdate = true;
  return tex;
}

/* ---------- 地形 ---------- */
var RIDGES = [
  [[121.70,24.80,.6,1.2],[121.45,24.55,2.4,1.8],[121.30,24.30,3.5,2.0],[121.28,24.12,3.4,2.0],[121.22,23.85,3.3,2.1],[121.08,23.50,3.4,2.2],[121.00,23.20,3.0,2.0],[120.88,22.85,2.8,1.8],[120.78,22.55,2.7,1.6],[120.80,22.25,1.4,1.3],[120.83,22.00,.4,.8]],
  [[120.82,23.80,2.0,1.3],[120.957,23.47,3.95,1.3],[120.86,23.15,2.4,1.2]],
  [[121.55,24.72,1.6,1.3],[121.231,24.383,3.9,1.4],[121.02,24.20,2.6,1.3],[120.86,24.00,1.4,1.1]],
  [[121.53,23.78,.9,.6],[121.45,23.45,1.6,.6],[121.35,23.15,1.4,.6],[121.22,22.93,.9,.5]],
  [[121.50,25.20,.6,.6],[121.548,25.171,1.12,.7],[121.62,25.14,.7,.6]],
  [[120.62,23.30,.7,1.0],[120.72,23.65,.9,1.0],[120.80,24.35,.8,1.2]]
];
var KM = .42, RID = [];
function prepRidges(){ RID = RIDGES.map(function(r){ return r.map(function(p){ var q = P(p[0], p[1]); return [q[0], q[1], p[2] * KM, p[3]]; }); }); }
function ridgeH(x, z){
  var best = 0;
  RID.forEach(function(r){
    for (var i = 0; i < r.length - 1; i++){
      var a = r[i], b = r[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
      var t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l));
      var px = a[0] + t * dx - x, pz = a[1] + t * dz - z, d = Math.sqrt(px * px + pz * pz);
      var h = a[2] + (b[2] - a[2]) * t, w = a[3] + (b[3] - a[3]) * t;
      var v = h * Math.exp(-(d / w) * (d / w));
      if (v > best) best = v;
    }
  });
  return best;
}
var LANDC;
function landColor(h, d){
  if (h < -.01) return LANDC.under;
  if (d < .09 || h < .058) return LANDC.sand;
  if (h < .3) return LANDC.plain;
  if (h < .65) return LANDC.grass;
  if (h < 1.05) return LANDC.forest;
  if (h < 1.45) return LANDC.deep;
  if (h < 1.72) return LANDC.rock;
  return LANDC.peak;
}
function hAt(I, x, z, d){
  if (d <= 0) return Math.max(-.62, d * .9);
  var n = noise(x, z);
  if (I.main) return .05 + ridgeH(x, z) * smooth(0, 1.1, d) * (1 + .28 * n) + .03 * smooth(0, .5, d) * (n + 1);
  return .04 + I.hgt * smooth(0, Math.min(I.bb[2] - I.bb[0], I.bb[3] - I.bb[1]) * .4, d) * (1 + .2 * n);
}
function buildLand(I){
  var m = I.main ? 1.1 : .8, w = I.bb[2] - I.bb[0], res = I.main ? .12 : (w < 1 ? .05 : .08);
  var x0 = I.bb[0] - m, z0 = I.bb[1] - m, nx = Math.ceil((w + 2 * m) / res) + 1, nz = Math.ceil((I.bb[3] - I.bb[1] + 2 * m) / res) + 1;
  var pos = new Float32Array(nx * nz * 3), cols = new Float32Array(nx * nz * 3), hs = new Float32Array(nx * nz);
  for (var j = 0; j < nz; j++) for (var i = 0; i < nx; i++){
    var x = x0 + i * res, z = z0 + j * res, d = -sdIsland(x, z, I), k = j * nx + i, h = hAt(I, x, z, d);
    hs[k] = h; pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    var c = landColor(h, d); cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
  }
  var idx = [];
  for (j = 0; j < nz - 1; j++) for (i = 0; i < nx - 1; i++){
    var a = j * nx + i, b = a + 1, c2 = a + nx, d2 = c2 + 1;
    if (hs[a] > -.6 || hs[b] > -.6 || hs[c2] > -.6 || hs[d2] > -.6) idx.push(a, c2, b, b, c2, d2);
  }
  var g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('color', new T.BufferAttribute(cols, 3));
  g.setIndex(idx); g.computeVertexNormals();
  scene.add(new T.Mesh(g, landMat));
}
function landY(x, z){
  var best = null, bd = 1e9;
  ISL.forEach(function(I){ var d = sdIsland(x, z, I); if (d < bd){ bd = d; best = I; } });
  if (!best || bd > 0) return .05;
  return Math.max(.04, hAt(best, x, z, -bd));
}
S.landY = landY;

/* ---------- 陸地花色（花布小碎花） ---------- */
function bloomPatch(mat){
  mat.onBeforeCompile = function(sh){
    sh.uniforms.uSp = {value:SPU.sp}; sh.uniforms.uSc = {value:SPU.sc};
    sh.vertexShader = 'varying vec3 vP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
    sh.fragmentShader = '#define NS ' + NS + '\nuniform vec4 uSp[NS]; uniform vec3 uSc[NS]; varying vec3 vP;\n' +
      'float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
      sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + [
      'vec3 acc = vec3(0.); float sw = 0., cover = 0.;',
      'float far = smoothstep(8., 60., length(cameraPosition - vP));',
      'for (int i = 0; i < NS; i++){',
      '  vec2 dd = vP.xz - uSp[i].xy; float r = uSp[i].z * (1. + far * 1.3);',
      '  float w = uSp[i].w * exp(-dot(dd, dd) / (r * r));',
      '  acc += uSc[i] * w; sw += w; cover = max(cover, w);',
      '}',
      'float land = smoothstep(.03, .07, vP.y);',
      'vec3 fc = acc / max(sw, 1e-4);',
      'vec3 c = diffuseColor.rgb;',
      'c = mix(c, mix(c, fc, .6 + far * .3), smoothstep(.02, .5, cover) * land);',
      // 花布紋：每格一朵五瓣小花，遠看時淡出避免閃爍
      'vec2 g = vP.xz * 9.; vec2 id = floor(g); vec2 f = fract(g) - .5 + (vec2(h21(id), h21(id + 7.)) - .5) * .3;',
      'float rr = length(f), a = atan(f.y, f.x) + h21(id + 3.) * 6.283;',
      'float pet = .3 * (.5 + .5 * abs(cos(2.5 * a)));',
      'float fw = fwidth(g.x) + fwidth(g.y);',
      'float near = 1. - smoothstep(.25, .6, fw);',
      'float show = step(h21(id + 11.), cover * 1.25 - .1) * near * land;',
      'float flw = 1. - smoothstep(pet - .03 - fw * .3, pet + fw * .3, rr);',
      'float ctr = 1. - smoothstep(.06, .09 + fw * .3, rr);',
      'vec3 pc = mix(fc, vec3(1.), .12 + .1 * h21(id + 5.));',
      'c = mix(c, pc, flw * show * .95);',
      'c = mix(c, vec3(.98, .82, .25), ctr * show * .9);',
      'diffuseColor.rgb = c;'].join('\n'));
  };
  mat.customProgramCacheKey = function(){ return 'flowerbloom' + NS; };
  return mat;
}

/* ---------- 海 ---------- */
var SEA_VS = 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
var SEA_FS = [
  'uniform sampler2D uDist; uniform vec4 uExt; uniform float uTime, uCalm; uniform vec3 uHorizon; varying vec3 vW;',
  'void main(){',
  '  vec2 uv = (vW.xz - uExt.xy) / uExt.zw;',
  '  float d = texture2D(uDist, uv).r * 12.;',
  '  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) d = 12.;',
  '  vec3 col = mix(vec3(.55,.9,.84), vec3(.27,.74,.8), smoothstep(.1, 1.2, d));',
  '  col = mix(col, vec3(.09,.5,.66), smoothstep(1., 3., d));',
  '  col = mix(col, vec3(.06,.36,.56), smoothstep(3., 7., d));',
  '  col = mix(col, vec3(.04,.25,.45), smoothstep(7., 11., d));',
  '  float t = uTime * uCalm;',
  '  float w = sin(vW.x*2.1 + sin(vW.z*1.3 + t*.5)*1.6 + t*.8) * sin(vW.z*2.6 - t*.6 + sin(vW.x*1.1)*1.3);',
  '  col = mix(col, vec3(1.), smoothstep(.86, .96, w) * .38);',
  '  float f = 1. - smoothstep(.04, .15 + .05 * sin(t*2. + vW.x*5. + vW.z*3.), d);',
  '  col = mix(col, vec3(1.), f * .9);',
  '  float alpha = mix(.5, .82, smoothstep(0., 4., d));',
  '  float hz = smoothstep(60., 200., length(vW.xz - cameraPosition.xz));',
  '  col = mix(col, uHorizon, hz); alpha = mix(alpha, 1., hz);',
  '  gl_FragColor = vec4(col, alpha);',
  '}'].join('\n');
var BED_FS = [
  'uniform sampler2D uDist; uniform vec4 uExt; uniform vec3 uHorizon; varying vec3 vW;',
  'void main(){',
  '  vec2 uv = (vW.xz - uExt.xy) / uExt.zw; float d = texture2D(uDist, uv).r * 12.;',
  '  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) d = 12.;',
  '  vec3 col = mix(vec3(.6,.82,.7), vec3(.18,.5,.56), smoothstep(.2, 1.6, d));',
  '  col = mix(col, vec3(.04,.18,.34), smoothstep(2., 6., d));',
  '  float hz = smoothstep(60., 200., length(vW.xz - cameraPosition.xz)); col = mix(col, uHorizon, hz);',
  '  gl_FragColor = vec4(col, 1.);',
  '}'].join('\n');
function buildSea(tex){
  var uni = {uDist:{value:tex}, uExt:{value:new T.Vector4(EXT.x0, EXT.z0, (FW - 1) * RES, (FH - 1) * RES)},
    uTime:U.time, uCalm:{value:reduce ? .15 : 1}, uHorizon:{value:new T.Vector3(.98, .9, .86)}};
  seaMat = new T.ShaderMaterial({uniforms:uni, vertexShader:SEA_VS, fragmentShader:SEA_FS, transparent:true});
  var sea = new T.Mesh(new T.PlaneGeometry(520, 520), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(-8, 0, -4); sea.renderOrder = 2; scene.add(sea);
  var bed = new T.Mesh(new T.PlaneGeometry(520, 520), new T.ShaderMaterial({uniforms:{uDist:uni.uDist, uExt:uni.uExt, uHorizon:uni.uHorizon}, vertexShader:SEA_VS, fragmentShader:BED_FS}));
  bed.rotation.x = -Math.PI / 2; bed.position.set(-8, -.62, -4); scene.add(bed);
}

/* ---------- 自繪地標 ---------- */
var MC = {}, GC = {};
function M(c){ return MC[c] || (MC[c] = new T.MeshToonMaterial({color:c, gradientMap:toonGrad})); }
function box(w, h, d){ var k = 'b' + w + '_' + h + '_' + d; return GC[k] || (GC[k] = new T.BoxGeometry(w, h, d)); }
function roof(r, h, top, n){ var k = 'r' + r + '_' + h + '_' + (top || 0) + '_' + (n || 4); if (!GC[k]){ GC[k] = new T.CylinderGeometry(top || 0, r, h, n || 4, 1); if (!n || n === 4) GC[k].rotateY(Math.PI / 4); } return GC[k]; }
function cyl(r0, r1, h, n){ var k = 'c' + r0 + '_' + r1 + '_' + h + '_' + (n || 8); return GC[k] || (GC[k] = new T.CylinderGeometry(r0, r1, h, n || 8)); }
function ball(r, d){ var k = 's' + r + '_' + (d || 1); return GC[k] || (GC[k] = new T.IcosahedronGeometry(r, d || 1)); }
function mesh(g, c, x, y, z, ry){ var m = new T.Mesh(g, typeof c === 'string' ? M(c) : c); m.position.set(x || 0, y || 0, z || 0); if (ry) m.rotation.y = ry; return m; }
function flat(w, d, c, x, z, y){ var k = 'p' + w + '_' + d, g = GC[k] || (GC[k] = new T.PlaneGeometry(w, d)); var m = new T.Mesh(g, M(c)); m.rotation.x = -Math.PI / 2; m.position.set(x || 0, y || .006, z || 0); return m; }
function disc(r, c, x, z, y){ var g = GC['d' + r] || (GC['d' + r] = new T.CircleGeometry(r, 28)); var m = new T.Mesh(g, M(c)); m.rotation.x = -Math.PI / 2; m.position.set(x || 0, y || .006, z || 0); return m; }
var WATER = '#5fc0d6', RED = '#c8432f', BRICK = '#a8492f', TILE = '#d9762b', JADE = '#2f8a6a', CREAM = '#f6eedc', STONE = '#a9a397', WOOD = '#7a5236';

/* 燕尾脊屋頂：兩端翹起 */
function swallowRoof(w, d, c){
  var g = new T.Group();
  g.add(mesh(roof(Math.max(w, d) * .62, .06, Math.max(w, d) * .2), c, 0, .03));
  [-1, 1].forEach(function(s){ var t = mesh(cyl(.004, .012, .07, 5), JADE, s * w * .48, .07); t.rotation.z = -s * .9; g.add(t); });
  g.add(mesh(box(w * .9, .012, .014), JADE, 0, .06));
  g.scale.z = d / w;
  return g;
}
function temple(){
  var g = new T.Group();
  g.add(mesh(box(.26, .02, .18), STONE, 0, .01));
  g.add(mesh(box(.22, .08, .13), RED, 0, .06));
  var r = swallowRoof(.26, .17, TILE); r.position.y = .1; g.add(r);
  [-.07, .07].forEach(function(x){ g.add(mesh(cyl(.008, .008, .08, 6), '#7a1f17', x, .06, .07)); });
  return g;
}
function pavilion(){
  var g = new T.Group();
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function(p){ g.add(mesh(cyl(.006, .006, .09, 6), RED, p[0] * .05, .045, p[1] * .05)); });
  g.add(mesh(roof(.11, .06, .0, 6), JADE, 0, .12));
  g.add(mesh(ball(.012), '#e8c33f', 0, .16));
  g.add(mesh(box(.12, .012, .12), STONE, 0, .006));
  return g;
}
function sanheyuan(){
  var g = new T.Group();
  [[0, -.08, .26, .07, Math.PI / 2], [-.11, .02, .18, .06, 0], [.11, .02, .18, .06, 0]].forEach(function(b){
    var wing = new T.Group();
    wing.add(mesh(box(b[3], .06, b[2]), BRICK, 0, .03));
    var r = mesh(roof(b[2] * .62, .04, b[2] * .1), '#b65b3a', 0, .08); r.scale.set(b[3] / b[2] * 1.6, 1, 1); wing.add(r);
    wing.position.set(b[0], 0, b[1]); wing.rotation.y = b[4]; g.add(wing);
  });
  g.add(flat(.16, .14, '#d8c39a', 0, .03));
  return g;
}
function tower(){
  var g = new T.Group(), y = .0;
  for (var i = 0; i < 5; i++){
    var r = .085 - i * .012;
    g.add(mesh(cyl(r, r, .045, 14), CREAM, 0, y + .0225));
    g.add(mesh(roof(r * 1.3, .03, r * .5, 14), RED, 0, y + .055));
    y += .062;
  }
  g.add(mesh(cyl(.004, .004, .06, 5), '#e8c33f', 0, y + .03));
  return g;
}
function flowerClock(){
  var g = new T.Group(), d = new T.Mesh(GC.fc || (GC.fc = new T.CircleGeometry(.15, 24)), M('#f2a3c0'));
  d.rotation.x = -1.15; d.position.set(0, .07, 0); g.add(d);
  for (var i = 0; i < 12; i++){ var a = i / 12 * Math.PI * 2, b = mesh(ball(.012), i % 2 ? '#f5d33b' : '#ffffff', Math.cos(a) * .12, .07 + Math.sin(a) * .12 * Math.cos(1.15), Math.sin(a) * .12 * Math.sin(1.15) * -1 + .005); g.add(b); }
  var h = mesh(box(.008, .1, .006), '#3a2f2a', 0, .1, .012); h.rotation.x = -1.15 + Math.PI / 2 - Math.PI / 2; g.add(h);
  return g;
}
function terrace(){
  var g = new T.Group();
  for (var i = 0; i < 3; i++) g.add(mesh(box(.34 - i * .08, .025, .22 - i * .05), i % 2 ? '#8bc46a' : '#a3d27e', .02 * i, .0125 + i * .025, -.02 * i));
  g.add(mesh(box(.06, .045, .05), CREAM, .1, .1, -.04)); g.add(mesh(roof(.05, .03, .01), '#5d6b72', .1, .135, -.04));
  return g;
}
function trail(){
  var g = new T.Group();
  for (var i = 0; i < 8; i++) g.add(mesh(box(.05, .01, .03), STONE, -.18 + i * .05, .005 + i * .006, Math.sin(i * .9) * .04));
  g.add(mesh(box(.04, .07, .015), '#8d877c', .2, .035, .02));
  return g;
}
function palm(){
  var g = new T.Group();
  g.add(mesh(cyl(.006, .009, .2, 6), '#8a7a62', 0, .1));
  for (var i = 0; i < 6; i++){ var l = mesh(box(.09, .004, .02), '#3f8f4e', Math.cos(i) * .03, .2, Math.sin(i) * .03); l.rotation.y = i * 1.05; l.rotation.z = -.35; g.add(l); }
  return g;
}
function campus(){
  var g = new T.Group();
  g.add(flat(.6, .07, '#cfc6b4', 0, 0));
  for (var i = 0; i < 4; i++){ var p = palm(); p.position.set(-.24 + i * .16, 0, -.07); g.add(p); var q = palm(); q.position.set(-.24 + i * .16, 0, .07); g.add(q); }
  g.add(mesh(box(.16, .07, .06), BRICK, 0, .035, -.2)); g.add(mesh(roof(.11, .04, .03), '#5d4a42', 0, .09, -.2));
  return g;
}
function avenue(){ var g = new T.Group(); g.add(flat(.9, .07, '#9b968c', 0, 0)); g.add(flat(.9, .008, '#f4f1e6', 0, 0, .008)); return g; }
function levee(){ var g = new T.Group(); g.add(flat(.95, .12, WATER, 0, .06)); g.add(mesh(box(.95, .02, .05), '#b9b19e', 0, .01, -.03)); return g; }
function pond(){
  var g = new T.Group(); g.add(disc(.2, WATER, 0, 0));
  g.add(mesh(box(.2, .008, .03), WOOD, .05, .015, .0)); [-.03, .05, .13].forEach(function(x){ g.add(mesh(cyl(.003, .003, .02, 4), WOOD, x, .006, .0)); });
  return g;
}
function hut(c){
  var g = new T.Group();
  g.add(mesh(box(.08, .05, .06), c || CREAM, 0, .025)); g.add(mesh(roof(.065, .04, .01), '#c0533a', 0, .07));
  return g;
}
function farm(){ var g = hut(); g.add(flat(.1, .08, '#c9b48a', .1, .02)); return g; }
function fieldHut(){ var g = hut('#e9dcc0'); g.scale.setScalar(.8); return g; }
function peak(){
  var g = new T.Group();
  g.add(mesh(cyl(.0, .12, .12, 7), '#9a9a8a', 0, .06));
  g.add(mesh(box(.02, .06, .008), '#f1efe8', .09, .03, .05));
  return g;
}
function lake(){
  var g = new T.Group(); g.add(disc(.3, WATER, .05, .15));
  var p = new T.Group(); for (var i = 0; i < 4; i++){ p.add(mesh(cyl(.03 - i * .005, .03 - i * .005, .03, 8), CREAM, 0, .015 + i * .04)); p.add(mesh(roof(.04 - i * .006, .02, 0, 8), RED, 0, .04 + i * .04)); }
  p.position.set(-.12, 0, -.08); g.add(p);
  g.add(mesh(box(.06, .015, .025), '#ffffff', .12, .012, .2));
  return g;
}
function train(){
  var g = new T.Group();
  g.add(flat(.9, .025, '#6e5e50', 0, 0)); g.add(flat(.9, .006, '#cfc8bb', 0, .008, .009)); g.add(flat(.9, .006, '#cfc8bb', 0, -.008, .009));
  [-.09, 0, .09].forEach(function(x, i){ g.add(mesh(box(.08, .04, .035), i ? RED : '#2f2a2a', x, .028)); g.add(mesh(box(.07, .012, .036), CREAM, x, .03)); });
  return g;
}
function brickBridge(){
  var g = new T.Group(), tg = GC.arch || (GC.arch = new T.TorusGeometry(.045, .014, 6, 12, Math.PI));
  for (var i = 0; i < 4; i++){
    var x = -.15 + i * .1;
    g.add(mesh(box(.028, .1, .04), BRICK, x, .05));
    if (i < 3 && i !== 1){ var a = new T.Mesh(tg, M(BRICK)); a.position.set(x + .05, .1, 0); g.add(a); }
  }
  return g;
}
function cityGate(){
  var g = new T.Group();
  g.add(mesh(box(.2, .07, .08), '#b56a4a', 0, .035));
  g.add(mesh(box(.05, .045, .085), '#3a2a24', 0, .022));
  g.add(mesh(box(.12, .05, .06), RED, 0, .095));
  var r = swallowRoof(.16, .1, TILE); r.position.y = .12; g.add(r);
  return g;
}
function tobacco(){
  var g = new T.Group();
  g.add(mesh(box(.09, .13, .09), CREAM, 0, .065));
  g.add(mesh(roof(.085, .04, .03), '#4f4a48', 0, .15));
  g.add(mesh(box(.05, .025, .05), CREAM, 0, .18)); g.add(mesh(roof(.05, .025, .01), '#4f4a48', 0, .205));
  g.add(mesh(box(.1, .05, .07), BRICK, .1, .025)); g.add(mesh(roof(.07, .03, .01), '#4f4a48', .1, .065));
  return g;
}
function loneTree(){
  var g = new T.Group();
  g.add(flat(.8, .5, '#8fca6a', 0, 0, .005));
  for (var i = 0; i < 4; i++) g.add(flat(.8, .006, '#6aa85a', 0, -.18 + i * .12, .007));
  g.add(mesh(cyl(.01, .016, .12, 6), '#6e4b37', 0, .06)); g.add(mesh(ball(.07), '#3f8f4e', 0, .15));
  return g;
}
function lighthouse(){
  var g = new T.Group();
  g.add(mesh(cyl(.025, .035, .2, 10), '#ffffff', 0, .1));
  g.add(mesh(cyl(.03, .03, .02, 10), '#2c2c2c', 0, .21)); g.add(mesh(roof(.03, .03, 0, 10), RED, 0, .235));
  for (var i = 0; i < 7; i++) g.add(mesh(cyl(.02, .02, .03 + hash(i) * .05, 6), '#55534f', .1 + (i % 3) * .035, .02, -.06 + Math.floor(i / 3) * .035));
  return g;
}
function forest(){
  var g = new T.Group();
  for (var i = 0; i < 6; i++){ var x = -.18 + i * .07, z = -.14 + hash(i) * .04; g.add(mesh(cyl(.0, .035, .14, 7), '#2f6f4a', x, .1, z)); g.add(mesh(cyl(.005, .005, .04, 4), WOOD, x, .02, z)); }
  g.add(flat(.4, .03, '#9a7a56', 0, .02));
  return g;
}
function grassLm(){ var g = new T.Group(); g.add(mesh(ball(.03), STONE, .05, .015, .03)); g.add(mesh(ball(.02), STONE, -.04, .01, -.02)); return g; }
var LM = {temple:temple, pavilion:pavilion, sanheyuan:sanheyuan, tower:tower, clock:flowerClock, terrace:terrace, trail:trail, campus:campus,
  avenue:avenue, levee:levee, pond:pond, farm:farm, field:fieldHut, peak:peak, lake:lake, train:train, brickbridge:brickBridge,
  gate:cityGate, tobacco:tobacco, lonetree:loneTree, lighthouse:lighthouse, forest:forest, grass:grassLm};
var LINEAR = {avenue:1, levee:1, train:1, campus:1};

/* ---------- 花：樹、灌叢、花田、荷池、芒草 ---------- */
var TRUNK, CROWN, MOUND, BLOOM, STALK, PLUME, PAD;
var GREEN = {tree:'#5fae55', shrub:'#4e9a4f', field:'#9cc46a', grass:'#7fae5a', water:'#4f9e58'};
var STAGE_K = {off:0, bud:.12, open:.6, full:1, late:.55};
var CM = {};
function flowerMat(fid, st, form){
  var key = fid + st + form;
  if (CM[key]) return CM[key];
  var f = TF.flowerById[fid], k = STAGE_K[st], g = col(GREEN[form] || GREEN.tree), c;
  if (form === 'field' && st === 'off') c = col('#a8b47a');
  else if (st === 'late') c = g.clone().lerp(col(f.color), .5).lerp(col('#c8b49a'), .15);
  else c = g.clone().lerp(col(f.color), k);
  return (CM[key] = new T.MeshToonMaterial({color:c, gradientMap:toonGrad}));
}
var SCALE = {off:.8, bud:.85, open:.95, full:1.12, late:1};
function makeTree(big){
  var g = new T.Group(), s = big ? 1.6 : 1;
  var t = new T.Mesh(TRUNK, M('#6e4b37')); t.position.y = .05 * s; t.scale.setScalar(s); g.add(t);
  var crowns = [];
  [[0, .12, 0, 1], [-.04, .1, .025, .8], [.04, .105, -.02, .85]].forEach(function(c){
    var m = new T.Mesh(CROWN, M('#ffffff')); m.position.set(c[0] * s, c[1] * s, c[2] * s); m.scale.setScalar(c[3] * s); m.userData.k = c[3] * s; g.add(m); crowns.push(m);
  });
  g.userData.parts = crowns; g.userData.kind = 'tree';
  return g;
}
function makeShrub(){
  var g = new T.Group(), parts = [];
  [[0, .025, 0, 1], [.03, .02, .015, .75], [-.028, .02, -.012, .8]].forEach(function(c){
    var m = new T.Mesh(MOUND, M('#ffffff')); m.position.set(c[0], c[1], c[2]); m.scale.set(c[3], c[3] * .75, c[3]); m.userData.k = c[3]; parts.push(m); g.add(m);
  });
  g.userData.parts = parts; g.userData.kind = 'shrub';
  return g;
}
function makeBed(w, d){
  var g = new T.Group(), parts = [];
  g.add(mesh(box(w, .012, d), '#8a6a4a', 0, .006));
  var nx = Math.max(2, Math.round(w / .035)), nz = Math.max(2, Math.round(d / .035));
  for (var i = 0; i < nx; i++) for (var j = 0; j < nz; j++){
    var m = new T.Mesh(BLOOM, M('#ffffff')); m.position.set(-w / 2 + (i + .5) * w / nx, .02, -d / 2 + (j + .5) * d / nz);
    m.userData.k = .9 + hash(i * 3 + j * 7) * .3; parts.push(m); g.add(m);
  }
  g.userData.parts = parts; g.userData.kind = 'field';
  return g;
}
function makePond(){
  var g = new T.Group(), parts = [];
  g.add(disc(.13, WATER, 0, 0, .008));
  for (var i = 0; i < 10; i++){
    var a = i * 2.4, r = .03 + (i % 4) * .025, x = Math.cos(a) * r, z = Math.sin(a) * r;
    var p = new T.Mesh(PAD, M('#3f9a55')); p.rotation.x = -Math.PI / 2; p.position.set(x, .012, z); g.add(p);
    if (i % 2 === 0){ var b = new T.Mesh(BLOOM, M('#ffffff')); b.position.set(x + .006, .03, z); b.userData.k = 1.3; b.userData.hideOff = 1; parts.push(b); g.add(b); }
  }
  g.userData.parts = parts; g.userData.kind = 'water';
  return g;
}
function makeGrass(){
  var g = new T.Group(), parts = [];
  for (var i = 0; i < 5; i++){
    var a = i * 1.3, x = Math.cos(a) * .02, z = Math.sin(a) * .02;
    var s = new T.Mesh(STALK, M('#7d9a52')); s.position.set(x, .04, z); s.rotation.z = (hash(i) - .5) * .4; g.add(s);
    var p = new T.Mesh(PLUME, M('#ffffff')); p.position.set(x + s.rotation.z * -.04, .085, z); p.rotation.z = s.rotation.z; p.userData.k = 1; parts.push(p); g.add(p);
  }
  g.userData.parts = parts; g.userData.kind = 'grass';
  return g;
}
/* 一個地點的每種花各佔一個扇形區（線形地標則沿兩側排） */
function plantsFor(p, lm){
  var out = [], n = p.fl.length;
  p.fl.forEach(function(w, fi){
    var f = TF.flowerById[w.id], items = [];
    if (LINEAR[lm] && f.form === 'tree'){
      var side = n > 1 ? (fi % 2 ? 1 : -1) : 0;
      for (var i = 0; i < 8; i++){
        var x = -.4 + i * .115;
        if (side >= 0) items.push({x:x, z:.11, kind:'tree'});
        if (side <= 0) items.push({x:x + .05, z:-.11, kind:'tree'});
      }
    } else {
      var a0 = fi / n * Math.PI * 2 + .4, span = Math.PI * 2 / n;
      if (f.form === 'tree'){ var nt = n > 1 ? 6 : 9; for (i = 0; i < nt; i++){ var a = a0 + (i + .5) / nt * span, r = .24 + hash(i * 7.1 + fi) * .14; items.push({x:Math.cos(a) * r, z:Math.sin(a) * r, kind:'tree'}); } }
      else if (f.form === 'shrub'){ var ns = n > 1 ? 8 : 12; for (i = 0; i < ns; i++){ a = a0 + (i + .5) / ns * span; r = .2 + hash(i * 5.3 + fi) * .16; items.push({x:Math.cos(a) * r, z:Math.sin(a) * r, kind:'shrub'}); } }
      else if (f.form === 'field'){ var nb = n > 1 ? 2 : 4; for (i = 0; i < nb; i++){ a = a0 + (i + .5) / nb * span; r = .27; items.push({x:Math.cos(a) * r, z:Math.sin(a) * r, kind:'field', rot:-a}); } }
      else if (f.form === 'water'){ var nw = n > 1 ? 1 : 2; for (i = 0; i < nw; i++){ a = a0 + (i + .5) / nw * span; r = .27; items.push({x:Math.cos(a) * r, z:Math.sin(a) * r, kind:'water'}); } }
      else { var ng = n > 1 ? 10 : 18; for (i = 0; i < ng; i++){ a = a0 + (i + .5) / ng * span; r = .16 + hash(i * 3.7 + fi) * .26; items.push({x:Math.cos(a) * r, z:Math.sin(a) * r, kind:'grass'}); } }
    }
    out.push({w:w, f:f, items:items});
  });
  return out;
}

/* ---------- 標籤 ---------- */
function addLabel(el, pos, pri, kind, extra){
  el.classList.add('lab3d', 'off');
  labelRoot.appendChild(el);
  var L = Object.assign({el:el, pos:pos, pri:pri, kind:kind, w:0, h:0, active:true, off:true}, extra || {});
  labels.push(L);
  return L;
}
function layoutLabels(){
  var W = host.clientWidth, H = host.clientHeight, placed = [];
  var sorted = labels.slice().sort(function(a, b){ return (b.pri + (b.boost || 0)) - (a.pri + (a.boost || 0)); });
  for (var i = 0; i < sorted.length; i++){
    var L = sorted[i];
    if (!L.active || (L.kind === 'spot' && !showLabels && !L.boost)){ hide(L); continue; }
    tmpV.copy(L.pos).project(camera);
    if (tmpV.z > 1 || tmpV.z < -1){ hide(L); continue; }
    var x = (tmpV.x * .5 + .5) * W, y = (-tmpV.y * .5 + .5) * H;
    if (!L.w){ L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
    var r = [x - L.w / 2, y - L.h, x + L.w / 2, y];
    if (r[2] < 0 || r[0] > W || r[3] < 0 || r[1] > H){ hide(L); continue; }
    var hit = false;
    if (L.kind !== 'sea') for (var k = 0; k < placed.length; k++){ var q = placed[k]; if (r[0] < q[2] + 2 && r[2] > q[0] - 2 && r[1] < q[3] + 1 && r[3] > q[1] - 1){ hit = true; break; } }
    if (hit){ hide(L); continue; }
    if (L.kind !== 'sea') placed.push(r);
    L.el.style.transform = 'translate(' + Math.round(r[0]) + 'px,' + Math.round(r[1]) + 'px)';
    if (L.off){ L.el.classList.remove('off'); L.off = false; }
  }
  function hide(L){ if (!L.off){ L.el.classList.add('off'); L.off = true; } }
}

/* ---------- 地點 ---------- */
function onLand(x, z){
  if (field(x, z) < -.15) return [x, z];
  for (var r = .05; r < 2; r += .05) for (var a = 0; a < 16; a++){
    var px = x + Math.cos(a / 16 * Math.PI * 2) * r, pz = z + Math.sin(a / 16 * Math.PI * 2) * r;
    if (field(px, pz) < -.18) return [px, pz];
  }
  return [x, z];
}
function layoutSpots(){
  var pos = TF.SPOTS.map(function(p){ return P(p.at[0], p.at[1]); }), used = [], groups = [];
  TF.SPOTS.forEach(function(p, i){
    if (used[i]) return;
    var g = [i]; used[i] = 1;
    for (var k = i + 1; k < pos.length; k++) if (!used[k] && g.some(function(m){ return Math.hypot(pos[m][0] - pos[k][0], pos[m][1] - pos[k][1]) < .7; })){ g.push(k); used[k] = 1; }
    groups.push(g);
  });
  var out = [];
  groups.forEach(function(g){
    if (g.length === 1){ out[g[0]] = onLand(pos[g[0]][0], pos[g[0]][1]); return; }
    var cx = 0, cz = 0; g.forEach(function(m){ cx += pos[m][0]; cz += pos[m][1]; }); cx /= g.length; cz /= g.length;
    var R = .42 + g.length * .07;
    var ang = g.map(function(m){ return {m:m, a:Math.atan2(pos[m][1] - cz, pos[m][0] - cx)}; }).sort(function(p, q){ return p.a - q.a; });
    ang.forEach(function(o, i){
      var a = ang[0].a + i / ang.length * Math.PI * 2;
      out[o.m] = onLand(cx + Math.cos(a) * R, cz + Math.sin(a) * R);
    });
  });
  return out;
}
function buildSpots(){
  TRUNK = new T.CylinderGeometry(.007, .012, .1, 5);
  CROWN = new T.IcosahedronGeometry(.055, 1);
  MOUND = new T.IcosahedronGeometry(.03, 1);
  BLOOM = new T.IcosahedronGeometry(.011, 0);
  STALK = new T.CylinderGeometry(.002, .003, .08, 3);
  PLUME = new T.ConeGeometry(.012, .05, 5);
  PAD = new T.CircleGeometry(.02, 10);
  var places = layoutSpots();
  TF.SPOTS.forEach(function(p, i){
    var x = places[i][0], z = places[i][1], y = landY(x, z), grp = new T.Group();
    grp.position.set(x, y, z);
    var lm = (LM[p.lm] || hut)(p); grp.add(lm);
    var rot = LINEAR[p.lm] ? hash(i * 2.7) * 3 : 0;
    lm.rotation.y = rot;
    var c = Math.cos(rot), s = Math.sin(rot), groups = [];
    plantsFor(p, p.lm).forEach(function(G, gi){
      var objs = [];
      G.items.forEach(function(it, k){
        var tx = it.x * c + it.z * s, tz = -it.x * s + it.z * c, o;
        if (it.kind === 'tree') o = makeTree(G.items.length <= 2);
        else if (it.kind === 'shrub') o = makeShrub();
        else if (it.kind === 'field') o = makeBed(.16, .1);
        else if (it.kind === 'water') o = makePond();
        else o = makeGrass();
        o.position.set(tx, landY(x + tx, z + tz) - y, tz);
        o.rotation.y = it.rot !== undefined ? it.rot + rot : hash(k + i + gi) * 6;
        grp.add(o); objs.push(o);
      });
      groups.push({w:G.w, f:G.f, objs:objs, st:null});
    });
    grp.traverse(function(o){ if (o.isMesh){ o.userData.spotId = p.id; pickables.push(o); } });
    scene.add(grp);
    var el = document.createElement('button'); el.type = 'button'; el.className = 'plab'; el.dataset.spot = p.id;
    el.innerHTML = '<i></i>' + p.name.replace(/（.*）/, '');
    el.addEventListener('click', function(e){ e.stopPropagation(); if (S.onPickSpot) S.onPickSpot(p.id); });
    SPOT3[p.id] = {id:p.id, idx:i, x:x, y:y, z:z, grp:grp, groups:groups, best:null,
      label:addLabel(el, new T.Vector3(x, y + .5, z), 3, 'spot')};
    SPU.sp[i].set(x, z, .5, 0); SPU.sc[i].set(1, 1, 1);
  });
}
S.spot3 = function(id){ return SPOT3[id]; };
var RADIUS = {tree:1.0, shrub:.9, field:1.1, water:.9, grass:1.2};
function applyStages(){
  TF.SPOTS.forEach(function(p){
    var S3 = SPOT3[p.id];
    S3.groups.forEach(function(G){
      var st = TF.stageAt(G.w, curDay);
      if (G.st === st) return;
      G.st = st;
      var m = flowerMat(G.f.id, st, G.f.form), sc = SCALE[st];
      G.objs.forEach(function(o){ o.userData.parts.forEach(function(pt){
        pt.material = m;
        if (o.userData.kind === 'tree' || o.userData.kind === 'shrub') pt.scale.setScalar(pt.userData.k * sc);
        if (o.userData.kind === 'shrub') pt.scale.y *= .75;
        if (pt.userData.hideOff) pt.visible = st === 'open' || st === 'full' || st === 'late';
        if (o.userData.kind === 'field') pt.scale.setScalar(st === 'off' ? .5 : st === 'bud' ? .75 : pt.userData.k);
      }); });
    });
    var b = TF.spotBest(p, curDay), amt = TF.amount(b.w, curDay), c = col(b.fl.color);
    S3.best = b;
    if (b.fl.color === '#fbf7f2' || b.fl.color === '#fbfaf3' || b.fl.color === '#fdfbf7' || b.fl.color === '#fbfbf4' || b.fl.color === '#fbf8ee') c = col('#fffdf6');
    SPU.sp[S3.idx].z = RADIUS[b.fl.form] || .55; SPU.sp[S3.idx].w = amt;
    SPU.sc[S3.idx].set(c.r, c.g, c.b);
    var stg = TF.stageById[b.st];
    S3.label.el.querySelector('i').style.background = TF.isPeak(b.st) ? b.fl.color : stg.c;
    S3.label.el.dataset.st = b.st;
    S3.label.pri = 3 + (b.st === 'full' ? 1 : 0);
  });
}

/* ---------- 落花 ---------- */
var PN = 1500, PET;
function petalTex(){
  var c = document.createElement('canvas'); c.width = c.height = 64;
  var x = c.getContext('2d');
  x.translate(32, 32); x.fillStyle = '#ffffff'; x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 2.5;
  x.beginPath(); x.moveTo(0, 24); x.bezierCurveTo(-22, 10, -18, -20, 0, -24); x.bezierCurveTo(18, -20, 22, 10, 0, 24); x.closePath(); x.fill(); x.stroke();
  return new T.CanvasTexture(c);
}
function buildPetals(){
  var g = new T.BufferGeometry(), pos = new Float32Array(PN * 3), cl = new Float32Array(PN * 3);
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('color', new T.BufferAttribute(cl, 3));
  var m = new T.PointsMaterial({size:.05, map:petalTex(), vertexColors:true, transparent:true, depthWrite:false, alphaTest:.15, sizeAttenuation:true});
  petals = new T.Points(g, m); petals.frustumCulled = false; scene.add(petals);
  PET = {pos:pos, cl:cl, v:new Float32Array(PN * 4), em:[]};
  for (var i = 0; i < PN; i++) pos[i * 3 + 1] = -99;
}
function petalEmitters(){
  var em = [];
  TF.SPOTS.forEach(function(p){
    var S3 = SPOT3[p.id];
    S3.groups.forEach(function(G){
      if (G.f.form !== 'tree') return;
      var w = G.st === 'late' ? 1.3 : G.st === 'full' ? .7 : G.st === 'open' ? .1 : 0;
      if (p.id === selId) w *= 3;
      if (w) em.push({S3:S3, G:G, w:w, c:col(G.f.color)});
    });
  });
  var tot = em.reduce(function(a, e){ return a + e.w; }, 0), acc = 0;
  em.forEach(function(e){ acc += e.w / (tot || 1); e.cum = acc; });
  PET.em = em;
}
function spawn(i){
  var em = PET.em, r = Math.random(), e = null;
  for (var k = 0; k < em.length; k++) if (r <= em[k].cum){ e = em[k]; break; }
  if (!e){ PET.pos[i * 3 + 1] = -99; PET.v[i * 4 + 3] = 0; return; }
  var t = e.G.objs[(Math.random() * e.G.objs.length) | 0], wp = t.getWorldPosition(tmpV);
  PET.pos[i * 3] = wp.x + (Math.random() - .5) * .1; PET.pos[i * 3 + 1] = wp.y + .08 + Math.random() * .07; PET.pos[i * 3 + 2] = wp.z + (Math.random() - .5) * .1;
  PET.cl[i * 3] = e.c.r; PET.cl[i * 3 + 1] = e.c.g; PET.cl[i * 3 + 2] = e.c.b;
  PET.v[i * 4] = .03 + Math.random() * .05; PET.v[i * 4 + 1] = Math.random() * 6.28; PET.v[i * 4 + 2] = wp.y - .01; PET.v[i * 4 + 3] = 1;
}
function updatePetals(t, dt){
  if (!petals) return;
  var n = PET.em.length ? (reduce ? 350 : PN) : 0, pos = PET.pos, v = PET.v, k = reduce ? .35 : 1;
  for (var i = 0; i < PN; i++){
    if (i >= n){ if (pos[i * 3 + 1] > -50){ pos[i * 3 + 1] = -99; v[i * 4 + 3] = 0; } continue; }
    if (!v[i * 4 + 3] || pos[i * 3 + 1] < v[i * 4 + 2]){ if (Math.random() < .08) spawn(i); else { pos[i * 3 + 1] = -99; v[i * 4 + 3] = 0; } continue; }
    var ph = v[i * 4 + 1] + t * 2.2;
    pos[i * 3] += (Math.sin(ph) * .05 + .03) * dt * k;
    pos[i * 3 + 2] += Math.cos(ph * .7) * .03 * dt * k;
    pos[i * 3 + 1] -= v[i * 4] * dt * k;
  }
  petals.geometry.attributes.position.needsUpdate = true;
  petals.geometry.attributes.color.needsUpdate = true;
}

/* ---------- 雲 ---------- */
function cloud(seed){
  var g = new T.Group(), m = new T.MeshToonMaterial({color:'#ffffff', gradientMap:toonGrad, transparent:true, opacity:.95});
  var n = 4 + (seed % 3);
  for (var i = 0; i < n; i++){
    var r = .9 + hash(seed * 7 + i) * .9, s = new T.Mesh(new T.SphereGeometry(r, 12, 9), m);
    s.position.set((i - n / 2) * 1.1 + hash(seed + i) * .6, hash(seed * 3 + i) * .5, (hash(seed * 5 + i) - .5) * 1.4);
    s.scale.y = .62; g.add(s);
  }
  return g;
}

/* ---------- 鏡頭 ---------- */
S.flyTo = function(x, z, dist, polar, dur, y){
  var off = camera.position.clone().sub(controls.target), sph = new T.Spherical().setFromVector3(off);
  var to = new T.Spherical(dist, polar === undefined ? .9 : polar, sph.theta);
  var endT = new T.Vector3(x, y || 0, z), endP = new T.Vector3().setFromSpherical(to).add(endT);
  fly = {t0:clock.elapsedTime, dur:reduce ? .01 : (dur || 1.3), fromT:controls.target.clone(), toT:endT, fromP:camera.position.clone(), toP:endP};
};
function aspectK(){ var a = host.clientWidth / Math.max(1, host.clientHeight); return a < .8 ? 1.45 : 1; }
S.overview = function(){
  var a = host.clientWidth / Math.max(1, host.clientHeight);
  S.flyTo(-6, 0, a < .8 ? 100 : a < 1.2 ? 80 : 66, .6);
};
S.focusSpot = function(id){
  var S3 = SPOT3[id]; if (!S3) return;
  S.flyTo(S3.x, S3.z, (S3.y > .4 ? 5.6 : 5) * aspectK(), .9, 1.3, S3.y * .8);
};
S.focusRegion = function(ids){
  var xs = [], zs = [];
  ids.forEach(function(id){ var S3 = SPOT3[id]; if (S3){ xs.push(S3.x); zs.push(S3.z); } });
  if (!xs.length) return;
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
  S.flyTo((x0 + x1) / 2, (z0 + z1) / 2, Math.max(9, Math.max(x1 - x0, z1 - z0) * 1.5 + 6) * aspectK(), .8);
};

/* ---------- 對外 ---------- */
S.setDay = function(d){
  curDay = d;
  if (!S.ready) return;
  applyStages(); petalEmitters();
};
S.selectSpot = function(id){
  if (selId && SPOT3[selId]){ SPOT3[selId].label.el.classList.remove('on'); SPOT3[selId].label.boost = 0; SPOT3[selId].label.w = 0; }
  selId = id || null;
  if (selId && SPOT3[selId]){ SPOT3[selId].label.el.classList.add('on'); SPOT3[selId].label.boost = 10; SPOT3[selId].label.w = 0; }
  if (S.ready) petalEmitters();
};
S.setLabels = function(on){ showLabels = !!on; };
S.setReduce = function(on){ reduce = !!on; if (seaMat) seaMat.uniforms.uCalm.value = reduce ? .15 : 1; };
S.resize = function(){ if (S.ready) resize(); };
S.setHorizon = function(c){ if (seaMat) seaMat.uniforms.uHorizon.value.set(c[0], c[1], c[2]); };

/* ---------- 互動 ---------- */
function pick(ev){
  var r = renderer.domElement.getBoundingClientRect();
  ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  var hit = raycaster.intersectObjects(pickables, false)[0];
  return hit ? hit.object.userData : null;
}
function bindPointer(){
  var el = renderer.domElement, down = null, q = null, pending = false;
  el.addEventListener('pointerdown', function(e){ down = {x:e.clientX, y:e.clientY}; });
  el.addEventListener('pointerup', function(e){
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    down = null;
    var u = pick(e); if (u && u.spotId && S.onPickSpot) S.onPickSpot(u.spotId);
  });
  el.addEventListener('pointermove', function(e){
    if (e.pointerType !== 'mouse') return;
    q = e; if (pending) return; pending = true;
    requestAnimationFrame(function(){ pending = false; el.style.cursor = pick(q) ? 'pointer' : ''; });
  });
}

/* ---------- 迴圈 ---------- */
function resize(){
  var w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h);
  if (w > 760) camera.setViewOffset(w, h, Math.min(190, w * .13), 0, w, h);
  else camera.setViewOffset(w, h, 0, document.body.classList.contains('sheet-min') ? -h * .09 : h * .1, w, h);
  camera.updateProjectionMatrix();
  labels.forEach(function(L){ L.w = 0; });
}
function loop(){
  requestAnimationFrame(loop);
  var dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
  U.time.value = t;
  if (fly){
    var k = Math.min(1, (t - fly.t0) / fly.dur), e = ease(k);
    controls.target.lerpVectors(fly.fromT, fly.toT, e); camera.position.lerpVectors(fly.fromP, fly.toP, e);
    if (k >= 1) fly = null;
  }
  controls.update();
  updatePetals(t, dt);
  clouds.forEach(function(C){ C.g.position.x += dt * C.v * (reduce ? .3 : 1); if (C.g.position.x > EXT.x1 + 20) C.g.position.x = EXT.x0 - 20; });
  var S3 = selId && SPOT3[selId];
  if (S3 && !reduce) S3.groups.forEach(function(G){ G.objs.forEach(function(o){ if (o.userData.kind !== 'water') o.rotation.z = Math.sin(t * 1.6 + o.position.x * 9) * (o.userData.kind === 'grass' ? .12 : .03); }); });
  renderer.render(scene, camera);
  layoutLabels();
}

/* ---------- 啟動 ---------- */
S.init = function(opts){
  host = opts.host; labelRoot = opts.labels;
  if (opts.reduce !== undefined) reduce = opts.reduce;
  if (opts.day) curDay = opts.day;
  return Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]).then(function(mods){
    T = mods[0]; Orbit = mods[1].OrbitControls; tmpV = new T.Vector3();
    clock = new T.Clock();
    NS = TF.SPOTS.length;
    SPU = {sp:[], sc:[]}; for (var q = 0; q < NS; q++){ SPU.sp.push(new T.Vector4(0, 0, .5, 0)); SPU.sc.push(new T.Vector3(1, 1, 1)); }
    LANDC = {under:col('#9fd3bf'), sand:col('#f1dfa6'), plain:col('#a8d983'), grass:col('#7fc463'), forest:col('#55a35a'), deep:col('#3f8a55'), rock:col('#93a08b'), peak:col('#c9cfbf')};
    renderer = new T.WebGLRenderer({antialias:true, alpha:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(42, 1, .03, 600);
    camera.position.set(-6, 44, 34);
    controls = new Orbit(camera, renderer.domElement);
    controls.target.set(-6, 0, -3);
    controls.enableDamping = true; controls.dampingFactor = .08;
    controls.maxPolarAngle = 1.3; controls.minDistance = 1; controls.maxDistance = 140;
    controls.screenSpacePanning = false; controls.zoomSpeed = .9;
    controls.addEventListener('start', function(){ fly = null; });
    raycaster = new T.Raycaster(); ndc = new T.Vector2();
    toonGrad = new T.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, T.RedFormat);
    toonGrad.minFilter = toonGrad.magFilter = T.NearestFilter; toonGrad.needsUpdate = true;
    landMat = bloomPatch(new T.MeshToonMaterial({vertexColors:true, gradientMap:toonGrad}));
    scene.add(new T.HemisphereLight('#fff6ee', '#9fcf8a', 1.5));
    var sun = new T.DirectionalLight('#fff1dc', 2.4); sun.position.set(-20, 40, 18); scene.add(sun);
    scene.add(new T.AmbientLight('#ffffff', .35));

    buildPolys(); prepRidges();
    var tex = buildField();
    buildSea(tex);
    ISL.forEach(buildLand);
    buildSpots(); buildPetals();

    ISL.forEach(function(I){
      if (!I.name) return;
      var el = document.createElement('div'); el.className = I.main ? 'ilab main' : 'ilab'; el.textContent = I.name;
      var at = I.main ? new T.Vector3(1.5, 2.6, -2) : new T.Vector3(I.c[0], .5, I.c[1] - .2);
      addLabel(el, at, I.main ? 5 : 2, 'isle');
    });
    TF.PEAKS.forEach(function(pk){
      var q = P(pk.at[0], pk.at[1]), el = document.createElement('div'); el.className = 'pk';
      el.textContent = '▲ ' + pk.name + ' ' + pk.m.toLocaleString() + 'm';
      addLabel(el, new T.Vector3(q[0], landY(q[0], q[1]) + .25, q[1]), 1, 'peak');
    });
    [['台灣海峽', 119.6, 24.25], ['太平洋', 122.6, 23.3], ['巴士海峽', 120.6, 21.3]].forEach(function(s){
      var q = P(s[1], s[2]), el = document.createElement('div'); el.className = 'sealab'; el.textContent = s[0];
      addLabel(el, new T.Vector3(q[0], .1, q[1]), 0, 'sea');
    });
    for (var i = 0; i < 7; i++){
      var c = cloud(i + 1); c.position.set(EXT.x0 + hash(i * 3.3) * (EXT.x1 - EXT.x0 + 20), 13 + hash(i * 1.9) * 3, EXT.z0 + hash(i * 4.7) * (EXT.z1 - EXT.z0));
      c.scale.setScalar(.6 + hash(i * 2.2) * .5); scene.add(c); clouds.push({g:c, v:.25 + hash(i) * .3});
    }

    bindPointer();
    window.addEventListener('resize', resize); resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
    S.ready = true;
    S.setDay(curDay);
    S.overview(); fly.dur = .01;
    loop();
  });
};
S.stats = function(){
  var bloom = 0; if (SPU) SPU.sp.forEach(function(v){ if (v.w > .05) bloom++; });
  return {spots:Object.keys(SPOT3).length, islands:ISL.length, labels:labels.length, visibleLabels:labels.filter(function(L){ return !L.off; }).length,
    petals:PET ? PET.em.length : 0, livePetals:PET ? Array.prototype.filter.call(PET.v, function(v, i){ return i % 4 === 3 && v; }).length : 0, bloomSpots:bloom, day:curDay};
};
})();
