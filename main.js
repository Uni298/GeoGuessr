// main.js — 数字のカウントアップ＆降下アニメーション追加版
// - 回答後、マップのシネマティックな演出（正解ズーム→ズームアウト）を行ったあと
//   結果パネルをスライドアップし、距離／時間／スコアを上から降らせつつカウントアップします。
// - 右上の小さめマップを縮小するボタンは最前面に配置しています。
// 必ずローカルの HTTP サーバーで開いてください。

let spawnList = [];
let currentIndex = 0;
let correctLat = 0, correctLng = 0, correctPano = "";
let guessLat = null, guessLng = null;
let smallMap = null;
let markerGuess = null, markerCorrect = null, poly = null;
let startTime = 0, elapsedTimer = null;
let totalRounds = 0;

// DOM helpers
const iframeEl = () => document.getElementById("streetview");
const submitBtn = () => document.getElementById("submit");
const headerNextBtn = () => document.getElementById("next");
const roundEl = () => document.getElementById("round");
const totalEl = () => document.getElementById("total");
const selLatEl = () => document.getElementById("sel-lat");
const selLngEl = () => document.getElementById("sel-lng");
const elapsedEl = () => document.getElementById("elapsed");
const resultPanel = () => document.getElementById("result-panel");
const resultDistance = () => document.getElementById("result-distance");
const resultTimeEl = () => document.getElementById("result-time");
const resultScoreEl = () => document.getElementById("result-score");
const nextRoundBtn = () => document.getElementById("next-round");
const smallMapEl = () => document.getElementById("small-map");
const smallCloseBtn = () => document.getElementById("small-close");

