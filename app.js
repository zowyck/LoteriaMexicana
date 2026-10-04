let playing = false;
let timer = null;

const deck = [];
let currentDeck = [];
const history = [];

// 🔹 ÚNICA FUENTE DE VERDAD: las 54 cartas
for (let i = 1; i <= 54; i++) {
    deck.push({
        id: i,
        image: `assets/cards/default_${i}.png`,
        sound: `assets/cards/default_${i}.mp3`   // ✅ sin "sound/"
    });
}

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

        // Lista explícita desde deck: imagen + sonido
        const urls = deck.flatMap(c => [c.image, c.sound]);

        reg.active.postMessage({ type: "PRECACHE", urls });
        console.log(`[App] Precarga enviada: ${urls.length} archivos`);
    });

    // Además, fuerza la descarga en el cliente para que el navegador
    // las tenga también en su caché HTTP (por si el SW tarda)
    deck.forEach(c => {
        const img = new Image();
        img.src = c.image;

        // Los audios no se pueden "descargar" sin reproducirlos,
        // pero un fetch() sí los mete al caché del navegador
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

    const img = document.getElementById("cardImage");
    img.src = card.image;
    img.onerror = () => console.log("No encontró imagen:", card.image);

    const audio = new Audio(card.sound);
    audio.onerror = () => console.log("No encontró audio:", card.sound);
    audio.play().catch(err => console.log(err));

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

    // Registra SW (si no lo haces ya en index.html)
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(console.error);
    }

    // Fuerza la precarga de los 108 archivos
    preloadCards();
});
