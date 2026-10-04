let playing = false;
let timer = null;

const deck = [];
let currentDeck = [];

const history = [];

for (let i = 1; i <= 54; i++) {
    deck.push({
        id: i,
        image: `assets/cards/default_${i}.png`,
        sound: `assets/sound/cards/default_${i}.mp3`
    });
}

function shuffle() {

    currentDeck = [...deck];

    for (let i = currentDeck.length - 1; i > 0; i--) {

        const j = Math.floor(Math.random() * (i + 1));

        [
            currentDeck[i],
            currentDeck[j]
        ] = [
            currentDeck[j],
            currentDeck[i]
        ];
    }
}

shuffle();

function drawCard() {

    if (currentDeck.length === 0) {

        stopAuto();

        document.getElementById("cardName").innerText =
        "Juego terminado";

        return;
    }

    const card = currentDeck.shift();

    const img =
    document.getElementById("cardImage");

    img.src = card.image;

    img.onerror = () => {
        console.log("No encontró imagen:", card.image);
    };

    const audio = new Audio(card.sound);

    audio.onerror = () => {
        console.log("No encontró audio:", card.sound);
    };

    audio.play().catch(err => console.log(err));

    document.getElementById("cardName").innerText =
    "Carta " + card.id;

    document.getElementById("remaining").innerText =
    currentDeck.length + " cartas restantes";

    history.unshift(card);

    if (history.length > 5) {
        history.pop();
    }

    updateHistory();
}

function updateHistory() {

    const box =
    document.getElementById("historyList");

    if (!box) return;

    box.innerHTML = "";

    history.forEach(card => {

        const img =
        document.createElement("img");

        img.src = card.image;

        img.className = "historyCard";

        box.appendChild(img);
    });
}

function startAuto() {

    const speed =
    parseInt(
        document.getElementById("speed").value
    );

    drawCard();

    timer =
    setInterval(drawCard, speed);

    playing = true;

    document.getElementById("playPauseBtn")
    .innerText = "⏸ Pausa";
}

function stopAuto() {

    clearInterval(timer);

    playing = false;

    document.getElementById("playPauseBtn")
    .innerText = "▶ Iniciar";
}

function toggleAuto() {

    if (playing) {
        stopAuto();
    } else {
        startAuto();
    }
}

function restartGame() {

    stopAuto();

    shuffle();

    history.length = 0;

    updateHistory();

    document.getElementById("cardImage").src = "";

    document.getElementById("cardName").innerText =
    "Presiona Iniciar";

    document.getElementById("remaining").innerText =
    "54 cartas restantes";
}

window.onload = () => {

    console.log("Lotería cargada");

};