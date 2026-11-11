# CLAUDE.md — taiwan-flower-map（台灣賞花地圖）

`japan-sakura-season`（日本櫻花季地圖）的姊妹專案（2026-11-12 建立）：UI 框架沿用櫻花季、3D 台灣地形沿用 `taiwan-bird-atlas`，畫面改成**台灣花布風**（紅底牡丹＋綠葉的 SVG 花布紋當滾邊與載入畫面，不是櫻花季的和紙風）。時間軸是**全年 1/1～12/31**（可跨年、播放一圈）；33 個賞花地點 × 25 種花；陸地 shader 依各地點目前最值得看的花染色，近看時地面印出「花布」小碎花（`fwidth` 遠看淡出），鏡頭越遠染色範圍越大越濃；每個地點一個自繪台灣地標（廟、涼亭、三合院、圓塔、花鐘、梯田、古道、椰林、小火車、紅磚斷橋、城門、菸樓、孤樹稻田、燈塔、湖、林道…）＋依花型態長出的植物（`tree` 花樹／`shrub` 灌叢／`field` 花田／`water` 荷池／`grass` 芒草），樹類在盛開～尾聲依花色落花（油桐五月雪、木棉紅花、阿勃勒黃金雨）。無框架、無建置。

## 資料（重要）
- `data.js`：`TF.REGIONS / STAGES / FLOWERS / SPOTS / ETIQUETTE / GLOSSARY / PEAKS / ISLANDS`。地點 `fl:[[花id,'開始','最盛','結束'], …]`（日期可跨年，例如梅花 12/20～1/31）；`TF.stageAt(w,d)`／`TF.spotBest(p,d)`／`TF.amount` 是唯一花況入口（`TF.rel` 處理跨年）。階段：非花期／快開了（開始前 14 天）／初開／盛開／尾聲。
- **花期為一般性參考**（公開花季資訊與新聞整理），頁面、警語、manual 都有註明；2026-11 查證過的：嘉義八掌溪（盧山橋防汛道）與埔里內埔的藍花楹、台南林森路／白河南 89 線阿勃勒、杉林溪繡球花、草嶺古道芒花季（2026 因颱風延到 11/14–12/13）。文字全部自寫。
- `TF.ISLANDS` 複製自賞鳥地圖（手描簡化）。
- `photos.js` 由 `python tools/fetch_photos.py` 產生（`PIN` 指定檔名 → 英文維基代表圖 → `SEARCH` 搜尋；`SEARCH_FIRST` 的花略過條目圖）；只收 CC0／PD／CC BY／CC BY-SA 且有作者（拒絕 `No machine-readable author`）。**產生後要人工看縮圖**：第一輪山櫻花糊、杜鵑幾乎沒花、木棉遠景、阿勃勒花少都換成 `PIN`。
- 改資料或照片後重產手冊：`node tools/build_manual.js . tools/manual_tpl.html`（**manual.html 是產出檔**）。

## 程式
- `scene.js`（`window.FlowerScene`）：投影 `P(lon,lat)` 1 單位≈10 km、`KM=.42`；陸地每島一個網格（`buildLand`），`landY` 逐島重算。地面花色用 uniform 陣列 `uSp[NS]`（x,z,半徑,強度）＋`uSc[NS]`（顏色），`#define NS` 由地點數決定；`RADIUS` 依花型態。地點群聚（<.7 單位，陽明山 3 處、白河 2 處）在圓周上分開。`S.stats()` 可驗證（`bloomSpots` 地面有染色的地點數、`petals` 落花來源數）。
- `app.js`：測試 hook `window.__flower`（`state/setDay/selectSpot/selectRegion/setMode/openFlower/closeFlower/TF/scene`）。
- 手機（≤760px）清單預設收合；鏡頭 `setViewOffset` 收合 −9%／展開 +10%（第一版 +20% 會讓選中地點被日期列擋住）。
- `.cloth`（花布滾邊）**不可加 `position:relative`**，會蓋掉 `.ui` 的 `position:fixed`，整個面板掉回文件流（第一版踩過）。

## 配套
- ✅ 跑馬燈（必備）、manual（資料來源、照片授權表、完整創作者）、使用警語（底部＋首訪自動跳，`taiwanFlowerSeenWarning`）、⚙常用設定收合式（`taiwanFlowerSettings`；展開狀態 `taiwanFlowerSetOpen`）、偏好 `taiwanFlowerPrefs`、PWA（改 js 記得 `service-worker.js` 的 `CACHE_NAME` +1；`icons/` 用 PIL 畫花布牡丹）、訪客計數器 `page_id=m255525.taiwanflowermap`、RWD（375px 無橫向捲動）。
- ❌ 序號授權（不需要）
- GitHub Pages：`master` 分支＋`.github/workflows/deploy-pages.yml`，網址 https://m255525.github.io/taiwan-flower-map/ 。已放進創業島「歡樂遊樂園」。

## Port／測試
- port **8869**（`.claude/launch.json` 的 `taiwan-flower-map`）。
- 驗證：`__flower.setDay(TF.doy('3/12')); selectSpot('linchupi')` 木棉盛開、紅色落花（`scene.stats().petals>0`）；`setDay(TF.doy('4/28')); selectSpot('sanyi')` 油桐白色落花；`setDay(TF.doy('1/10'))` 梅花、油菜花跨年花期正常；`openFlower('tung')` 照片與授權標示正常；console 無錯誤；375px `scrollWidth===clientWidth`。
