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
  [1, 28, 24, 38, 35, 42, 14, 40, 31, 33, 39, 2, 46, 27, 51, 11],
  [2, 8, 12, 3, 18, 19, 6, 34, 13, 22, 53, 10, 33, 35, 45, 4],
  [22, 50, 46, 3, 9, 45, 20, 38, 19, 11, 47, 17, 49, 39, 2, 52],
  [23, 43, 37, 6, 39, 44, 31, 22, 32, 8, 53, 35, 29, 50, 27, 30],
  [5, 30, 25, 45, 3, 29, 26, 51, 42, 11, 32, 27, 17, 10, 2, 40],
  [19, 23, 22, 20, 14, 9, 25, 54, 7, 51, 33, 12, 39, 46, 32, 6],
  [52, 18, 10, 34, 15, 45, 12, 54, 51, 43, 28, 5, 33, 1, 4, 22],
  [51, 52, 31, 28, 32, 53, 17, 46, 23, 29, 5, 39, 49, 4, 25, 10],
  [47, 21, 30, 48, 53, 42, 16, 11, 36, 45, 34, 33, 3, 9, 25, 43],
  [52, 35, 9, 20, 1, 12, 18, 10, 16, 23, 6, 53, 38, 42, 8, 29],
  [2, 21, 6, 16, 40, 11, 4, 14, 28, 5, 50, 30, 38, 13, 29, 24],
  [27, 16, 6, 20, 21, 14, 33, 35, 52, 44, 19, 45, 53, 51, 25, 36],
  [45, 8, 52, 21, 46, 37, 42, 20, 18, 35, 25, 49, 41, 51, 16, 13],
  [11, 29, 7, 28, 46, 6, 54, 42, 49, 8, 16, 31, 34, 53, 19, 47],
  [38, 28, 13, 22, 4, 29, 52, 44, 32, 47, 46, 17, 16, 43, 48, 21],
  [9, 42, 44, 39, 37, 50, 2, 51, 53, 8, 29, 6, 28, 3, 45, 46],
  [4, 38, 5, 21, 47, 15, 8, 22, 31, 6, 11, 2, 12, 30, 27, 20],
  [43, 3, 30, 23, 39, 12, 42, 2, 46, 11, 13, 48, 24, 51, 54, 52],
  [30, 37, 11, 6, 49, 8, 32, 29, 54, 15, 25, 5, 43, 20, 50, 22],
  [10, 5, 23, 9, 52, 51, 15, 45, 17, 39, 12, 31, 27, 32, 29, 16],
  [8, 19, 38, 48, 34, 37, 16, 50, 17, 45, 3, 6, 18, 49, 12, 7],
  [18, 13, 36, 42, 25, 10, 51, 43, 12, 11, 5, 27, 45, 31, 53, 4],
  [35, 49, 50, 51, 27, 23, 45, 39, 37, 54, 12, 19, 41, 53, 24, 22],
  [6, 39, 5, 36, 12, 26, 53, 18, 45, 20, 28, 51, 47, 30, 24, 32],
  [23, 37, 34, 26, 42, 43, 2, 31, 45, 16, 21, 40, 5, 52, 29, 41],
  [52, 5, 44, 35, 19, 11, 51, 45, 24, 14, 39, 6, 48, 12, 15, 33],
  [7, 48, 34, 30, 42, 26, 22, 20, 38, 41, 31, 32, 33, 37, 54, 36],
  [12, 33, 53, 15, 22, 7, 46, 9, 43, 1, 32, 38, 4, 41, 45, 26],
  [19, 38, 23, 11, 42, 52, 4, 14, 24, 27, 10, 36, 47, 41, 37, 15],
  [36, 37, 43, 13, 26, 5, 7, 18, 15, 44, 14, 3, 48, 27, 1, 54],
  [20, 1, 34, 13, 8, 19, 5, 43, 49, 39, 2, 44, 41, 47, 6, 40],
  [23, 29, 50, 25, 6, 19, 48, 34, 42, 31, 52, 26, 40, 16, 12, 27],
  [18, 22, 46, 47, 53, 33, 4, 25, 14, 28, 16, 2, 36, 52, 44, 32],
  [47, 44, 53, 11, 42, 18, 33, 41, 51, 10, 32, 19, 50, 13, 46, 1],
  [26, 45, 14, 11, 23, 12, 25, 21, 35, 46, 3, 5, 40, 42, 43, 32],
  [1, 2, 52, 20, 23, 48, 49, 12, 39, 54, 33, 9, 40, 18, 11, 24],
  [53, 42, 36, 24, 41, 33, 13, 4, 6, 52, 1, 28, 43, 49, 21, 3],
  [27, 43, 3, 12, 44, 40, 22, 18, 38, 46, 20, 48, 5, 51, 32, 47],
  [18, 16, 33, 36, 4, 3, 52, 26, 7, 9, 39, 22, 11, 5, 21, 45],
  [16, 42, 3, 20, 26, 19, 18, 12, 33, 31, 7, 44, 52, 23, 37, 38],
  [10, 41, 53, 12, 40, 6, 20, 1, 47, 42, 26, 7, 43, 8, 5, 50],
  [21, 14, 3, 29, 45, 52, 47, 13, 9, 10, 40, 37, 16, 6, 1, 51],
  [49, 24, 25, 53, 18, 46, 52, 6, 26, 4, 14, 48, 44, 1, 28, 38],
  [13, 17, 23, 2, 34, 22, 37, 16, 49, 10, 21, 15, 45, 50, 51, 54],
  [21, 23, 25, 46, 54, 45, 27, 33, 2, 28, 53, 32, 11, 26, 16, 43],
  [14, 23, 50, 53, 12, 31, 40, 33, 36, 11, 38, 30, 39, 25, 13, 54],
  [49, 19, 27, 50, 25, 51, 35, 16, 46, 18, 10, 30, 32, 11, 43, 1],
  [36, 6, 24, 34, 19, 52, 47, 40, 7, 16, 30, 25, 33, 50, 29, 28],
  [16, 11, 36, 46, 28, 26, 51, 31, 53, 35, 45, 32, 48, 29, 4, 44],
  [10, 51, 53, 1, 7, 30, 17, 13, 5, 22, 26, 11, 39, 3, 44, 2]
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