let playing = false;
let timer = null;
let currentAudio = null;

const deck = [];
let currentDeck = [];
const history = [];

// 54 cartas
for (let i = 1; i <= 54; i++) {
    deck.push({
        id: i,
        image: `assets/cards/default_${i}.png`,
        sound: `assets/cards/default_${i}.mp3`
    });
}

// ============================================================
// DESBLOQUEO DE AUDIO (necesario en PC)
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
// BARRA DE PROGRESO DE DESCARGA
// ============================================================
const TOTAL_FILES = 5 + 108; // base + 54 png + 54 mp3

function updateProgressUI(done, total, text) {
    const bar = document.getElementById("loadBar");
    const wrap = document.getElementById("loadProgress");
    const label = document.getElementById("loadText");

    if (!bar || !wrap) return;

    const pct = Math.min(100, Math.round((done / total) * 100));
    bar.style.width = pct + "%";
    if (label) label.innerText = text || `${pct}% (${done}/${total})`;

    if (done >= total) {
        setTimeout(() => { wrap.style.display = "none"; }, 500);
    } else {
        wrap.style.display = "block";
    }
}

async function trackProgress() {
    // 1. Primero medimos lo que ya está en caché
    if (!("caches" in window)) return;

    const cache = await caches.open("loteria-v5");
    let cached = (await cache.keys()).length;
    updateProgressUI(cached, TOTAL_FILES);

    // 2. Descarga forzada en cliente con progreso
    const urls = [
        "./", "./index.html", "./style.css", "./app.js", "./manifest.json",
        ...deck.flatMap(c => [c.image, c.sound])
    ];

    let done = cached;
    let pending = urls.filter((_, i) => i >= cached); // aproximación

    // Descarga por lotes para no saturar y actualizar progreso
    const BATCH = 8;
    for (let i = 0; i < urls.length; i += BATCH) {
        const lote = urls.slice(i, i + BATCH);
        await Promise.allSettled(
            lote.map(url => fetch(url, { cache: "force-cache" }).catch(() => {}))
        );
        done = Math.min(urls.length, i + BATCH);
        updateProgressUI(done, TOTAL_FILES);
    }

    updateProgressUI(TOTAL_FILES, TOTAL_FILES, "✅ Listo para usar offline");
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
        document.getElementById("cardName").innerText = "Juego terminado";
        return;
    }

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
            console.warn("[Audio] Haz clic para activar sonido");
        }
    });

    document.getElementById("cardName").innerText = "Carta " + card.id;
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
    const speed = parseInt(document.getElementById("speed").value);
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
    document.getElementById("cardImage").src = "";
    document.getElementById("cardName").innerText = "Presiona Iniciar";
    document.getElementById("remaining").innerText = "54 cartas restantes";
}

// ============================================================
// ARRANQUE
// ============================================================
window.addEventListener("load", async () => {
    console.log("Lotería cargada");

    if ("serviceWorker" in navigator) {
        try {
            await navigator.serviceWorker.register("./service-worker.js");
            console.log("[App] SW registrado");
        } catch (e) {
            console.error("[App] Error SW:", e);
        }
    }

    // Arranca la descarga con progreso
    trackProgress();
});