// util: great-circle distance (km)
function calcDistance(lat1, lon1, lat2, lon2){
  const R = 6371;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// load spawn.json
async function loadSpawns(){
  try{
    const res = await fetch("spawn.json");
    if(!res.ok) throw new Error("spawn.json を読み込めません");
    spawnList = await res.json();
    totalRounds = spawnList.length;
    totalEl().textContent = totalRounds;
    console.log("spawn loaded:", spawnList.length);
  }catch(e){
    console.error(e);
    alert("spawn.json の読み込みに失敗しました。ローカルサーバーで実行してください。");
  }
}

// set iframe pano
function setIframePano(p){
  if(!p) return;
  correctLat = p.lat; correctLng = p.lng; correctPano = p.pano;
  const src = `https://www.google.com/maps/embed?pb=!4v0!6m8!1m7!1s${encodeURIComponent(p.pano)}!2m2!1d${p.lat}!2d${p.lng}!3f${p.heading || 0}!4f${p.pitch || 0}!5f1.0`;
  iframeEl().src = src;
}

// init small map
function initSmallMap(){
  if(window.L && !smallMap){
    smallMap = L.map("small-map", {zoomControl:false, attributionControl:false}).setView([35.68,139.76], 5);
   

L.tileLayer('https://tile.openstreetmap.jp/{z}/{x}/{y}.png', {
  maxZoom: 20,
  attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
}).addTo(smallMap);


    smallMap.on("click", function(e){
      const el = smallMapEl();
      if(el.classList.contains("reveal")){
        placeGuess(e.latlng.lat, e.latlng.lng);
      } else {
        revealSmallMap(true);
      }
    });

    smallMapEl().addEventListener("dblclick", (ev) => { ev.stopPropagation(); revealSmallMap(!smallMapEl().classList.contains("reveal")); });
    smallCloseBtn().addEventListener("click", (ev) => { ev.stopPropagation(); revealSmallMap(false); });

    setTimeout(()=> smallMap.invalidateSize(), 300);
  }
}

// place guess marker
function placeGuess(lat, lng){
  guessLat = lat; guessLng = lng;
  selLatEl().textContent = lat.toFixed(5);
  selLngEl().textContent = lng.toFixed(5);
  if(markerGuess) smallMap.removeLayer(markerGuess);
  markerGuess = L.marker([lat,lng], {title:"あなたの推測"}).addTo(smallMap);
}

// reveal smallMap (expand) or collapse
function revealSmallMap(show){
  const el = smallMapEl();
  if(show){
    el.classList.remove("compact");
    el.classList.add("reveal");
    setTimeout(()=> smallMap.invalidateSize(), 320);
  } else {
    el.classList.remove("reveal");
    el.classList.add("compact");
    setTimeout(()=> smallMap.invalidateSize(), 320);
  }
}

// start round
function startRound(i){
  clearRound();
  currentIndex = i;
  roundEl().textContent = (i+1);
  const p = spawnList[i];
  setIframePano(p);

  smallMapEl().classList.remove("reveal");
  smallMapEl().classList.add("compact");
  smallMap.setView([35.68,139.76], 11);

  submitBtn().disabled = false;
  headerNextBtn().disabled = true;
  nextRoundBtn().disabled = true;

  startTime = Date.now();
  selLatEl().textContent = "—";
  selLngEl().textContent = "—";
  elapsedEl().textContent = "0.00";
  startElapsedTimer();
}

// timers
function startElapsedTimer(){
  if(elapsedTimer) clearInterval(elapsedTimer);
  elapsedTimer = setInterval(()=> {
    const s = (Date.now() - startTime)/1000;
    elapsedEl().textContent = s.toFixed(2);
  }, 100);
}
function stopElapsedTimer(){
  if(elapsedTimer) clearInterval(elapsedTimer);
  elapsedTimer = null;
}

// helper: delay
function delay(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

// flyTo helper returns promise
function flyToZoomSmallMap(lat,lng,zoom,duration){
  return new Promise(resolve => {
    try{
      smallMap.flyTo([lat,lng], zoom, {duration: duration});
      setTimeout(resolve, Math.max(500, duration*1000 + 120));
    }catch(e){
      resolve();
    }
  });
}

// animate numeric value (anime.js) with formatting
function animateNumberTo(elSpan, endValue, options = {}) {
  const decimals = options.decimals ?? 0;
  const duration = options.duration ?? 900;
  const delay = options.delay ?? 0;

  const obj = { val: 0 };
  anime({
    targets: obj,
    val: endValue,
    duration: duration,
    delay: delay,
    easing: 'easeOutExpo',
    round: decimals === 0 ? 1 : false,
    update: function() {
      let v = obj.val;
      if(decimals === 0) {
        elSpan.textContent = Math.round(v).toLocaleString();
      } else {
        elSpan.textContent = (v).toFixed(decimals);
      }
    }
  });
}

// reveal sequence when answer is submitted

// reveal sequence when answer is submitted
async function checkAnswer(){
  if(guessLat == null){
    alert("推測位置を選択してください（右下の小マップを展開してクリック）");
    return;
  }
  stopElapsedTimer();
  const elapsedSec = (Date.now() - startTime)/1000;
  const dist = calcDistance(correctLat, correctLng, guessLat, guessLng);
  const score = Math.max(0, Math.round(Math.max(0, 5000 - dist*50) - elapsedSec*2));

  const distSpan = resultDistance().querySelector('.num');
  const timeSpan = resultTimeEl().querySelector('.num');
  const scoreSpan = resultScoreEl().querySelector('.num');

  // マーカーとラインを描画
  if(markerCorrect) try{ smallMap.removeLayer(markerCorrect); }catch(e){}
  markerCorrect = L.marker([correctLat,correctLng], {
    icon: L.divIcon({className:'marker-correct', html:'<div style="width:16px;height:16px;border-radius:50%;background:#ef4444;border:3px solid #fff"></div>'}),
    title: "正解"
  }).addTo(smallMap);

  if(!markerGuess && guessLat != null){
    markerGuess = L.marker([guessLat,guessLng], {title:"あなたの推測"}).addTo(smallMap);
  }

  if(poly) try{ smallMap.removeLayer(poly); }catch(e){}
  poly = L.polyline([[correctLat,correctLng],[guessLat,guessLng]], {color:'#2563eb',weight:4,opacity:0.95, dashArray:'8 6'}).addTo(smallMap);

  // マップ演出
  revealSmallMap(true);
  await delay(420);
  smallMap.invalidateSize();
  await flyToZoomSmallMap(correctLat, correctLng, 16, 1.2);
  await delay(600);
  const bounds = L.latLngBounds([[correctLat,correctLng],[guessLat,guessLng]]);
  smallMap.fitBounds(bounds.pad(0.74), {animate:true, duration:1.4});
  await delay(1500);

// 結果パネルを「上から角丸カードが落ちてくる」ように表示
const panel = resultPanel();
panel.classList.add("show");

anime({
  targets: panel,
  top: ["-400px", "80px"], 
  opacity: [0, 1],
  scale: [0.95, 1],
  duration: 900,
  easing: "easeOutElastic(1, .6)"
});

// 数値部分の初期化
distSpan.textContent = "0";
timeSpan.textContent = "0.00";
scoreSpan.textContent = "5000";

// ★ 親の result-number は「不透明」にしておく（CSS修正）
resultDistance().style.opacity = 1;
resultTimeEl().style.opacity = 1;
resultScoreEl().style.opacity = 1;

// ★ 子の .num だけを透明化＆上に配置
[distSpan, timeSpan, scoreSpan].forEach(span => {
  span.style.opacity = 0;
  span.style.transform = "translateY(-40px)";
});

// ---- 距離 ----
anime({
  targets: distSpan,
  translateY: [-40, 0],
  opacity: [0, 1],
  duration: 700,
  easing: "easeOutBounce",
  delay: 200
});
animateNumberTo(distSpan, dist, {decimals: 2, duration: 1200, delay: 250});

// ---- 時間 ----
anime({
  targets: timeSpan,
  translateY: [-40, 0],
  opacity: [0, 1],
  duration: 700,
  easing: "easeOutBounce",
  delay: 400
});
animateNumberTo(timeSpan, elapsedSec, {decimals: 2, duration: 1000, delay: 450});

// ---- スコア ----
anime({
  targets: scoreSpan,
  translateY: [-40, 0],
  opacity: [0, 1],
  duration: 700,
  easing: "easeOutBounce",
  delay: 600
});
animateNumberTo(scoreSpan, score, {decimals: 0, duration: 1000, delay: 650});


  // 次へボタン有効化
  setTimeout(()=> {
    nextRoundBtn().disabled = false;
    headerNextBtn().disabled = false;
  }, 1600);

  submitBtn().disabled = true;
}


// next round
function nextRound(){

const panel = resultPanel();
  anime({
    targets: panel,
    translateY: [0, 100],
    opacity: [1, 0],
    duration: 500,
    easing: "easeInQuad",
    complete: () => {
      panel.classList.remove("show");
      panel.style.opacity = "";
      panel.style.transform = "";
    }
  });

  // ★ここでcompactに戻す
  revealSmallMap(false);
  clearRound();
  const nextIndex = (currentIndex + 1) % spawnList.length;
  startRound(nextIndex);
}

// cleanup
function clearRound(){
  if(markerGuess){ try{ smallMap.removeLayer(markerGuess); }catch(e){} markerGuess = null; }
  if(markerCorrect){ try{ smallMap.removeLayer(markerCorrect); }catch(e){} markerCorrect = null; }
  if(poly){ try{ smallMap.removeLayer(poly); }catch(e){} poly = null; }
  stopElapsedTimer();
  guessLat = null; guessLng = null;
  selLatEl().textContent = "—";
  selLngEl().textContent = "—";
  nextRoundBtn().disabled = true;
}

// initialization
async function init(){
  await loadSpawns();
  initSmallMap();

  submitBtn().addEventListener("click", checkAnswer);
  document.getElementById("next").addEventListener("click", nextRound);
  nextRoundBtn().addEventListener("click", nextRound);
  document.getElementById("close-result")?.addEventListener("click", ()=> {
    resultPanel().classList.remove("show");
    revealSmallMap(false);
  });

if(spawnList.length > 0){
  const firstIndex = Math.floor(Math.random() * spawnList.length);
  startRound(firstIndex);
} else {
  alert("spawn.json にスポーンがありません。spawn.json を用意してください。");
}

}

window.addEventListener("load", init);
