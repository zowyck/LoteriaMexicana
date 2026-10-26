// ============================================================
// ESTADO GLOBAL
// ============================================================
let playing = false;
let timer = null;
let currentAudio = null;

const deck = [];
let currentDeck = [];
const history = [];

// ============================================================
// CONFIGURACIÓN DE CACHÉ Y VERSIÓN
// ============================================================
const CACHE_NAME = "loteria-v9";
const TOTAL_FILES = 6 + 108;
const APP_VERSION = "1.6.0";
const LS_KEY = "loteria_precache_info";

// ============================================================
// 54 CARTAS
// ============================================================
for (let i = 1; i <= 54; i++) {
    deck.push({
        id: i,
        image: `assets/cards/default_${i}.png`,
        sound: `assets/cards/default_${i}.mp3`
    });
}

// ============================================================
// PERSISTENCIA
// ============================================================
async function pedirPersistencia() {
    if (!navigator.storage || !navigator.storage.persist) return false;
    try {
        if (await navigator.storage.persisted()) {
            console.log("[App] ✅ Persistencia ya concedida");
            return true;
        }
        const concedida = await navigator.storage.persist();
        console.log(concedida
            ? "[App] ✅ Persistencia concedida"
            : "[App] ⚠️ Persistencia denegada");
        return concedida;
    } catch (err) {
        console.warn("[App] Error pidiendo persistencia:", err);
        return false;
    }
}

// ============================================================
// CONTROL DE VERSIÓN
// ============================================================
function debePrecachear() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return true;

        let info;
        try {
            info = JSON.parse(raw);
        } catch {
            console.warn("[App] localStorage corrupto, borrando");
            localStorage.removeItem(LS_KEY);
            return true;
        }

        if (!info.version) {
            console.warn("[App] Sin versión, forzando precarga");
            localStorage.removeItem(LS_KEY);
            return true;
        }

        if (info.version !== APP_VERSION) {
            console.log("[App] Versión nueva:", APP_VERSION, "≠", info.version);
            return true;
        }

        console.log("[App] Caché vigente");
        return false;
    } catch (e) {
        console.warn("[App] Error leyendo localStorage:", e);
        return true;
    }
}

function marcarPrecacheCompleto() {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify({
            version: APP_VERSION
        }));
    } catch (e) {}
}

// ============================================================
// DESBLOQUEO DE AUDIO
// ============================================================
let audioUnlocked = false;
function unlockAudio() {
    if (audioUnlocked) return;
    const a = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
    a.volume = 0;
    a.play().then(() => {
        audioUnlocked = true;
        console.log("[App] Audio desbloqueado");
    }).catch(() => {});
}
["click", "touchstart", "keydown", "pointerdown"].forEach(ev =>
    document.addEventListener(ev, unlockAudio)
);

// ============================================================
// MOSTRAR / OCULTAR BARRA SUPERIOR
// ============================================================
function mostrarTextosJuego() {
    const topBar = document.getElementById("topBar");
    if (topBar) topBar.style.display = "flex";
}

function ocultarTextosJuego() {
    const topBar = document.getElementById("topBar");
    if (topBar) topBar.style.display = "none";
}

// ============================================================
// SELECTOR DE TIEMPO
// ============================================================
function toggleSpeedMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById("speedMenu");
    if (!menu) return;
    menu.classList.toggle("open");
}

function setSpeed(ms, btn) {
    const select = document.getElementById("speed");
    if (select) select.value = ms;

    const speedBtn = document.getElementById("speedBtn");
    if (speedBtn) speedBtn.innerText = "⏱ " + (ms / 1000) + " s";

    document.querySelectorAll("#speedMenu button").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");

    const menu = document.getElementById("speedMenu");
    if (menu) menu.classList.remove("open");

    if (playing) {
        clearInterval(timer);
        timer = setInterval(drawCard, ms);
    }
}

document.addEventListener("click", (e) => {
    const menu = document.getElementById("speedMenu");
    const btn = document.getElementById("speedBtn");
    if (!menu || !btn) return;
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
        menu.classList.remove("open");
    }
});

// ============================================================
// BARRA DE PROGRESO
// ============================================================
let progressTimeout = null;

