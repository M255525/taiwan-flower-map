/* ================= 台灣賞花地圖：介面 ================= */
(function(){
'use strict';
var $ = function(id){ return document.getElementById(id); };
var PREF_KEY = 'taiwanFlowerPrefs', SET_KEY = 'taiwanFlowerSettings', SEEN_KEY = 'taiwanFlowerSeenWarning', SEC_KEY = 'taiwanFlowerSetOpen';
var JUN = ['上旬', '中旬', '下旬'], MN = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
var FORM = {tree:'花樹', shrub:'灌叢', field:'花田', water:'水生', grass:'芒草'};

function lsGet(k, d){ try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e){ return d; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e){} }
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]; }); }
function todayDoy(){ var n = new Date(), s = new Date(n.getFullYear(), 0, 1); return Math.min(365, Math.floor((n - s) / 864e5) + 1); }

var set = Object.assign({day:'today', mode:'spots', labels:true, motion:'auto', theme:'auto', play:400}, lsGet(SET_KEY, {}));
var pref = lsGet(PREF_KEY, {});
function startDay(){
  if (set.day === 'last' && pref.day) return TF.wrap(pref.day);
  return todayDoy();
}
var st = {day:startDay(), mode:set.mode === 'flowers' ? 'flowers' : 'spots', region:TF.regionById[pref.region] ? pref.region : 'all', spot:TF.spotById[pref.spot] ? pref.spot : null};
if (st.spot) st.region = TF.spotById[st.spot].r;
function save(){ lsSet(PREF_KEY, {day:st.day, region:st.region, spot:st.spot}); }
function reduceOn(){ return set.motion === 'reduce' || (set.motion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches); }
function applyTheme(){ if (set.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', set.theme); }
applyTheme();

function junOf(d){ var x = TF.md(d); return MN[x.m - 1] + JUN[x.d <= 10 ? 0 : x.d <= 20 ? 1 : 2]; }
function stChip(id, extra){ var s = TF.stageById[id]; return '<span class="stchip st-' + id + '" title="' + esc(s.tip) + '">' + s.name + (extra || '') + '</span>'; }
function photoOf(f){ return TF.PHOTOS && TF.PHOTOS[f.id] || null; }
function thumbOf(ph, w){ return ph.src.indexOf('/960px-') > 0 ? ph.src.replace('/960px-', '/' + w + 'px-') : ph.src; }
function dot(f){ return '<i class="fdot" style="background:' + f.color + ';border-color:' + f.core + '"></i>'; }
/* 沒有照片時的花朵示意圖 */
function flowerSVG(f, size){
  var g = '';
  for (var i = 0; i < 5; i++) g += '<ellipse cx="0" cy="-10" rx="7" ry="10" transform="rotate(' + (i * 72) + ')" fill="' + f.color + '" stroke="' + f.core + '" stroke-width="1.2"/>';
  return '<svg width="' + size + '" height="' + size + '" viewBox="-22 -22 44 44" aria-hidden="true">' + g + '<circle r="4.5" fill="' + f.core + '"/></svg>';
}

/* ---------- 選擇器與時間軸 ---------- */
function fillSelectors(){
  $('selRegion').innerHTML = '<option value="all">全台灣</option>' + TF.REGIONS.map(function(r){ return '<option value="' + r.id + '">' + r.name + '｜' + r.sub + '</option>'; }).join('');
  $('selRegion').value = st.region;
  var sp = spotsInScope();
  $('selSpot').innerHTML = '<option value="">' + (st.region === 'all' ? '選一個賞花地點…' : '整個' + TF.regionById[st.region].name) + '</option>' +
    sp.map(function(p){ return '<option value="' + p.id + '">' + p.name + '</option>'; }).join('');
  $('selSpot').value = st.spot || '';
}
var BINS = [];
(function(){ var CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]; for (var m = 0; m < 12; m++){ var a = CUM[m]; [[1, 10], [11, 20], [21, CUM[m + 1] - a]].forEach(function(r){ BINS.push([a + r[0], a + r[1]]); }); } })();
function spotsInScope(){ return TF.SPOTS.filter(function(p){ return st.region === 'all' || p.r === st.region; }); }
function renderAxis(){
  var sp = spotsInScope(), cnt = BINS.map(function(b){
    return sp.filter(function(p){ for (var d = b[0]; d <= b[1]; d += 2) if (TF.isPeak(TF.spotStage(p, d))) return true; return false; }).length;
  }), max = Math.max(1, Math.max.apply(null, cnt));
  $('axBars').innerHTML = BINS.map(function(b, i){
    var on = st.day >= b[0] && st.day <= b[1];
    return '<button type="button" class="axc s' + Math.floor(((i / 3 | 0) + 1) % 12 / 3) + (on ? ' on' : '') + '" data-d="' + Math.round((b[0] + b[1]) / 2) + '" title="' + junOf(b[0]) + '：' + cnt[i] + ' 處有花可看"><b>' + cnt[i] + '</b><i style="height:' + Math.round(cnt[i] / max * 30 + 2) + 'px"></i></button>';
  }).join('');
  var r = $('dRange'); r.value = st.day; r.setAttribute('aria-valuetext', TF.fmt(st.day));
}

/* ---------- 天空：冬藍→春粉→夏亮藍→秋暖金 ---------- */
var SKY = [[1, '#b9cfe8', '#f3eef2'], [60, '#b4d8f2', '#fde2ea'], [130, '#86c8f2', '#e6f6ea'], [240, '#93c6ea', '#fbefcf'], [300, '#b8c9dd', '#f9e3c9'], [366, '#b9cfe8', '#f3eef2']];
function skyFor(d){
  function mix(a, b, t){ var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return [16, 8, 0].map(function(s){ return Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t); }); }
  for (var i = 0; i < SKY.length - 1; i++) if (d >= SKY[i][0] && d < SKY[i + 1][0]){
    var t = (d - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]);
    return [mix(SKY[i][1], SKY[i + 1][1], t), mix(SKY[i][2], SKY[i + 1][2], t)];
  }
  return [[185, 207, 232], [243, 238, 242]];
}

