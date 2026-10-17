(function(){
var TDCore = (function () {
'use strict';
var UNIT_SEC = 0.625; // 秒 * BPM / pos
function collect(G) {
if (typeof G.bars_ !== 'function' || typeof G.b !== 'function' || !G.stat_arr) {
throw new Error('textage の譜面ページ上で実行してください。');
}
var ev = [];
var meas = [];
var saved = {
stat_insert: G.stat_insert, bars_: G.bars_, w: G.w,
stat_on: G.stat_on, stat_pos: G.stat_pos, hs: G.hs,
cncnt: G.cncnt, bsscnt: G.bsscnt, ttl: G.ttl, p1o: G.p1o,
cnc: G.cnc ? G.cnc.slice() : null,
nmergin: G.nmergin ? G.nmergin.slice() : null,
objres: G.objres ? G.objres.map(function (a) { return a.slice(); }) : null,
co0: G.co ? G.co[0] : null
};
var origBars = G.bars_;
G.stat_insert = function (side, key, num, len) { ev.push([side, key, num, len]); };
G.w = function () {}; // 解析中に document.write されないように
G.bars_ = function (n) {
var st = G.stat_pos;
var r = origBars.apply(this, arguments);
if (G.stat_pos > st) meas.push({ n: n, start: st, end: G.stat_pos });
return r;
};
try {
G.stat_on = 1;
G.stat_pos = 0;
G.hs = 1; // CN 位置計算が表示用ハイスピードに依存するため 1 に固定
G.b(1 - G.gap, G.measure);
} finally {
G.stat_insert = saved.stat_insert;
G.bars_ = saved.bars_;
G.w = saved.w;
G.stat_on = saved.stat_on;
G.stat_pos = saved.stat_pos;
G.hs = saved.hs;
G.cncnt = saved.cncnt; G.bsscnt = saved.bsscnt; G.ttl = saved.ttl; G.p1o = saved.p1o;
if (saved.cnc) G.cnc = saved.cnc;
if (saved.nmergin) G.nmergin = saved.nmergin;
if (saved.objres) G.objres = saved.objres;
if (G.co) G.co[0] = saved.co0;
}
return { ev: ev, meas: meas };
}
function stripTags(s) {
return String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&')
.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}
function build(G, raw) {
var ev = raw.ev;
var bpmEv = [];
ev.forEach(function (e, i) {
if (e[0] !== 2) return;
var v = parseFloat(String(e[3]).trim());
if (isFinite(v) && v > 0) bpmEv.push({ pos: e[2], bpm: v, i: i });
});
bpmEv.sort(function (a, b) { return a.pos - b.pos || a.i - b.i; });
var tempo = [];
bpmEv.forEach(function (e) {
if (tempo.length && tempo[tempo.length - 1].pos === e.pos) tempo[tempo.length - 1].bpm = e.bpm;
else tempo.push({ pos: e.pos, bpm: e.bpm });
});
var initBpm = tempo.length ? tempo[0].bpm : (parseFloat(G.bpm) || 120);
if (!tempo.length || tempo[0].pos > 0) tempo.unshift({ pos: 0, bpm: initBpm });
tempo[0].time = 0;
for (var ti = 1; ti < tempo.length; ti++) {
var p = tempo[ti - 1];
tempo[ti].time = p.time + (tempo[ti].pos - p.pos) * UNIT_SEC / p.bpm;
}
function segAt(pos) {
var lo = 0, hi = tempo.length - 1;
while (lo < hi) {
var mid = (lo + hi + 1) >> 1;
if (tempo[mid].pos <= pos) lo = mid; else hi = mid - 1;
}
return tempo[lo];
}
function timeAt(pos) { var s = segAt(pos); return s.time + (pos - s.pos) * UNIT_SEC / s.bpm; }
function posAt(time) {
if (time <= 0) return 0;
var lo = 0, hi = tempo.length - 1;
while (lo < hi) {
var mid = (lo + hi + 1) >> 1;
if (tempo[mid].time <= time) lo = mid; else hi = mid - 1;
}
var s = tempo[lo];
return s.pos + (time - s.time) * s.bpm / UNIT_SEC;
}
function bpmAt(pos) { return segAt(pos).bpm; }
var groups = {};
ev.forEach(function (e, i) {
if (e[0] !== 0 && e[0] !== 1) return;
var k = e[0] + ':' + e[1];
(groups[k] = groups[k] || []).push({ side: e[0], key: e[1], pos: e[2], len: e[3] || 0, i: i });
});
var notes = [];
Object.keys(groups).forEach(function (k) {
var arr = groups[k].sort(function (a, b) { return a.pos - b.pos || a.i - b.i; });
var uniq = [];
arr.forEach(function (e) {
if (uniq.length && uniq[uniq.length - 1].pos === e.pos) uniq[uniq.length - 1] = e;
else uniq.push(e);
});
var open = null;
function closeOpen() {
notes.push({ side: open.side, key: open.key, pos: open.end, kind: 'ce' });
open = null;
}
uniq.forEach(function (e) {
if (open && e.len > 0 && Math.abs(open.end - e.pos) <= 3) { open.end = e.pos + e.len; return; }
if (open) closeOpen();
if (e.len > 0) {
notes.push({ side: e.side, key: e.key, pos: e.pos, kind: 'cs' });
open = { side: e.side, key: e.key, end: e.pos + e.len };
} else {
notes.push({ side: e.side, key: e.key, pos: e.pos, kind: 'n' });
}
});
if (open) closeOpen();
});
notes.sort(function (a, b) { return a.pos - b.pos || a.side - b.side || a.key - b.key; });
notes.forEach(function (nt) { nt.time = timeAt(nt.pos); });
var gap = G.gap || 0;
var measures = raw.meas.map(function (m) {
var bpms = [bpmAt(m.start)];
tempo.forEach(function (t) { if (t.pos > m.start && t.pos < m.end) bpms.push(t.bpm); });
return {
n: m.n, num: (m.n === 999 ? 1 : m.n + gap),
start: m.start, end: m.end,
tStart: timeAt(m.start), tEnd: timeAt(m.end),
bpmMin: Math.min.apply(null, bpms), bpmMax: Math.max.apply(null, bpms)
};
});
return {
title: stripTags(G.title), genre: stripTags(G.genre), artist: stripTags(G.artist),
bpmText: stripTags(G.bpm), diftype: stripTags(G.diftype), declaredNotes: G.notes,
isDP: G.key === 14,
tempo: tempo, notes: notes, measures: measures,
timeAt: timeAt, posAt: posAt, bpmAt: bpmAt
};
}
function select(chart, opt) {
opt = opt || {};
return chart.notes.filter(function (nt) {
if (nt.kind === 'ce' && opt.includeCnEnd === false) return false;
if (nt.key === 0 && opt.includeScratch === false) return false;
if (opt.side === 0 || opt.side === 1) { if (nt.side !== opt.side) return false; }
return true;
});
}
function lowerBound(a, x, f) {
var lo = 0, hi = a.length;
while (lo < hi) { var m = (lo + hi) >> 1; if (f(a[m]) < x) lo = m + 1; else hi = m; }
return lo;
}
function perMeasure(chart, sel) {
var j = 0;
return chart.measures.map(function (m) {
while (j < sel.length && sel[j].pos < m.start) j++;
var c = 0;
while (j < sel.length && sel[j].pos < m.end) { c++; j++; }
var dur = m.tEnd - m.tStart;
var effectiveDur = Math.max(dur, 60 / m.bpmMin); // 最低1拍分の長さとして扱い、極端に短い小節の密度爆発を防ぐ
return { m: m, count: c, dur: effectiveDur, nps: effectiveDur > 0 ? c / effectiveDur : 0 };
});
}
function timeRange(sel, t0, t1) {
var a = lowerBound(sel, t0, function (n) { return n.time; });
var b = lowerBound(sel, t1, function (n) { return n.time; });
var dur = t1 - t0;
return { count: b - a, dur: dur, nps: dur > 0 ? (b - a) / dur : 0, t0: t0, t1: t1 };
}
function measureRange(chart, sel, from, to) {
if (from > to) { var x = from; from = to; to = x; }
var ms = chart.measures.filter(function (m) { return m.num >= from && m.num <= to; });
if (!ms.length) return null;
var p0 = ms[0].start, p1 = ms[ms.length - 1].end;
var a = lowerBound(sel, p0, function (n) { return n.pos; });
var b = lowerBound(sel, p1, function (n) { return n.pos; });
var t0 = chart.timeAt(p0), t1 = chart.timeAt(p1);
var bmin = Infinity, bmax = -Infinity;
ms.forEach(function (m) { bmin = Math.min(bmin, m.bpmMin); bmax = Math.max(bmax, m.bpmMax); });
var inner = sel.slice(a, b);
var dur = t1 - t0;
var effectiveDur = Math.max(dur, 60 / bmin); // 最低1拍分
return {
from: ms[0].num, to: ms[ms.length - 1].num, count: b - a,
t0: t0, t1: t1, dur: effectiveDur, nps: effectiveDur > 0 ? (b - a) / effectiveDur : 0,
bpmMin: bmin, bpmMax: bmax,
noteSpan: inner.length >= 2 ? inner[inner.length - 1].time - inner[0].time : 0
};
}
function peak(sel, win) {
var best = { count: 0, t0: 0 };
for (var i = 0, j = 0; i < sel.length; i++) {
if (j < i) j = i;
while (j < sel.length && sel[j].time < sel[i].time + win - 1e-9) j++;
if (j - i > best.count) best = { count: j - i, t0: sel[i].time };
}
best.nps = best.count / win;
best.t1 = best.t0 + win;
return best;
}
function curve(sel, win, t0, t1, step) {
var pts = [], a = 0, b = 0;
for (var c = t0; c <= t1 + 1e-9; c += step) {
var lo = c - win / 2, hi = c + win / 2;
while (a < sel.length && sel[a].time < lo) a++;
if (b < a) b = a;
while (b < sel.length && sel[b].time < hi) b++;
pts.push([c, (b - a) / win]);
}
return pts;
}
function measureAtTime(chart, t) {
var ms = chart.measures;
if (!ms.length) return null;
var lo = 0, hi = ms.length - 1;
while (lo < hi) {
var mid = (lo + hi + 1) >> 1;
if (ms[mid].tStart <= t) lo = mid; else hi = mid - 1;
}
return ms[lo];
}
function analyze(G) {
return build(G, collect(G));
}
return {
collect: collect, build: build, analyze: analyze, select: select,
perMeasure: perMeasure, timeRange: timeRange, measureRange: measureRange,
peak: peak, curve: curve, measureAtTime: measureAtTime
};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = TDCore;
(function () {
'use strict';
var G = window;
if (G.__tdPanel) { G.__tdPanel.show(); return; }
var chart;
try { chart = TDCore.analyze(G); } catch (e) { alert('[秒間密度] ' + e.message); return; }
var opt = { includeCnEnd: true, includeScratch: true, side: null, win: 1 };
var sel = [];          // 集計対象ノーツ
var pm = [];           // 小節ごとの密度
var region = null;     // 選択範囲 {t0,t1,label}
var hoverT = null;
var pickAnchor = null; // 譜面タップでの範囲指定: 1回目にタップした位置 {p0,p1,num}。null=始点待ち
var crvCache = {};     // グラフ曲線のキャッシュ
var songEnd = chart.measures.length ? chart.measures[chart.measures.length - 1].tEnd : 1;
var byN = {};
chart.measures.forEach(function (m) { byN[m.n] = m; });
var host = document.createElement('div');
host.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;top:auto;';
document.body.appendChild(host);
['keydown', 'keyup', 'keypress'].forEach(function (t) {
host.addEventListener(t, function (e) { e.stopPropagation(); });
});
var root = host.attachShadow({ mode: 'open' });
root.innerHTML =
'<style>' +
':host{all:initial}' +
'*{box-sizing:border-box;font-family:"Segoe UI","Hiragino Sans","Meiryo",sans-serif;-webkit-text-size-adjust:100%}' +
'.p{background:rgba(18,20,28,.96);color:#e8e8f0;border-top:2px solid #6cf;font-size:13px;box-shadow:0 -4px 16px rgba(0,0,0,.5)}' +
'.p.top{border-top:0;border-bottom:2px solid #6cf;box-shadow:0 4px 16px rgba(0,0,0,.5)}' +
'.h{display:flex;align-items:center;gap:10px;padding:5px 10px;background:#1e2433;cursor:default;white-space:nowrap}' +
'.h b{color:#6cf}.t{color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;min-width:0}.d{color:#fc6}.ok{color:#7e7}.ng{color:#f77}' +
'.h b,.h .d,.h #chk,.h button{flex-shrink:0}' +
'.sp{flex:1}button{background:#2c3550;color:#dde;border:1px solid #456;border-radius:4px;padding:2px 9px;cursor:pointer;font-size:12px}' +
'button:hover{background:#3b4870}.b{padding:6px 10px 8px}' +
'.r{display:flex;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;align-items:center;gap:6px 14px;margin:3px 0;white-space:nowrap}.r::-webkit-scrollbar{display:none}.r>*{flex-shrink:0}' +
'label{cursor:pointer;user-select:none}select,input{background:#0e1018;color:#fff;border:1px solid #456;border-radius:3px;padding:1px 3px;font-size:12px}' +
'input[type=text]{width:56px}.pk{cursor:pointer;color:#fc6;text-decoration:underline dotted}.pk:hover{color:#fff}' +
'.res{color:#fff}.res em{font-style:normal;font-weight:600;color:#6f6}.res .gg{color:#7cf}.mut{color:#99a;font-size:.85em}' +
'canvas{display:block;width:100%;height:170px;background:#0b0d14;border:1px solid #2a3145;border-radius:4px;margin:4px 0;cursor:crosshair;touch-action:none}' +
'.hid{display:none}' +
'.cmp{font-size:11px}.cmp canvas{height:90px;margin:2px 0}.cmp .h{gap:6px;padding:2px 5px}.cmp .b{padding:2px 5px 4px}.cmp .r{gap:2px 10px;margin:2px 0}' +
'.cmp .hd-m{display:none}.cmp button{padding:3px 10px}' +
'.cmp input[type=text]{font-size:16px;width:52px;padding:0 2px}' +
'</style>' +
'<div class="p" id="panel">' +
' <div class="h"><b>秒間密度</b><span class="t" id="ttl"></span><span class="d" id="dif"></span><span id="chk"></span>' +
'  <span class="sp"></span><button id="pos" title="位置を上下反転">↕</button><button id="opc" title="半透明化">◑</button><button id="min" title="最小化">_</button><button id="cls" title="閉じる">×</button></div>' +
' <div class="b" id="body">' +
'  <div class="r">' +
'   <label><input type="checkbox" id="cnend" checked> CN/BSS終点も数える</label>' +
'   <label><input type="checkbox" id="scr" checked> 皿も数える</label>' +
'   <label><input type="checkbox" id="hard"> HARD</label>' +
'   <label><input type="checkbox" id="snap" checked> 拍に吸着</label>' +
'   <label><input type="checkbox" id="hl-opt" checked> 譜面ハイライト</label>' +
'   <label id="sidew" class="hid">対象 <select id="side"><option value="">両側</option><option value="0">1P側</option><option value="1">2P側</option></select></label>' +
'   <label>グラフ窓幅 <select id="win"><option>0.5</option><option selected>1</option><option>2</option><option>4</option><option>8</option></select> 秒</label>' +
'   <span class="mut hd-m">グラフ: ドラッグで範囲測定 / クリックで譜面の該当小節へ移動</span>' +
'  </div>' +
'  <div class="r" id="stats"></div>' +
'  <canvas id="cv"></canvas>' +
'  <div class="r">' +
'   <span>小節 <input type="text" inputmode="numeric" pattern="\\d*" id="from"> 〜 <input type="text" inputmode="numeric" pattern="\\d*" id="to"></span>' +
'   <button id="calc">計算</button> <button id="clear">解除</button>' +
'   <label><input type="checkbox" id="pick" checked> 譜面タップで範囲指定</label>' +
'   <span class="res" id="res"></span>' +
'  </div>' +
' </div>' +
'</div>';
var $ = function (id) { return root.getElementById(id); };
var cv = $('cv'), ctx = cv.getContext('2d');
$('ttl').textContent = chart.title;
$('dif').textContent = chart.diftype + '  BPM ' + chart.bpmText;
if (chart.isDP) $('sidew').classList.remove('hid');
function f2(x) { return x.toFixed(2); }
function fmtT(t) { var m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }
function bpmStr(a, b) { return a === b ? String(a) : a + '–' + b; }
function mAt(t) { return TDCore.measureAtTime(chart, t); }
var snapTimes = [];
chart.measures.forEach(function (m) {
for (var p = m.start; p < m.end; p += 96) snapTimes.push(chart.timeAt(p));
});
if (chart.measures.length) snapTimes.push(chart.timeAt(chart.measures[chart.measures.length - 1].end));
function nearestSnap(t) {
if (!$('snap').checked || !snapTimes.length) return t;
var lo = 0, hi = snapTimes.length - 1;
while (lo < hi) { var mid = (lo + hi) >> 1; if (snapTimes[mid] < t) lo = mid + 1; else hi = mid; }
return (lo > 0 && t - snapTimes[lo - 1] < snapTimes[lo] - t) ? snapTimes[lo - 1] : snapTimes[lo];
}
var declared = parseInt(chart.declaredNotes, 10);
function recompute() {
sel = TDCore.select(chart, opt);
pm = TDCore.perMeasure(chart, sel);
var good = allNotes.length === declared;
$('chk').innerHTML = '<span class="' + (good ? 'ok' : 'ng') + '">Notes ' + allNotes.length +
(good ? ' ✓' : ' (textage表記 ' + chart.declaredNotes + ')') + '</span>' +
(sel.length !== allNotes.length ? ' <span class="mut">集計対象 ' + sel.length + '</span>' : '');
var html = '';
if (sel.length >= 2) {
var span = sel[sel.length - 1].time - sel[0].time;
html += '<span>平均 <b>' + f2(sel.length / span) + '</b> notes/s</span>';
}
[1, 2, 4].forEach(function (w) {
var p = TDCore.peak(sel, w);
var a = mAt(p.t0), b = mAt(p.t1 - 1e-6);
html += '<span class="pk" data-t0="' + p.t0 + '" data-t1="' + p.t1 + '">ピーク(' + w + '秒) <b>' + f2(p.nps) +
'</b> <span class="mut">[' + p.count + 'notes, 小節' + (a ? a.num : '?') + '〜' + (b ? b.num : '?') + ']</span></span>';
});
var best = null;
pm.forEach(function (x) { if (x.count && (!best || x.nps > best.nps)) best = x; });
if (best) html += '<span class="pk" data-m="' + best.m.num + '">最大小節 <b>' + f2(best.nps) + '</b> <span class="mut">[' + best.m.num + '小節 ' + best.count + 'notes]</span></span>';
$('stats').innerHTML = html;
Array.prototype.forEach.call($('stats').querySelectorAll('.pk'), function (el) {
el.onclick = function () {
if (el.dataset.m) { setMeasureRange(+el.dataset.m, +el.dataset.m); scrollToMeasure(+el.dataset.m); return; }
setRegion({ type: 't', t0: +el.dataset.t0, t1: +el.dataset.t1 });
var m = mAt(+el.dataset.t0); if (m) scrollToMeasure(m.num);
};
});
refreshRegion(); // 中で draw() とハイライト更新も行う
}
function setRegion(r, keepPick) {
if (r && r.type === 't' && r.t1 < r.t0) { var x = r.t0; r.t0 = r.t1; r.t1 = x; }
region = r;
if (!keepPick) pickAnchor = null;
if (!r) { $('from').value = ''; $('to').value = ''; }
else if (r.type === 'm') { $('from').value = r.from; $('to').value = r.to; }
else {
var a = mAt(r.t0), b = mAt(Math.max(r.t0, r.t1 - 1e-6));
$('from').value = a ? a.num : ''; $('to').value = b ? b.num : '';
}
refreshRegion();
}
function setMeasureRange(a, b) {
setRegion({ type: 'm', from: Math.min(a, b), to: Math.max(a, b) });
}
function calcGaugeRecoveryUnit(totalNotes) {
if (!(totalNotes > 0)) return 0;
if (totalNotes < 350) return Math.floor(80000 / (totalNotes * 6));
return Math.floor(80000 / ((Math.floor((totalNotes - 350) / 3) + 350) * 6));
}
var allNotes = TDCore.select(chart, {});   // ゲージ計算は集計フィルタに関係なく全ノーツ
var totalNotes = parseInt(chart.declaredNotes, 10) || allNotes.length;
var recUnit = calcGaugeRecoveryUnit(totalNotes);
function gaugeStr(count) {
if ($('hard').checked) {
var hGauge = count * 0.16;
var hPoors = Math.floor(hGauge / 9.0);
return ' <span class="gg">HARD +' + f2(hGauge) + '%</span>' +
' <span class="mut">(' + count + 'notes × 0.16% ≒ POOR ' + hPoors + '発分)</span>';
}
return ' <span class="gg">ノマゲ +' + f2(recUnit * count / 50) + '%</span>' +
' <span class="mut">(' + count + 'notes × ' + f2(recUnit / 50) + '%)</span>';
}
var hlDivs = [], hlDims = [], hlKey = '', hlReq = 0;
var targetsBuilt = null;   // 目印を付けた最初の div (DOM が描き直されたら作り直すための番兵)
var divsByN = {};
function ensureTargets() {
if (targetsBuilt && document.contains(targetsBuilt)) return;
divsByN = {}; targetsBuilt = null;
Array.prototype.forEach.call(document.querySelectorAll('a[id^="mes"]'), function (a) {
var n = +a.id.slice(3), tr = a.closest('tr');
if (!tr || !byN[n]) return;
var divs = Array.prototype.slice.call(tr.querySelectorAll('td > div'));
divs.forEach(function (d) {
d.classList.add('td-hl-target'); d.setAttribute('data-tdn', n);
if (!targetsBuilt) targetsBuilt = d;
});
divsByN[n] = divs;
});
}
function clearHighlight() {
hlDims.forEach(function (d) { if (d.parentNode) d.parentNode.removeChild(d); });
hlDivs.forEach(function (d) { d.classList.remove('td-hl'); });
hlDims = []; hlDivs = []; hlKey = '';
document.body.classList.remove('td-hl-active');
}
function scheduleHighlight() {
if (!hlReq) hlReq = (G.requestAnimationFrame || setTimeout)(function () { hlReq = 0; applyHighlight(); });
}
function applyHighlight() {
var on = region && region.t1 > region.t0 && $('hl-opt').checked && host.style.display !== 'none';
var key = on ? region.t0 + '|' + region.t1 : '';
if (key === hlKey && (!on || document.contains(hlDivs[0] || document.body))) return;
clearHighlight();
if (!on) return;
ensureTargets();
var pos0 = chart.posAt(region.t0), pos1 = chart.posAt(region.t1);
chart.measures.forEach(function (m) {
if (Math.max(m.start, pos0) >= Math.min(m.end, pos1)) return;
var len = m.end - m.start;
var p0 = (Math.max(pos0, m.start) - m.start) / len;
var p1 = (Math.min(pos1, m.end) - m.start) / len;
(divsByN[m.n] || []).forEach(function (div) {
div.classList.add('td-hl'); hlDivs.push(div);
if (p0 > 0.001) addDim(div, 0, p0);
if (p1 < 0.999) addDim(div, p1, 1);
});
});
hlKey = key;
if (hlDivs.length) document.body.classList.add('td-hl-active');
}
function addDim(div, bot, top) {
var d = document.createElement('div');
d.className = 'td-hl-dim';
d.style.cssText = 'position:absolute;left:0;width:100%;bottom:' + (bot * 100) + '%;height:' + ((top - bot) * 100) +
'%;top:auto;background:rgba(0,0,0,.85);z-index:9;pointer-events:none';
div.appendChild(d); hlDims.push(d);
}
function refreshRegion() {
var res = $('res');
if (region && region.type === 'm') {
var r = TDCore.measureRange(chart, sel, region.from, region.to);
if (!r) { res.textContent = '該当する小節がありません'; region = null; }
else {
var ra = TDCore.measureRange(chart, allNotes, region.from, region.to);
region.t0 = r.t0; region.t1 = r.t1;
res.innerHTML = r.from + '〜' + r.to + '小節: ' + r.count + ' notes / ' + f2(r.dur) + '秒 = <em>' + f2(r.nps) +
'</em> notes/s' + gaugeStr(ra.count) + ' <span class="mut">(BPM ' + bpmStr(r.bpmMin, r.bpmMax) + ', ' + fmtT(r.t0) + '〜' + fmtT(r.t1) + ')</span>';
}
} else if (region && region.t1 - region.t0 > 1e-6) {
var q = TDCore.timeRange(sel, region.t0, region.t1);
var qa = TDCore.timeRange(allNotes, region.t0, region.t1);
var a = mAt(region.t0), b = mAt(region.t1 - 1e-6);
res.innerHTML = fmtT(q.t0) + '〜' + fmtT(q.t1) + ' <span class="mut">(小節' + (a ? a.num : '?') + '〜' + (b ? b.num : '?') +
')</span>: ' + q.count + ' notes / ' + f2(q.dur) + '秒 = <em>' + f2(q.nps) + '</em> notes/s' + gaugeStr(qa.count);
} else {
res.textContent = '';   // 範囲なし / 幅0 (拍吸着で始点と終点が同じ拍になった等) は何も出さない
}
if (pickAnchor) res.innerHTML = '<span class="d">終点をタップ ▶</span> ' + res.innerHTML;
draw();
scheduleHighlight();
}
function scrollToMeasure(num) {
var m = null;
chart.measures.forEach(function (x) { if (x.num === num) m = x; });
if (!m) return;
var el = document.getElementById('mes' + m.n);
if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
}
var PADL = 34, PADR = 8, PADT = 8, PADB = 18;
function geom() {
var W = cv.clientWidth, H = cv.clientHeight;
return { W: W, H: H, x0: PADL, x1: W - PADR, y0: PADT, y1: H - PADB };
}
function tx(g, t) { return g.x0 + (g.x1 - g.x0) * t / songEnd; }
function xt(g, x) { return Math.max(0, Math.min(songEnd, (x - g.x0) / (g.x1 - g.x0) * songEnd)); }
function draw() {
var dpr = G.devicePixelRatio || 1;
var g = geom();
if (!g.W) return;
if (cv.width !== Math.round(g.W * dpr) || cv.height !== Math.round(g.H * dpr)) {
cv.width = Math.round(g.W * dpr); cv.height = Math.round(g.H * dpr);
}
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
ctx.clearRect(0, 0, g.W, g.H);
var step = Math.max(songEnd / Math.max(50, g.x1 - g.x0), 0.01);
var ck = opt.win + '|' + step;
if (crvCache.sel !== sel || crvCache.key !== ck) {
var c = TDCore.curve(sel, opt.win, 0, songEnd, step);
var mx = 1;
c.forEach(function (p) { if (p[1] > mx) mx = p[1]; });
pm.forEach(function (x) { if (x.nps > mx) mx = x.nps; });
crvCache = { sel: sel, key: ck, crv: c, ymax: Math.max(1, Math.ceil(mx * 1.05)) }; // 1刻みで5%の余裕
}
var crv = crvCache.crv, ymax = crvCache.ymax;
function ty(v) { return g.y1 - (g.y1 - g.y0) * v / ymax; }
ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
var ystep = 1;
if (ymax >= 40) ystep = 10;
else if (ymax >= 20) ystep = 5;
else if (ymax >= 10) ystep = 2;
for (var v = 0; v <= ymax; v += ystep) {
ctx.strokeStyle = v ? '#1f2535' : '#3a4460'; ctx.beginPath(); ctx.moveTo(g.x0, ty(v)); ctx.lineTo(g.x1, ty(v)); ctx.stroke();
ctx.fillStyle = '#778'; ctx.fillText(v, g.x0 - 4, ty(v));
}
if (region && region.t1 > region.t0) {
ctx.fillStyle = 'rgba(255,200,80,.18)';
ctx.fillRect(tx(g, region.t0), g.y0, Math.max(1, tx(g, region.t1) - tx(g, region.t0)), g.y1 - g.y0);
}
pm.forEach(function (x) {
var a = tx(g, x.m.tStart), b = tx(g, x.m.tEnd);
ctx.fillStyle = 'rgba(90,140,220,.35)';
ctx.fillRect(a, ty(x.nps), Math.max(0.5, b - a - 0.5), g.y1 - ty(x.nps));
});
ctx.textAlign = 'center'; ctx.textBaseline = 'top';
var lastLbl = -1e9;
chart.measures.forEach(function (m) {
var x = tx(g, m.tStart);
if (x - lastLbl >= 26) {
ctx.strokeStyle = '#2a3145'; ctx.beginPath(); ctx.moveTo(x, g.y1); ctx.lineTo(x, g.y1 + 3); ctx.stroke();
ctx.fillStyle = '#889'; ctx.fillText(m.num, x, g.y1 + 4); lastLbl = x;
}
});
ctx.fillStyle = '#6c6'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
chart.tempo.forEach(function (t, i) {
if (i === 0 && chart.tempo.length === 1) return;
var x = tx(g, t.time);
ctx.strokeStyle = 'rgba(100,200,100,.35)'; ctx.beginPath(); ctx.moveTo(x, g.y0); ctx.lineTo(x, g.y1); ctx.stroke();
ctx.fillText(t.bpm, x + 2, g.y0);
});
ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 1.5; ctx.beginPath();
crv.forEach(function (p, i) { var x = tx(g, p[0]), y = ty(p[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
ctx.stroke(); ctx.lineWidth = 1;
ctx.textAlign = 'right'; ctx.fillStyle = '#ffb347';
ctx.fillText('— ' + opt.win + '秒窓', g.x1 - 4, g.y0);
ctx.fillStyle = 'rgba(120,170,240,.9)'; ctx.fillText('■ 小節ごと', g.x1 - 70, g.y0);
if (hoverT != null) {
var hx = tx(g, hoverT);
ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.moveTo(hx, g.y0); ctx.lineTo(hx, g.y1); ctx.stroke();
var hm = mAt(hoverT), q = TDCore.timeRange(sel, hoverT - opt.win / 2, hoverT + opt.win / 2);
var pmx = null; pm.forEach(function (x) { if (hm && x.m === hm) pmx = x; });
var txt = fmtT(hoverT) + '  小節' + (hm ? hm.num : '?') + '  窓 ' + f2(q.nps) + (pmx ? '  小節 ' + f2(pmx.nps) + ' (' + pmx.count + ')' : '') +
(hm ? '  BPM ' + bpmStr(hm.bpmMin, hm.bpmMax) : '');
ctx.font = '11px sans-serif';
var tw = ctx.measureText(txt).width + 10;
var bx = Math.min(Math.max(hx + 8, g.x0), g.x1 - tw);
ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.fillRect(bx, g.y0 + 14, tw, 18);
ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 5, g.y0 + 23);
}
}
var drag = null;
function localXY(e) {
var r = cv.getBoundingClientRect();
var sx = r.width ? cv.clientWidth / r.width : 1, sy = r.height ? cv.clientHeight / r.height : 1;
return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
}
cv.addEventListener('pointerdown', function (e) {
if (e.button) return;
var p = localXY(e);
var t = xt(geom(), p.x);
drag = { x: p.x, t0: nearestSnap(t), raw: t, moved: false, th: e.pointerType === 'mouse' ? 3 : 8 };
try { cv.setPointerCapture(e.pointerId); } catch (_) {}
e.preventDefault();
});
cv.addEventListener('pointermove', function (e) {
var g = geom(), p = localXY(e);
var inside = p.x >= 0 && p.x <= g.W && p.y >= 0 && p.y <= g.H;
hoverT = inside || drag ? xt(g, p.x) : null;
if (drag) {
if (Math.abs(p.x - drag.x) > drag.th) drag.moved = true;
if (drag.moved) {
var t = nearestSnap(hoverT);
var t0 = Math.min(drag.t0, t), t1 = Math.max(drag.t0, t);
if (!region || region.type !== 't' || region.t0 !== t0 || region.t1 !== t1) {
setRegion({ type: 't', t0: t0, t1: t1 });
return;
}
}
}
draw();
});
function endDrag(cancel) {
if (!drag) return;
var d = drag; drag = null;
if (!d.moved && !cancel) { hoverT = d.raw; var m = mAt(d.raw); if (m) scrollToMeasure(m.num); }
draw();
}
cv.addEventListener('pointerup', function () { endDrag(false); });
cv.addEventListener('pointercancel', function () { endDrag(true); });
cv.addEventListener('pointerleave', function (e) { if (!drag && e.pointerType === 'mouse') { hoverT = null; draw(); } });
$('cnend').onchange = function () { opt.includeCnEnd = this.checked; recompute(); };
$('scr').onchange = function () { opt.includeScratch = this.checked; recompute(); };
$('hard').onchange = function () { refreshRegion(); };
$('side').onchange = function () { opt.side = this.value === '' ? null : +this.value; recompute(); };
$('win').onchange = function () { opt.win = parseFloat(this.value); draw(); };
$('clear').onclick = function () { setRegion(null); };
$('hl-opt').onchange = function () { scheduleHighlight(); };
$('calc').onclick = function () {
var a = parseInt($('from').value, 10), b = parseInt($('to').value, 10);
if (isNaN(a)) return;
setMeasureRange(a, isNaN(b) ? a : b);
try { var ae = root.activeElement; if (ae && ae.blur) ae.blur(); } catch (_) {} // スマホのキーボードを閉じる
};
[$('from'), $('to')].forEach(function (el) { el.onkeydown = function (e) { if (e.key === 'Enter') $('calc').onclick(); }; });
var pageStyle = document.createElement('style');
pageStyle.textContent = 'body.td-pick [id^="mes"],body.td-pick .td-hl-target{cursor:pointer}' +
' body.td-hl-active .td-hl-target{opacity:0.2; transition: opacity 0.15s}' +
' body.td-hl-active .td-hl-target.td-hl{opacity:1; box-shadow: 0 0 0 2px rgba(255,255,255,0.5); position:relative; z-index:10}';
document.head.appendChild(pageStyle);
function pickActive() { return $('pick').checked && host.style.display !== 'none'; }
function syncPick() {
if (pickAnchor) { pickAnchor = null; refreshRegion(); }
if (pickActive()) ensureTargets();
document.body.classList.toggle('td-pick', pickActive());
}
$('pick').onchange = syncPick;
$('snap').onchange = function () { draw(); };
function onPageClick(e) {
if (!pickActive()) return;   // パネルを閉じた後はページのクリックを横取りしない
if (e.target && e.target.closest && e.target.closest('a[href]') && !/^mes-?\d+$/.test(e.target.id || '')) return; // 通常リンクは邪魔しない
var hit = hitTest(e);
if (!hit) return;
e.preventDefault(); e.stopPropagation();
if (!pickAnchor) {
pickAnchor = hit;
if (hit.num != null) setRegion({ type: 'm', from: hit.num, to: hit.num }, true);
else setRegion({ type: 't', t0: chart.timeAt(hit.p0), t1: chart.timeAt(hit.p1) }, true);
return;
}
var a = pickAnchor;
if (a.num != null && hit.num != null) setRegion({ type: 'm', from: Math.min(a.num, hit.num), to: Math.max(a.num, hit.num) });
else setRegion({ type: 't', t0: chart.timeAt(Math.min(a.p0, hit.p0)), t1: chart.timeAt(Math.max(a.p1, hit.p1)) });
}
function hitTest(e) {
var el = e.target, m;
while (el && el !== document.body && !(el.id && /^mes-?\d+$/.test(el.id))) el = el.parentNode;
if (el && el !== document.body) {
m = byN[+el.id.slice(3)];
return m ? { p0: m.start, p1: m.end, num: m.num } : null;
}
ensureTargets();
var div = e.target && e.target.closest ? e.target.closest('.td-hl-target') : null;
if (!div) return null;
m = byN[+div.getAttribute('data-tdn')];
if (!m) return null;
var r = div.getBoundingClientRect();
if (!r.height) return null;
var frac = Math.max(0, Math.min(0.9999, (r.bottom - e.clientY) / r.height));
var len = m.end - m.start, pos = m.start + frac * len;
if (!$('snap').checked) return { p0: pos, p1: pos };
var b0 = m.start + Math.floor((pos - m.start) / 96) * 96;
return { p0: b0, p1: Math.min(b0 + 96, m.end) };
}
document.addEventListener('click', onPageClick, true);
var isTop = false, lastW = 0, placeReq = 0;
function place() {
placeReq = 0;
if (host.style.display === 'none') return;
var vv = G.visualViewport;
var panel = $('panel');
panel.classList.toggle('top', isTop);
if (!vv) {
host.style.top = isTop ? '0' : 'auto'; host.style.bottom = isTop ? 'auto' : '0';
panel.classList.toggle('cmp', G.innerWidth < 700);
} else {
var k = 1 / vv.scale, w = vv.width * vv.scale;
host.style.left = vv.offsetLeft + 'px'; host.style.right = 'auto';
host.style.width = w + 'px';
host.style.transformOrigin = '0 0';
host.style.transform = k === 1 ? '' : 'scale(' + k + ')';
panel.classList.toggle('cmp', w < 700);
var h = host.offsetHeight * k;
host.style.bottom = 'auto';
host.style.top = (isTop ? vv.offsetTop : vv.offsetTop + vv.height - h) + 'px';
}
if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; draw(); }
}
function schedulePlace() { if (!placeReq) placeReq = (G.requestAnimationFrame || setTimeout)(place); }
if (G.visualViewport) {
G.visualViewport.addEventListener('resize', schedulePlace);
G.visualViewport.addEventListener('scroll', schedulePlace);
}
G.addEventListener('scroll', schedulePlace, { passive: true });
G.addEventListener('resize', schedulePlace);
if (G.ResizeObserver) new ResizeObserver(schedulePlace).observe($('panel'));
var minimized = false;
$('min').onclick = function () { minimized = !minimized; $('body').classList.toggle('hid', minimized); schedulePlace(); };
$('cls').onclick = function () { host.style.display = 'none'; syncPick(); clearHighlight(); };
$('pos').onclick = function () { isTop = !isTop; schedulePlace(); };
var isTrans = false;
$('opc').onclick = function () {
isTrans = !isTrans;
$('panel').style.background = isTrans ? 'rgba(18,20,28,0.4)' : 'rgba(18,20,28,0.96)';
cv.style.opacity = isTrans ? '0.6' : '1';
};
G.__tdPanel = {
show: function () {
host.style.display = ''; minimized = false; $('body').classList.remove('hid');
syncPick(); place(); draw(); scheduleHighlight();
},
chart: chart
};
syncPick();
place();
recompute();
})();
})();