function updateProgressUI(done, total, text, forceHide = false) {
    const bar = document.getElementById("loadBar");
    const wrap = document.getElementById("loadProgress");
    const label = document.getElementById("loadText");
    if (!bar || !wrap) return;

    const pct = Math.min(100, Math.round((done / total) * 100));
    bar.style.width = pct + "%";
    if (label) label.innerText = text || `${pct}% (${done}/${total})`;

    if (done >= total || forceHide) {
        clearTimeout(progressTimeout);
        setTimeout(() => wrap.classList.add("hidden"), 500);
    } else {
        wrap.classList.remove("hidden");
    }
}

function armProgressTimeout() {
    clearTimeout(progressTimeout);
    progressTimeout = setTimeout(() => {
        console.warn("[App] Timeout de precarga, ocultando barra");
        updateProgressUI(1, 1, "✅ Listo (parcial)", true);
    }, 45000);
}

async function trackProgress() {
    if (!("caches" in window)) {
        updateProgressUI(1, 1, "", true);
        return;
    }
    armProgressTimeout();

    try {
        const cache = await caches.open(CACHE_NAME);
        const cached = (await cache.keys()).length;

        if (cached >= TOTAL_FILES) {
            console.log("[App] Caché completa, offline listo");
            updateProgressUI(TOTAL_FILES, TOTAL_FILES, "✅ Listo", true);
            return;
        }

        updateProgressUI(cached, TOTAL_FILES);

        const urls = [
            "./", "./index.html", "./style.css", "./app.js",
            "./manifest.json", "./assets/Logo.png",
            ...deck.flatMap(c => [c.image, c.sound])
        ];

        const BATCH = 6;
        let done = cached;

        for (let i = 0; i < urls.length; i += BATCH) {
            const lote = urls.slice(i, i + BATCH);
            await Promise.allSettled(
                lote.map(url => {
                    const controller = new AbortController();
                    const t = setTimeout(() => controller.abort(), 8000);
                    return fetch(url, {
                        cache: "force-cache",
                        signal: controller.signal
                    }).finally(() => clearTimeout(t)).catch(() => {});
                })
            );
            done = Math.min(urls.length, i + BATCH);
            updateProgressUI(done, TOTAL_FILES);
        }

        updateProgressUI(TOTAL_FILES, TOTAL_FILES, "✅ Listo para usar offline");
    } catch (err) {
        console.error("[App] Error en precarga:", err);
        updateProgressUI(1, 1, "", true);
    }
}

// ============================================================
// JUEGO (MODO NAIPES)
// ============================================================
function shuffle() {
    currentDeck = [...deck];
    for (let i = currentDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [currentDeck[i], currentDeck[j]] = [currentDeck[j], currentDeck[i]];
    }
}
shuffle();

function drawCard() {
    if (currentDeck.length === 0) {
        stopAuto();
        return;
    }

    mostrarTextosJuego();

    const card = currentDeck.shift();

    const img = document.getElementById("cardImage");
    img.src = card.image;
    img.onerror = () => console.log("No encontró imagen:", card.image);

    if (currentAudio) {
        try { currentAudio.pause(); currentAudio.currentTime = 0; } catch (_) {}
    }
    currentAudio = new Audio(card.sound);
    currentAudio.onerror = () => console.log("No encontró audio:", card.sound);
    currentAudio.play().catch(err => {
        if (err.name === "NotAllowedError") {
            unlockAudio();
        }
    });

    document.getElementById("remaining").innerText =
        currentDeck.length + " naipes restantes";

    history.unshift(card);
    if (history.length > 5) history.pop();
    updateHistory();
}

function updateHistory() {
    const box = document.getElementById("historyList");
    if (!box) return;
    box.innerHTML = "";
    history.forEach(card => {
        const img = document.createElement("img");
        img.src = card.image;
        img.className = "historyCard";
        box.appendChild(img);
    });
}

function startAuto() {
    const select = document.getElementById("speed");
    const speed = select ? parseInt(select.value) : 4000;

    drawCard();
    timer = setInterval(drawCard, speed);
    playing = true;
    document.getElementById("playPauseBtn").innerText = "⏸ Pausa";
}

function stopAuto() {
    clearInterval(timer);
    playing = false;
    const btn = document.getElementById("playPauseBtn");
    if (btn) btn.innerText = "▶ Iniciar";
}

function toggleAuto() { playing ? stopAuto() : startAuto(); }

function restartGame() {
    stopAuto();
    shuffle();
    history.length = 0;
    updateHistory();
    document.getElementById("cardImage").src = "assets/Logo.png";
    ocultarTextosJuego();
    document.getElementById("remaining").innerText = "54 naipes restantes";
}

