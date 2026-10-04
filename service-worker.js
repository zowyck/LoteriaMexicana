const CACHE_NAME = "loteria-v2"; // Sube la versión aquí

const files = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.json"
];

for(let i = 1; i <= 54; i++){
    files.push(`assets/cards/default_${i}.png`);
    files.push(`assets/sound/cards/default_${i}.mp3`);
}

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => cache.addAll(files))
    );
});

// ¡Tip extra! Agrega el evento 'activate' para borrar cachés viejos automáticamente
self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
});

self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request)
        .then(response => {
            return response || fetch(event.request);
        })
    );
});
