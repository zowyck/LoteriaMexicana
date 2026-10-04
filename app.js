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
const CACHE_NAME = "loteria-v7";
const TOTAL_FILES = 6 + 108;
const APP_VERSION = "1.5.0";
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
// JUEGO
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
        currentDeck.length + " cartas restantes";

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
    const speed = select ? parseInt(select.value) : 7000;

    drawCard();
    timer = setInterval(drawCard, speed);
    playing = true;
    document.getElementById("playPauseBtn").innerText = "⏸ Pausa";
}

function stopAuto() {
    clearInterval(timer);
    playing = false;
    document.getElementById("playPauseBtn").innerText = "▶ Iniciar";
}

function toggleAuto() { playing ? stopAuto() : startAuto(); }

function restartGame() {
    stopAuto();
    shuffle();
    history.length = 0;
    updateHistory();
    document.getElementById("cardImage").src = "assets/Logo.png";
    ocultarTextosJuego();
    document.getElementById("remaining").innerText = "54 cartas restantes";
}

// ============================================================
// ARRANQUE
// ============================================================
window.addEventListener("load", async () => {
    console.log("Lotería cargada");

    // Seguro: máximo 60s visible
    setTimeout(() => {
        console.warn("[App] Timeout global, forzando ocultar barra");
        updateProgressUI(1, 1, "", true);
    }, 60000);

    try {
        await pedirPersistencia();
    } catch (e) {
        console.warn("[App] Error persistencia:", e);
    }

    if ("serviceWorker" in navigator) {
        try {
            await navigator.serviceWorker.register("./service-worker.js");
            await navigator.serviceWorker.ready;
            console.log("[App] SW listo");
        } catch (e) {
            console.error("[App] Error SW:", e);
        }
    }

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