// ============================================================
// MODO CARTAS - SET FIJO 4x4 Y GENERACIÓN DE RESPALDO
// ============================================================
const TABLA_COLS = 4;
const TABLA_ROWS = 4;
const TABLAS_TOTALES = 51;
const TOTAL_CELDAS = TABLA_COLS * TABLA_ROWS; // 16

// ---------- Set FIJO base 4x4 (sin filas, columnas ni esquinas repetidas) ----------
const TABLAS_FIJAS_BASE = [
  [8, 27, 2, 53, 38, 34, 10, 13, 6, 40, 41, 16, 42, 18, 21, 7],
  [4, 17, 12, 39, 52, 15, 29, 48, 42, 14, 50, 53, 26, 9, 3, 47],
  [17, 47, 8, 20, 2, 13, 52, 36, 23, 7, 50, 29, 45, 3, 9, 32],
  [48, 5, 29, 36, 28, 41, 46, 18, 32, 43, 22, 26, 11, 45, 7, 54],
  [28, 17, 6, 50, 45, 35, 21, 53, 34, 33, 49, 1, 52, 44, 18, 4],
  [33, 51, 15, 37, 44, 1, 36, 32, 2, 25, 34, 42, 38, 17, 41, 24],
  [29, 12, 20, 43, 36, 18, 23, 19, 16, 28, 15, 48, 42, 37, 5, 41],
  [34, 5, 15, 49, 36, 14, 6, 41, 39, 48, 26, 28, 22, 7, 31, 19],
  [13, 18, 31, 26, 33, 46, 51, 23, 8, 2, 29, 11, 36, 45, 14, 17],
  [22, 27, 44, 23, 52, 29, 38, 9, 13, 47, 45, 42, 16, 36, 1, 6],
  [54, 43, 13, 52, 28, 51, 23, 44, 50, 49, 47, 37, 22, 5, 10, 45],
  [12, 3, 4, 52, 36, 33, 11, 28, 18, 45, 27, 26, 35, 23, 54, 25],
  [30, 24, 49, 34, 32, 53, 22, 15, 46, 44, 52, 1, 50, 39, 27, 38],
  [29, 34, 16, 3, 46, 38, 7, 35, 31, 11, 20, 27, 2, 18, 28, 53],
  [21, 52, 6, 9, 11, 24, 23, 38, 51, 12, 10, 27, 18, 34, 13, 47],
  [37, 38, 15, 28, 11, 34, 48, 19, 46, 18, 30, 10, 17, 43, 39, 51],
  [4, 26, 41, 17, 53, 40, 44, 25, 49, 54, 46, 33, 24, 31, 47, 37],
  [54, 15, 29, 32, 37, 38, 26, 6, 13, 1, 36, 40, 43, 16, 48, 2],
  [34, 23, 19, 18, 27, 43, 41, 52, 31, 14, 12, 21, 51, 9, 11, 30],
  [44, 32, 38, 42, 41, 24, 11, 23, 10, 15, 46, 2, 36, 13, 45, 8],
  [32, 51, 42, 24, 3, 30, 6, 52, 39, 4, 33, 11, 31, 47, 25, 36],
  [36, 10, 50, 49, 21, 11, 5, 27, 2, 52, 35, 1, 41, 42, 33, 6],
  [8, 6, 16, 29, 3, 27, 10, 20, 41, 18, 52, 13, 30, 21, 40, 9],
  [19, 23, 9, 4, 15, 52, 13, 18, 7, 31, 42, 8, 5, 41, 21, 44],
  [34, 18, 5, 42, 32, 52, 37, 19, 44, 51, 11, 15, 13, 49, 22, 36],
  [45, 33, 9, 52, 35, 27, 17, 18, 44, 46, 20, 1, 36, 49, 4, 26],
  [5, 21, 53, 18, 8, 51, 27, 6, 16, 46, 13, 11, 9, 31, 36, 41],
  [45, 41, 5, 47, 52, 8, 35, 40, 31, 42, 30, 9, 39, 21, 38, 50],
  [4, 14, 41, 9, 24, 2, 22, 13, 33, 7, 12, 26, 49, 54, 31, 46],
  [49, 34, 14, 29, 38, 46, 37, 30, 47, 18, 32, 2, 27, 28, 13, 5],
  [44, 51, 4, 50, 41, 18, 5, 35, 28, 6, 32, 37, 2, 8, 54, 11],
  [12, 13, 41, 6, 29, 49, 50, 7, 26, 36, 21, 24, 31, 1, 20, 44],
  [48, 47, 17, 26, 1, 5, 35, 9, 28, 13, 22, 31, 7, 37, 8, 45],
  [31, 11, 53, 16, 41, 50, 39, 4, 26, 5, 47, 54, 52, 17, 6, 8],
  [26, 36, 28, 27, 10, 24, 19, 18, 44, 51, 40, 5, 31, 53, 29, 32],
  [18, 28, 24, 23, 46, 37, 35, 10, 33, 54, 51, 34, 49, 50, 4, 53],
  [21, 47, 51, 17, 44, 13, 49, 39, 38, 20, 50, 8, 31, 30, 22, 19],
  [2, 4, 33, 53, 47, 39, 48, 27, 17, 15, 42, 32, 6, 30, 10, 13],
  [5, 36, 44, 18, 49, 3, 1, 10, 54, 45, 25, 37, 7, 4, 42, 14],
  [26, 11, 49, 37, 30, 53, 19, 10, 13, 22, 1, 54, 42, 6, 43, 44],
  [38, 27, 54, 22, 17, 21, 51, 46, 30, 8, 41, 45, 49, 40, 3, 35],
  [7, 15, 22, 38, 49, 16, 53, 42, 46, 20, 30, 17, 50, 6, 21, 13],
  [50, 5, 20, 25, 19, 33, 2, 29, 31, 51, 6, 17, 11, 9, 24, 35],
  [54, 10, 43, 15, 44, 46, 12, 26, 51, 16, 1, 34, 11, 31, 40, 24],
  [47, 5, 49, 29, 52, 6, 38, 17, 30, 2, 21, 1, 12, 44, 48, 16],
  [18, 32, 13, 45, 19, 37, 41, 16, 23, 44, 9, 6, 40, 10, 4, 31],
  [26, 22, 33, 7, 18, 35, 38, 49, 47, 10, 29, 15, 21, 8, 32, 34],
  [22, 8, 34, 38, 26, 12, 47, 19, 7, 25, 29, 36, 50, 43, 20, 35],
  [7, 19, 44, 42, 50, 26, 46, 10, 39, 9, 51, 43, 16, 52, 18, 35],
  [23, 54, 14, 2, 8, 37, 4, 39, 1, 30, 43, 15, 53, 42, 21, 7],
  [28, 43, 54, 26, 36, 48, 4, 37, 21, 23, 44, 7, 30, 15, 19, 14]
];