/* ---------- 清單 ---------- */
function rankOf(p){ var b = TF.spotBest(p, st.day); return b.k; }
function countdown(w){
  var s = TF.stageAt(w, st.day), d = st.day;
  if (s === 'bud' || s === 'off'){ var n = TF.rel(w.o, d); return n <= 60 ? '約 ' + n + ' 天後開' : '花期 ' + TF.fmt(w.o) + '～' + TF.fmt(w.e); }
  if (s === 'open') return '約 ' + Math.max(1, TF.rel(w.f, d)) + ' 天後最盛';
  if (s === 'full') return '正盛開';
  return '尾聲，約 ' + Math.max(1, TF.rel(w.e, d)) + ' 天後結束';
}
function spotCard(p){
  var b = TF.spotBest(p, st.day);
  return '<button type="button" class="scard" data-spot="' + p.id + '"><b>' + esc(p.name) + '</b>' + stChip(b.st) +
    '<small>' + dot(b.fl) + esc(b.fl.name) + '・' + countdown(b.w) + '｜' + esc(p.city) + (p.fl.length > 1 ? '｜共 ' + p.fl.length + ' 種花' : '') + '</small></button>';
}
function flowerCard(f, spot){
  var ph = photoOf(f), s, sub;
  if (spot){ var w = TF.winOf(spot, f.id); s = TF.stageAt(w, st.day); sub = TF.fmt(w.o) + '～' + TF.fmt(w.e) + '・最盛約 ' + TF.fmt(w.f); }
  else {
    var fs = TF.flowerStage(f.id, st.day); s = fs.st;
    var on = TF.spotsOfFlower(f.id).filter(function(p){ return TF.isPeak(TF.stageAt(TF.winOf(p, f.id), st.day)); });
    sub = on.length ? '現在可看：' + on.slice(0, 2).map(function(p){ return p.name.replace(/（.*）/, ''); }).join('、') + (on.length > 2 ? '等 ' + on.length + ' 處' : '') : f.season;
  }
  return '<button type="button" class="vcard" data-fl="' + f.id + '"><span class="pic">' + flowerSVG(f, 56) +
    (ph ? '<img loading="lazy" referrerpolicy="no-referrer" alt="" src="' + esc(thumbOf(ph, 330)) + '" onerror="this.remove()">' : '') +
    '<span class="st">' + stChip(s) + '</span></span><b>' + esc(f.name) + '</b><small>' + esc(sub) + '</small></button>';
}
/* 一年花曆：每種花一列 */
function pct(d){ return ((d - 1) / 364 * 100).toFixed(2) + '%'; }
function bands(w, color, core){
  var segs = w.o <= w.e ? [[w.o, w.e]] : [[w.o, 365], [1, w.e]];
  return segs.map(function(s){ return '<span class="bar" style="left:' + pct(s[0]) + ';width:calc(' + pct(s[1]) + ' - ' + pct(s[0]) + ' + 3px);background:' + color + ';border-color:' + (core || 'rgba(0,0,0,.25)') + '"></span>'; }).join('') +
    '<span class="pk" style="left:' + pct(w.f) + '"></span>';
}
function yearCal(rows){
  return '<div class="ycal">' + rows.map(function(r){
    return '<div class="yrow"><span class="yn">' + dot(r.f) + esc(r.f.name) + '</span><span class="ytrack">' + bands(r.w, r.f.color, r.f.core) + '<span class="now" style="left:' + pct(st.day) + '"></span></span></div>';
  }).join('') + '<div class="yrow ym"><span class="yn"></span><span class="ytrack">' + [1, 3, 5, 7, 9, 11].map(function(m){ return '<span class="lab" style="left:' + pct(TF.doy(m + '/1')) + '">' + m + '月</span>'; }).join('') + '</span></div></div>';
}
function render(opts){
  opts = opts || {};
  var d = st.day, sp = st.spot ? TF.spotById[st.spot] : null;
  $('dateBig').textContent = TF.fmt(d);
  $('dateSub').textContent = junOf(d);
  document.querySelectorAll('.mbtn').forEach(function(b){ var on = b.dataset.mode === st.mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  renderAxis();
  var sky = skyFor(d), stage = $('stage');
  stage.style.setProperty('--sky1', 'rgb(' + sky[0].join(',') + ')'); stage.style.setProperty('--sky2', 'rgb(' + sky[1].join(',') + ')');
  var place = $('place'), list = $('list'), scope = spotsInScope();
  var peakN = scope.filter(function(p){ return TF.isPeak(TF.spotStage(p, d)); }).length;
  renderLegend();
  if (sp){
    var b = TF.spotBest(sp, d);
    place.innerHTML = '<h2>' + esc(sp.name) + '<small>' + esc(sp.city) + '</small></h2>' +
      '<div class="meta">' + stChip(b.st, '・' + esc(b.fl.name)) + (sp.elev >= 200 ? '<span>海拔約 ' + sp.elev.toLocaleString() + ' m</span>' : '') + '<span>' + TF.regionById[sp.r].name + '</span></div>' +
      yearCal(sp.fl.map(function(w){ return {w:w, f:TF.flowerById[w.id]}; })) +
      '<p>' + esc(sp.note) + '</p>' +
      '<details class="tips"' + (innerWidth > 760 ? ' open' : '') + '><summary>📌 這裡要注意</summary><ul>' + sp.tips.map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></details>' +
      '<div class="rowbtns">' + sp.fl.map(function(w){ return '<button type="button" class="sbtn" data-jump="' + w.f + '">📅 ' + esc(TF.flowerById[w.id].name) + '最盛 ' + TF.fmt(w.f) + '</button>'; }).join('') + '</div>';
    $('sum').innerHTML = '<span>' + TF.fmt(d) + '・' + esc(TF.stageById[b.st].tip) + '</span>';
    list.className = 'grid';
    list.innerHTML = '<div class="lgrp" style="grid-column:1/-1">這裡的花（點開看圖鑑）</div>' + sp.fl.map(function(w){ return flowerCard(TF.flowerById[w.id], sp); }).join('');
  } else {
    var now = TF.FLOWERS.filter(function(f){ return TF.spotsOfFlower(f.id).some(function(p){ return (st.region === 'all' || p.r === st.region) && TF.isPeak(TF.stageAt(TF.winOf(p, f.id), d)); }); });
    var chips = now.length ? '<div class="nowchips">' + now.map(function(f){ return '<button type="button" class="nchip" data-fl="' + f.id + '">' + dot(f) + esc(f.name) + '</button>'; }).join('') + '</div>' : '';
    if (st.region !== 'all'){
      var r = TF.regionById[st.region];
      place.innerHTML = '<h2>' + r.name + '<small>' + r.sub + '・' + scope.length + ' 個地點</small></h2><p>' + (now.length ? junOf(d) + '這一區可以看：' : '這段時間這一區沒有收錄的花季，拖曳下方日期看看其他月份。') + '</p>' + chips;
    } else {
      place.innerHTML = '<h2>全台灣<small>' + TF.SPOTS.length + ' 個賞花地點・' + TF.FLOWERS.length + ' 種花</small></h2><p>' + junOf(d) + '當季的花：</p>' + chips;
    }
    $('sum').innerHTML = '<span>' + TF.fmt(d) + '・' + (st.region === 'all' ? '全台灣' : TF.regionById[st.region].name) + '</span><b>' + peakN + '</b><span>處有花可看</span>';
    if (st.mode === 'flowers'){
      list.className = 'grid';
      var fl = TF.FLOWERS.slice().sort(function(a, b){
        var x = TF.flowerStage(a.id, d), y = TF.flowerStage(b.id, d);
        return (TF.RANK[x.st] - TF.RANK[y.st]) * 1000 + (TF.RANK[x.st] >= 3 ? x.near - y.near : 0);
      });
      list.innerHTML = fl.map(function(f){ return flowerCard(f); }).join('');
    } else {
      list.className = '';
      var sorted = scope.slice().sort(function(a, b){ return rankOf(a) - rankOf(b); }), html = '', last = '';
      sorted.forEach(function(p){
        var s = TF.spotStage(p, d), g = TF.isPeak(s) ? '🌼 現在有花' : s === 'bud' ? '⏳ 兩週內開花' : '🗓 其他季節';
        if (g !== last){ html += '<div class="lgrp">' + g + '</div>'; last = g; }
        html += spotCard(p);
      });
      list.innerHTML = html;
    }
  }
  if (window.FlowerScene && FlowerScene.ready){
    FlowerScene.setDay(d);
    FlowerScene.selectSpot(st.spot);
    FlowerScene.setHorizon(sky[1].map(function(v){ return v / 255; }));
    if (opts.fly){
      if (sp) FlowerScene.focusSpot(sp.id);
      else if (st.region !== 'all') FlowerScene.focusRegion(scope.map(function(p){ return p.id; }));
      else FlowerScene.overview();
    }
  }
  save();
}
function renderLegend(){
  var d = st.day, now = TF.FLOWERS.filter(function(f){ var s = TF.flowerStage(f.id, d).st; return s === 'full' || s === 'open'; });
  $('lgNow').innerHTML = now.length ? now.map(function(f){ return '<span>' + dot(f) + esc(f.name) + '</span>'; }).join('') : '<span>現在沒有收錄的花正在開</span>';
}

/* ---------- 動作 ---------- */
function setDay(d){ st.day = TF.wrap(d); render(); }
function selectSpot(id){ if (id && innerWidth <= 760 && $('panel').classList.contains('min')) setSheet(false); st.spot = id || null; if (st.spot){ st.region = TF.spotById[st.spot].r; st.mode = 'spots'; } fillSelectors(); render({fly:true}); }
function selectRegion(r){ st.region = r; st.spot = null; fillSelectors(); render({fly:true}); }
function setMode(m){ st.mode = m; if (st.spot && m === 'flowers'){ st.spot = null; fillSelectors(); render({fly:true}); return; } render(); }

/* ---------- 花卉圖鑑 ---------- */
var lastFocus = null;
function showPhoto(f){
  var ph = photoOf(f), img = $('phImg'), art = $('phArt'), cr = $('phCredit');
  function fallback(){
    img.hidden = true; img.removeAttribute('src');
    art.hidden = false; art.innerHTML = flowerSVG(f, 180);
    cr.innerHTML = '<span class="note">目前沒有可用的授權實景照片（或無法載入），改以花朵示意圖表示，顏色依花色繪製。</span>';
  }
  if (!ph){ fallback(); return; }
  art.hidden = true; img.hidden = false;
  img.onerror = fallback;
  img.alt = f.name + '實景照片';
  img.src = ph.src;
  cr.innerHTML = '📷 ' + esc(ph.author) + '｜<a href="' + esc(ph.licenseUrl || ph.page) + '" target="_blank" rel="noopener">' + esc(ph.license) + '</a>｜來源：<a href="' + esc(ph.page) + '" target="_blank" rel="noopener">Wikimedia Commons</a>' +
    '<br><span class="note">照片為物種示意，拍攝地點不一定在台灣或地圖上的地點；未經修改。</span>';
}
function openFlower(id){
  var f = TF.flowerById[id]; if (!f) return;
  lastFocus = document.activeElement;
  var fs = TF.flowerStage(f.id, st.day);
  $('flTitle').innerHTML = '<h2 id="flName">' + esc(f.name) + '</h2><div class="en">' + esc(f.en) + '</div><div class="sci">' + esc(f.sci) + '</div>' +
    '<div class="tags"><span class="tag k">' + esc(f.kind) + '</span><span class="tag">🗓 ' + esc(f.season) + '</span><span class="tag">地圖上：' + FORM[f.form] + '</span>' + stChip(fs.st, '（全台）') + '</div>' +
    '<div class="quick"><b>認識它：</b>' + esc(f.feat) + '</div>';
  var sps = TF.spotsOfFlower(f.id);
  var rows = sps.map(function(p){
    var w = TF.winOf(p, f.id), s = TF.stageAt(w, st.day);
    return '<tr><td><button type="button" data-gospot="' + p.id + '">' + esc(p.name) + '</button><br><small style="color:var(--mute)">' + esc(p.city) + '</small></td><td>' + TF.fmt(w.o) + '～' + TF.fmt(w.e) + '</td><td>' + TF.fmt(w.f) + '</td><td>' + stChip(s) + '</td></tr>';
  }).join('');
  $('flBody').innerHTML =
    '<div class="sec cols"><div><h3>由來</h3><p>' + esc(f.story) + '</p></div><div><h3>為什麼值得看</h3><p>' + esc(f.why) + '</p></div></div>' +
    '<div class="sec"><h3>花曆</h3>' + yearCal(sps.map(function(p){ return {w:TF.winOf(p, f.id), f:{name:p.name.replace(/（.*）/, ''), color:f.color, core:f.core}}; })) + '</div>' +
    '<div class="sec"><h3>哪裡看得到（' + TF.fmt(st.day) + ' 的花況）</h3><div style="overflow-x:auto"><table class="vtab"><tr><th>地點</th><th>花期約</th><th>最盛約</th><th>' + TF.fmt(st.day) + '</th></tr>' + rows + '</table></div>' +
    '<div class="calnote">日期為一般性參考，每年可能提早或延後一兩週；點地點會飛到地圖上的位置。</div></div>' +
    '<div class="sec"><h3>容易混淆的花</h3><div class="tipbox">🔍 ' + esc(f.similar) + '</div></div>';
  $('flower').classList.add('show');
  $('flower').querySelector('.sheet').scrollTop = 0;
  showPhoto(f);
  $('flower').querySelector('.x').focus();
}
function openModal(id){ lastFocus = document.activeElement; $(id).classList.add('show'); $(id).querySelector('.x').focus(); }
function closeModal(el){
  el.classList.remove('show');
  if (el.id === 'about') lsSet(SEEN_KEY, 1);
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
function buildEtiquette(){
  $('etqBody').innerHTML = TF.ETIQUETTE.map(function(e){
    return '<section><h3>' + e.icon + ' ' + esc(e.title) + '</h3><ul>' + e.items.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>';
  }).join('');
  $('glossBody').innerHTML = TF.GLOSSARY.map(function(g){ return '<div><b>' + esc(g[0]) + '</b><br>' + esc(g[1]) + '</div>'; }).join('');
  $('lgStages').innerHTML = TF.STAGES.map(function(s){ return '<span><i style="background:' + s.c + '"></i>' + s.name + '</span>'; }).join('');
}

/* ---------- 常用設定（收合式） ---------- */
function fillSettings(){
  $('setDay').value = set.day; $('setMode').value = set.mode; $('setLabels').checked = !!set.labels; $('setMotion').value = set.motion; $('setTheme').value = set.theme; $('setPlay').value = String(set.play);
  var txt = function(id){ var s = $(id); return s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : ''; };
  $('sv-day').textContent = txt('setDay'); $('sv-mode').textContent = txt('setMode'); $('sv-labels').textContent = set.labels ? '顯示' : '隱藏';
  $('sv-motion').textContent = txt('setMotion'); $('sv-play').textContent = txt('setPlay').replace(/（.*/, ''); $('sv-theme').textContent = txt('setTheme');
  var open = lsGet(SEC_KEY, []);
  document.querySelectorAll('.set-sec').forEach(function(d){ d.open = open.indexOf(d.dataset.sec) >= 0; });
}
function saveSettings(){
  set = {day:$('setDay').value, mode:$('setMode').value, labels:$('setLabels').checked, motion:$('setMotion').value, theme:$('setTheme').value, play:+$('setPlay').value};
  lsSet(SET_KEY, set); applyTheme();
  if (window.FlowerScene && FlowerScene.ready){ FlowerScene.setLabels(set.labels); FlowerScene.setReduce(reduceOn()); }
  if (playT){ stopPlay(); startPlay(); }
  fillSettings();
}
function saveSecs(){ lsSet(SEC_KEY, [].map.call(document.querySelectorAll('.set-sec[open]'), function(d){ return d.dataset.sec; })); }

/* ---------- 事件 ---------- */
function bind(){
  $('dRange').addEventListener('input', function(){ stopPlay(); if (+this.value !== st.day) setDay(+this.value); });
  $('axBars').addEventListener('click', function(e){ var b = e.target.closest('.axc'); if (b){ stopPlay(); setDay(+b.dataset.d); } });
  $('btnToday').addEventListener('click', function(){ stopPlay(); setDay(todayDoy()); });
  document.querySelectorAll('.mbtn').forEach(function(b){ b.addEventListener('click', function(){ setMode(b.dataset.mode); }); });
  $('selRegion').addEventListener('change', function(){ selectRegion(this.value); });
  $('selSpot').addEventListener('change', function(){ if (this.value) selectSpot(this.value); else selectRegion(st.region); });
  $('list').addEventListener('click', function(e){
    var c = e.target.closest('.scard'); if (c){ selectSpot(c.dataset.spot); return; }
    var v = e.target.closest('.vcard'); if (v) openFlower(v.dataset.fl);
  });
  $('place').addEventListener('click', function(e){
    var j = e.target.closest('[data-jump]'); if (j){ stopPlay(); setDay(+j.dataset.jump); return; }
    var n = e.target.closest('[data-fl]'); if (n) openFlower(n.dataset.fl);
  });
  $('btnAll').addEventListener('click', function(){ st.region = 'all'; st.spot = null; fillSelectors(); render({fly:true}); });
  $('btnAbout').addEventListener('click', function(){ openModal('about'); });
  ['btnEtq', 'btnEtq2', 'btnEtq3'].forEach(function(id){ $(id).addEventListener('click', function(){ if (id === 'btnEtq3') closeModal($('about')); openModal('etq'); }); });
  $('btnSet').addEventListener('click', function(){ fillSettings(); openModal('settings'); });
  $('settings').addEventListener('change', saveSettings);
  document.querySelectorAll('.set-sec').forEach(function(d){ d.addEventListener('toggle', saveSecs); });
  $('setOpenAll').addEventListener('click', function(){ document.querySelectorAll('.set-sec').forEach(function(d){ d.open = true; }); saveSecs(); });
  $('setCloseAll').addEventListener('click', function(){ document.querySelectorAll('.set-sec').forEach(function(d){ d.open = false; }); saveSecs(); });
  function openAbout(creator){
    if ($('settings').classList.contains('show')) closeModal($('settings'));
    openModal('about'); if (creator) $('creatorBox').scrollIntoView({block:'nearest'});
  }
  $('btnCreator').addEventListener('click', function(){ openAbout(true); });
  document.querySelectorAll('[data-open-about]').forEach(function(b){ b.addEventListener('click', function(){ openAbout(b.dataset.openAbout === 'creator'); }); });
  document.querySelectorAll('[data-open-etq]').forEach(function(b){ b.addEventListener('click', function(){ closeModal($('settings')); openModal('etq'); }); });
  $('btnPrint').addEventListener('click', function(){ window.print(); });
  $('sheetBtn').addEventListener('click', function(){ setSheet(!$('panel').classList.contains('min')); });
  document.querySelectorAll('.modal').forEach(function(m){
    m.addEventListener('click', function(e){ if (e.target === m || e.target.closest('[data-close]')) closeModal(m); });
  });
  $('flBody').addEventListener('click', function(e){
    var g = e.target.closest('[data-gospot]');
    if (g){ closeModal($('flower')); selectSpot(g.dataset.gospot); }
  });
  document.addEventListener('keydown', function(e){
    var open = document.querySelector('.modal.show');
    if (e.key === 'Escape' && open){ closeModal(open); return; }
    if (open || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight'){ stopPlay(); setDay(st.day + (e.shiftKey ? 10 : 1)); }
    if (e.key === 'ArrowLeft'){ stopPlay(); setDay(st.day - (e.shiftKey ? 10 : 1)); }
  });
  $('play').addEventListener('click', function(){ if (playT) stopPlay(); else startPlay(); });
}
function setSheet(min){
  $('panel').classList.toggle('min', min); document.body.classList.toggle('sheet-min', min); $('sheetBtn').textContent = min ? '展開清單' : '收合';
  if (window.FlowerScene) FlowerScene.resize();
}
var playT = 0, played = 0;
function startPlay(){
  played = 0;
  $('play').classList.add('on'); $('play').textContent = '❚❚';
  playT = setInterval(function(){ played += 3; if (played > 365){ stopPlay(); return; } setDay(st.day + 3); }, set.play || 400);
}
function stopPlay(){ if (!playT) return; clearInterval(playT); playT = 0; $('play').classList.remove('on'); $('play').textContent = '▶'; }

/* ---------- 啟動 ---------- */
fillSelectors(); buildEtiquette(); bind(); if (innerWidth <= 760) setSheet(true); render();
FlowerScene.onPickSpot = function(id){ selectSpot(id); };
function firstVisit(){ if (!lsGet(SEEN_KEY, 0)) openModal('about'); }
FlowerScene.init({host:$('stage'), labels:$('labels'), reduce:reduceOn(), day:st.day}).then(function(){
  FlowerScene.setLabels(set.labels);
  render({fly:true});
  setTimeout(function(){ $('loading').classList.add('hide'); firstVisit(); }, 250);
}).catch(function(err){
  console.error(err);
  $('loadMsg').textContent = '3D 地圖載入失敗（可能是網路無法連到繪圖元件）';
  $('loadSub').textContent = '賞花地點與花卉圖鑑仍可使用，點畫面任一處繼續。';
  $('loading').addEventListener('click', function(){ $('loading').classList.add('hide'); firstVisit(); }, {once:true});
});

window.__flower = {state:st, setDay:setDay, selectSpot:selectSpot, selectRegion:selectRegion, setMode:setMode, openFlower:openFlower,
  closeFlower:function(){ closeModal($('flower')); }, TF:TF, scene:FlowerScene};
})();
