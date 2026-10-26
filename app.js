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
const TABLAS_TOTALES = 50;
const TOTAL_CELDAS = TABLA_COLS * TABLA_ROWS; // 16

// ---------- Set FIJO base 4x4 (sin filas, columnas ni esquinas repetidas) ----------
const TABLAS_FIJAS_BASE = [
  [1, 15, 17, 40, 5, 21, 47, 3, 39, 31, 32, 24, 48, 35, 13, 18],
  [8, 9, 25, 33, 5, 26, 40, 37, 48, 15, 31, 32, 27, 10, 41, 20],
  [16, 25, 12, 28, 19, 3, 7, 47, 1, 37, 46, 54, 30, 23, 2, 9],
  [5, 42, 3, 22, 39, 52, 54, 11, 20, 14, 26, 12, 49, 51, 50, 33],
  [32, 8, 4, 9, 49, 21, 54, 33, 6, 42, 1, 23, 22, 12, 2, 30],
  [11, 44, 45, 35, 16, 22, 3, 15, 48, 34, 21, 42, 31, 41, 6, 20],
  [25, 37, 31, 14, 26, 24, 39, 21, 44, 16, 19, 32, 47, 23, 50, 15],
  [44, 46, 16, 23, 6, 38, 15, 35, 43, 10, 21, 17, 20, 7, 19, 54],
  [47, 16, 1, 22, 36, 21, 13, 44, 20, 33, 24, 37, 40, 18, 23, 52],
  [53, 22, 54, 38, 23, 19, 45, 11, 39, 7, 16, 51, 36, 35, 52, 34],
  [3, 52, 41, 39, 45, 15, 38, 18, 54, 36, 11, 17, 28, 34, 47, 24],
  [7, 34, 47, 36, 44, 38, 42, 9, 18, 46, 41, 24, 53, 14, 28, 39],
  [10, 38, 46, 52, 27, 53, 14, 40, 1, 8, 6, 24, 16, 5, 7, 32],
  [18, 10, 19, 11, 54, 44, 50, 15, 32, 24, 40, 9, 31, 51, 28, 37],
  [16, 7, 49, 21, 33, 9, 51, 52, 39, 34, 41, 5, 20, 50, 42, 44],
  [54, 1, 34, 9, 37, 25, 27, 31, 14, 4, 24, 8, 38, 53, 32, 11],
  [6, 1, 4, 34, 40, 50, 25, 43, 47, 22, 24, 9, 28, 53, 12, 11],
  [44, 39, 12, 33, 25, 14, 23, 1, 31, 3, 38, 43, 47, 51, 21, 35],
  [9, 41, 13, 4, 31, 45, 25, 36, 38, 53, 20, 39, 49, 29, 42, 5],
  [2, 13, 23, 1, 29, 8, 18, 3, 28, 19, 34, 37, 6, 46, 41, 7],
  [43, 22, 50, 33, 17, 45, 36, 46, 30, 51, 11, 38, 20, 21, 24, 53],
  [26, 28, 27, 8, 12, 6, 43, 38, 24, 51, 36, 41, 31, 47, 15, 11],
  [21, 31, 8, 1, 50, 5, 3, 28, 41, 52, 38, 2, 36, 42, 49, 51],
  [43, 46, 12, 45, 3, 53, 38, 20, 11, 25, 41, 39, 15, 4, 21, 26],
  [35, 5, 53, 41, 22, 54, 25, 37, 14, 7, 11, 30, 52, 1, 32, 33],
  [9, 29, 14, 30, 48, 6, 10, 34, 38, 12, 46, 41, 53, 2, 3, 27],
  [26, 14, 51, 33, 49, 4, 45, 53, 2, 48, 39, 11, 9, 36, 43, 16],
  [54, 36, 22, 1, 24, 37, 14, 45, 26, 3, 33, 12, 34, 21, 6, 40],
  [31, 20, 26, 15, 48, 28, 46, 51, 16, 35, 50, 54, 37, 40, 4, 7],
  [29, 34, 51, 6, 33, 44, 43, 31, 18, 15, 46, 40, 21, 8, 42, 7],
  [31, 14, 6, 3, 38, 48, 53, 33, 47, 11, 41, 50, 10, 44, 51, 26],
  [9, 34, 14, 41, 38, 27, 11, 7, 37, 25, 46, 31, 44, 40, 22, 49],
  [5, 35, 30, 38, 8, 12, 33, 49, 11, 7, 40, 45, 9, 24, 47, 32],
  [21, 50, 54, 41, 45, 8, 12, 6, 38, 37, 26, 1, 51, 7, 9, 30],
  [52, 44, 37, 32, 48, 47, 38, 19, 21, 8, 27, 45, 35, 9, 7, 34],
  [43, 4, 49, 35, 34, 47, 27, 19, 7, 1, 6, 9, 36, 31, 45, 40],
  [4, 49, 29, 6, 24, 27, 48, 8, 46, 39, 45, 16, 2, 10, 26, 9],
  [48, 39, 41, 1, 25, 52, 21, 30, 47, 13, 15, 4, 6, 31, 24, 51],
  [51, 22, 4, 41, 47, 17, 29, 19, 36, 10, 46, 16, 24, 40, 27, 13],
  [1, 36, 16, 6, 13, 12, 14, 24, 34, 48, 38, 35, 23, 30, 50, 22],
  [22, 43, 7, 15, 46, 33, 17, 11, 27, 45, 28, 18, 13, 4, 19, 39],
  [54, 5, 2, 47, 9, 11, 38, 27, 29, 50, 7, 8, 46, 53, 35, 44],
  [9, 1, 28, 15, 5, 51, 10, 45, 7, 46, 6, 26, 48, 12, 19, 52],
  [22, 24, 15, 52, 1, 9, 51, 40, 17, 25, 26, 12, 42, 19, 35, 34],
  [45, 36, 50, 32, 38, 30, 37, 23, 1, 7, 19, 26, 4, 31, 27, 20],
  [18, 7, 33, 12, 41, 37, 47, 27, 15, 30, 36, 21, 6, 45, 19, 40],
  [48, 10, 23, 38, 7, 52, 14, 5, 19, 42, 35, 27, 33, 41, 34, 18],
  [1, 4, 16, 47, 8, 27, 2, 53, 41, 51, 18, 29, 36, 44, 52, 38],
  [40, 54, 19, 13, 36, 11, 37, 28, 34, 7, 1, 46, 2, 29, 43, 42],
  [27, 19, 37, 20, 34, 14, 7, 52, 15, 38, 33, 22, 8, 5, 1, 12]
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