// ---------- Verificación estricta: 16 ids, filas, columnas y esquinas únicas ----------
function verificarTablas(tablas) {
    const filasHoriz = new Set();
    const colsVert = new Set();
    const esquinas = new Set();

    for (let i = 0; i < tablas.length; i++) {
        const tabla = tablas[i];

        if (!Array.isArray(tabla) || tabla.length !== TOTAL_CELDAS) return false;
        const setIds = new Set(tabla);
        if (setIds.size !== TOTAL_CELDAS) return false;
        for (const id of tabla) {
            if (!Number.isInteger(id) || id < 1 || id > 54) return false;
        }

        // Filas horizontales
        for (let r = 0; r < TABLA_ROWS; r++) {
            const fila = tabla.slice(r * TABLA_COLS, (r + 1) * TABLA_COLS);
            const key = "H:" + fila.join("-");
            if (filasHoriz.has(key)) return false;
            filasHoriz.add(key);
        }

        // Columnas verticales
        for (let c = 0; c < TABLA_COLS; c++) {
            const col = [];
            for (let r = 0; r < TABLA_ROWS; r++) col.push(tabla[r * TABLA_COLS + c]);
            const key = "V:" + col.join("-");
            if (colsVert.has(key)) return false;
            colsVert.add(key);
        }

        // Esquinas (posiciones 0, 3, 12, 15) — normalizadas por orden ascendente
        const eq = [tabla[0], tabla[3], tabla[12], tabla[15]]
            .sort((a, b) => a - b)
            .join("-");
        if (esquinas.has(eq)) return false;
        esquinas.add(eq);
    }
    return true;
}

