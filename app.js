let playing = false;
let timer = null;
let currentAudio = null;   // 🔑 mantiene referencia viva al audio

const deck = [];
let currentDeck = [];
const history = [];

// ============================================================
// ÚNICA FUENTE DE VERDAD: las 54 cartas
// ============================================================
for (let i = 1; i <= 54; i++) {
    deck.push({
        id: i,
        image: `assets/cards/default_${i}.png`,
        sound: `assets/cards/default_${i}.mp3`   // ✅ misma ruta que el SW
    });
}

// ============================================================
// DESBLOQUEO DE AUDIO (obligatorio en Chrome/Edge/Safari PC)
// ============================================================
let audioUnlocked = false;

function unlockAudio() {
    if (audioUnlocked) return;

    // Audio silencioso de 1 muestra para desbloquear el contexto
    const a = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
    a.volume = 0;
    a.play().then(() => {
        audioUnlocked = true;
        console.log("[App] Audio desbloqueado");
    }).catch(err => {
        // Puede fallar la primera vez si el navegador aún no considera
        // la interacción como válida; se reintenta en el siguiente evento
    });
}

["click", "touchstart", "keydown", "pointerdown"].forEach(ev =>
    document.addEventListener(ev, unlockAudio)
);

// ============================================================
// PRECARGA FORZADA (usa el array deck, sin escaneo)
// ============================================================
function preloadCards() {
    if (!("serviceWorker" in navigator)) {
        console.warn("[App] Sin Service Worker, precarga omitida");
        return;
    }

    navigator.serviceWorker.ready.then(reg => {
        if (!reg.active) return;

        const urls = deck.flatMap(c => [c.image, c.sound]);
        reg.active.postMessage({ type: "PRECACHE", urls });
        console.log(`[App] Precarga enviada: ${urls.length} archivos`);
    });

    // Fuerza descarga en cliente también (por si el SW tarda)
    deck.forEach(c => {
        const img = new Image();
        img.src = c.image;
        fetch(c.sound, { cache: "force-cache" }).catch(() => {});
    });
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

    // --- Imagen ---
    const img = document.getElementById("cardImage");
    img.src = card.image;
    img.onerror = () => console.log("No encontró imagen:", card.image);

    // --- Audio: detén el anterior antes de sonar el nuevo ---
    if (currentAudio) {
        try {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        } catch (_) {}
        currentAudio = null;
    }

    currentAudio = new Audio(card.sound);
    currentAudio.preload = "auto";
    currentAudio.onerror = () => console.log("No encontró audio:", card.sound);

    const playPromise = currentAudio.play();

    if (playPromise !== undefined) {
        playPromise.catch(err => {
            // Si está bloqueado, intenta desbloquear y reintentar una vez
            if (err.name === "NotAllowedError") {
                unlockAudio();
                console.warn("[Audio] Bloqueado, haz clic en la página para activar sonido");
            } else {
                console.log("[Audio] Error:", err);
            }
        });
    }

    // --- UI ---
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

function toggleAuto() {
    playing ? stopAuto() : startAuto();
}

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
window.addEventListener("load", () => {
    console.log("Lotería cargada");

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(console.error);
    }

    preloadCards();
});