// ---------- Generador con LCG determinista + verificador ----------
function generarTablasValidas(cantidad = TABLAS_TOTALES, semillaInicial = 20240607) {
    let seed = semillaInicial >>> 0;

    function nextRand() {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    }

    function shuffleConSeed(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(nextRand() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    const pool = [];
    for (let i = 1; i <= 54; i++) pool.push(i);

    const filasHoriz = new Set();
    const colsVert = new Set();
    const esquinas = new Set();
    const resultado = [];

    let intentos = 0;
    const MAX_INTENTOS = 2000000;

    while (resultado.length < cantidad && intentos < MAX_INTENTOS) {
        intentos++;
        const barajado = shuffleConSeed(pool);
        const candidata = barajado.slice(0, TOTAL_CELDAS);

        let valida = true;
        const clavesFila = [];
        const clavesCol = [];

        for (let r = 0; r < TABLA_ROWS && valida; r++) {
            const fila = candidata.slice(r * TABLA_COLS, (r + 1) * TABLA_COLS);
            const key = "H:" + fila.join("-");
            if (filasHoriz.has(key)) { valida = false; break; }
            clavesFila.push(key);
        }
        if (valida) {
            for (let c = 0; c < TABLA_COLS && valida; c++) {
                const col = [];
                for (let r = 0; r < TABLA_ROWS; r++) col.push(candidata[r * TABLA_COLS + c]);
                const key = "V:" + col.join("-");
                if (colsVert.has(key)) { valida = false; break; }
                clavesCol.push(key);
            }
        }
        if (valida) {
            const eq = [candidata[0], candidata[3], candidata[12], candidata[15]]
                .sort((a, b) => a - b)
                .join("-");
            if (esquinas.has(eq)) { valida = false; }
            else {
                clavesFila.forEach(k => filasHoriz.add(k));
                clavesCol.forEach(k => colsVert.add(k));
                esquinas.add(eq);
                resultado.push(candidata);
            }
        }
    }

    console.log(`[Cartas] Generadas ${resultado.length}/${cantidad} en ${intentos} intentos`);
    return resultado;
}

// ---------- Cargar cartas: intenta fijo, si falla regenera y guarda ----------
const LS_TABLAS = "loteria_tablas_fijas_v2";
let tablas = [];

function cargarTablas() {
    try {
        const raw = localStorage.getItem(LS_TABLAS);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length === TABLAS_TOTALES && verificarTablas(parsed)) {
                console.log("[Cartas] Cargadas desde localStorage (fijas)");
                tablas = parsed;
                return;
            } else {
                console.warn("[Cartas] Set guardado inválido, regenerando...");
                localStorage.removeItem(LS_TABLAS);
            }
        }
    } catch (e) {
        console.warn("[Cartas] Error leyendo set guardado:", e);
    }

    if (Array.isArray(TABLAS_FIJAS_BASE) &&
        TABLAS_FIJAS_BASE.length === TABLAS_TOTALES &&
        verificarTablas(TABLAS_FIJAS_BASE)) {
        console.log("[Cartas] ✅ Set fijo manual válido");
        tablas = TABLAS_FIJAS_BASE.map(t => [...t]);
        try { localStorage.setItem(LS_TABLAS, JSON.stringify(tablas)); } catch (_) {}
        return;
    }

    console.warn("[Cartas] Set fijo manual con errores. Generando uno nuevo determinista...");
    tablas = generarTablasValidas(TABLAS_TOTALES);
    try { localStorage.setItem(LS_TABLAS, JSON.stringify(tablas)); } catch (_) {}
    console.log("[Cartas] ✅ Nuevo set generado y guardado (fijo de ahora en adelante)");
}

// ---------- Persistencia de marcado ----------
const LS_MARCADO = "loteria_marcado_tablas";
let marcadoPersistente = {};
let tablaSeleccionada = null;
let marcadoActual = new Set();

function cargarMarcadoPersistente() {
    try {
        const raw = localStorage.getItem(LS_MARCADO);
        marcadoPersistente = raw ? JSON.parse(raw) : {};
    } catch {
        marcadoPersistente = {};
    }
}

function guardarMarcadoPersistente() {
    try {
        localStorage.setItem(LS_MARCADO, JSON.stringify(marcadoPersistente));
    } catch (e) {}
}

// ---------- Render ----------
function renderListaTablas() {
    const grid = document.getElementById("tablesGrid");
    if (!grid) return;
    grid.innerHTML = "";

    tablas.forEach((tabla, idx) => {
        const mini = document.createElement("div");
        mini.className = "miniTabla";
        mini.onclick = () => abrirTabla(idx);

        tabla.forEach(id => {
            const cell = document.createElement("img");
            cell.src = `assets/cards/default_${id}.png`;
            cell.className = "miniCell";
            cell.onerror = () => { cell.style.background = "#334155"; };
            mini.appendChild(cell);
        });

        const label = document.createElement("div");
        label.className = "miniLabel";
        label.innerText = `#${idx + 1}`;
        mini.appendChild(label);

        grid.appendChild(mini);
    });
}

function abrirTabla(idx) {
    tablaSeleccionada = idx;
    marcadoActual = new Set(marcadoPersistente[idx] || []);

    document.getElementById("tablesList").style.display = "none";
    document.getElementById("tablePlay").style.display = "block";
    document.getElementById("tableTitle").innerText = `Carta #${idx + 1}`;

    renderTablaActual();
}

function volverAListaTablas() {
    if (tablaSeleccionada !== null) {
        marcadoPersistente[tablaSeleccionada] = [...marcadoActual];
        guardarMarcadoPersistente();
    }
    tablaSeleccionada = null;
    marcadoActual = new Set();

    document.getElementById("tablePlay").style.display = "none";
    document.getElementById("tablesList").style.display = "block";
}

function renderTablaActual() {
    const board = document.getElementById("tableBoard");
    if (!board || tablaSeleccionada === null) return;
    board.innerHTML = "";

    const tabla = tablas[tablaSeleccionada];

    tabla.forEach((id) => {
        const wrap = document.createElement("div");
        wrap.className = "tablaCell" + (marcadoActual.has(id) ? " marcada" : "");
        wrap.onclick = () => toggleMarcado(id, wrap);

        const img = document.createElement("img");
        img.src = `assets/cards/default_${id}.png`;
        img.onerror = () => { img.style.background = "#334155"; };
        wrap.appendChild(img);

        const marca = document.createElement("div");
        marca.className = "marca";
        marca.innerText = "✓";
        wrap.appendChild(marca);

        board.appendChild(wrap);
    });
}

function toggleMarcado(id, wrap) {
    if (marcadoActual.has(id)) {
        marcadoActual.delete(id);
        wrap.classList.remove("marcada");
    } else {
        marcadoActual.add(id);
        wrap.classList.add("marcada");
    }
    if (tablaSeleccionada !== null) {
        marcadoPersistente[tablaSeleccionada] = [...marcadoActual];
        guardarMarcadoPersistente();
    }
}

function reiniciarMarcado() {
    if (tablaSeleccionada === null) return;
    marcadoActual.clear();
    marcadoPersistente[tablaSeleccionada] = [];
    guardarMarcadoPersistente();
    renderTablaActual();
}

// ---------- Cambio de modo ----------
function setMode(mode) {
    const cardView = document.getElementById("cardView");
    const tablesView = document.getElementById("tablesView");

    if (mode === "card") {
        cardView.style.display = "";
        tablesView.style.display = "none";
        stopAuto();
    } else {
        stopAuto();
        cardView.style.display = "none";
        tablesView.style.display = "block";

        renderListaTablas();
        document.getElementById("tablePlay").style.display = "none";
        document.getElementById("tablesList").style.display = "block";
    }
}

// ============================================================
// ARRANQUE
// ============================================================
async function registrarSWConTimeout(ms = 10000) {
    if (!("serviceWorker" in navigator)) return null;
    try {
        const reg = await navigator.serviceWorker.register("./service-worker.js");

        const ready = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, rej) => setTimeout(() => rej(new Error("SW ready timeout")), ms))
        ]);
        console.log("[App] SW listo");
        return ready;
    } catch (e) {
        console.warn("[App] SW no quedó listo en", ms, "ms:", e.message);
        return null;
    }
}

window.addEventListener("load", async () => {
    console.log("Lotería cargada");

    cargarTablas();
    cargarMarcadoPersistente();

    setTimeout(() => {
        console.warn("[App] Timeout global, forzando ocultar barra");
        updateProgressUI(1, 1, "", true);
    }, 60000);

    try {
        await pedirPersistencia();
    } catch (e) {
        console.warn("[App] Error persistencia:", e);
    }

    await registrarSWConTimeout(10000);

    if (!debePrecachear()) {
        updateProgressUI(1, 1, "", true);
        return;
    }

    try {
        await trackProgress();
        marcarPrecacheCompleto();
    } catch (e) {
        console.error("[App] Error precarga:", e);
    } finally {
        updateProgressUI(1, 1, "", true);
    }
});
