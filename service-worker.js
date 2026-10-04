const CACHE_NAME = "loteria-v4";

// Archivos base de la app
const baseFiles = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.json"
];

const cardFiles = [
    "assets/cards/default_1.png",  "assets/cards/default_1.mp3",
    "assets/cards/default_2.png",  "assets/cards/default_2.mp3",
    "assets/cards/default_3.png",  "assets/cards/default_3.mp3",
    "assets/cards/default_4.png",  "assets/cards/default_4.mp3",
    "assets/cards/default_5.png",  "assets/cards/default_5.mp3",
    "assets/cards/default_6.png",  "assets/cards/default_6.mp3",
    "assets/cards/default_7.png",  "assets/cards/default_7.mp3",
    "assets/cards/default_8.png",  "assets/cards/default_8.mp3",
    "assets/cards/default_9.png",  "assets/cards/default_9.mp3",
    "assets/cards/default_10.png", "assets/cards/default_10.mp3",
    "assets/cards/default_11.png", "assets/cards/default_11.mp3",
    "assets/cards/default_12.png", "assets/cards/default_12.mp3",
    "assets/cards/default_13.png", "assets/cards/default_13.mp3",
    "assets/cards/default_14.png", "assets/cards/default_14.mp3",
    "assets/cards/default_15.png", "assets/cards/default_15.mp3",
    "assets/cards/default_16.png", "assets/cards/default_16.mp3",
    "assets/cards/default_17.png", "assets/cards/default_17.mp3",
    "assets/cards/default_18.png", "assets/cards/default_18.mp3",
    "assets/cards/default_19.png", "assets/cards/default_19.mp3",
    "assets/cards/default_20.png", "assets/cards/default_20.mp3",
    "assets/cards/default_21.png", "assets/cards/default_21.mp3",
    "assets/cards/default_22.png", "assets/cards/default_22.mp3",
    "assets/cards/default_23.png", "assets/cards/default_23.mp3",
    "assets/cards/default_24.png", "assets/cards/default_24.mp3",
    "assets/cards/default_25.png", "assets/cards/default_25.mp3",
    "assets/cards/default_26.png", "assets/cards/default_26.mp3",
    "assets/cards/default_27.png", "assets/cards/default_27.mp3",
    "assets/cards/default_28.png", "assets/cards/default_28.mp3",
    "assets/cards/default_29.png", "assets/cards/default_29.mp3",
    "assets/cards/default_30.png", "assets/cards/default_30.mp3",
    "assets/cards/default_31.png", "assets/cards/default_31.mp3",
    "assets/cards/default_32.png", "assets/cards/default_32.mp3",
    "assets/cards/default_33.png", "assets/cards/default_33.mp3",
    "assets/cards/default_34.png", "assets/cards/default_34.mp3",
    "assets/cards/default_35.png", "assets/cards/default_35.mp3",
    "assets/cards/default_36.png", "assets/cards/default_36.mp3",
    "assets/cards/default_37.png", "assets/cards/default_37.mp3",
    "assets/cards/default_38.png", "assets/cards/default_38.mp3",
    "assets/cards/default_39.png", "assets/cards/default_39.mp3",
    "assets/cards/default_40.png", "assets/cards/default_40.mp3",
    "assets/cards/default_41.png", "assets/cards/default_41.mp3",
    "assets/cards/default_42.png", "assets/cards/default_42.mp3",
    "assets/cards/default_43.png", "assets/cards/default_43.mp3",
    "assets/cards/default_44.png", "assets/cards/default_44.mp3",
    "assets/cards/default_45.png", "assets/cards/default_45.mp3",
    "assets/cards/default_46.png", "assets/cards/default_46.mp3",
    "assets/cards/default_47.png", "assets/cards/default_47.mp3",
    "assets/cards/default_48.png", "assets/cards/default_48.mp3",
    "assets/cards/default_49.png", "assets/cards/default_49.mp3",
    "assets/cards/default_50.png", "assets/cards/default_50.mp3",
    "assets/cards/default_51.png", "assets/cards/default_51.mp3",
    "assets/cards/default_52.png", "assets/cards/default_52.mp3",
    "assets/cards/default_53.png", "assets/cards/default_53.mp3",
    "assets/cards/default_54.png", "assets/cards/default_54.mp3",
];

const files = [...baseFiles, ...cardFiles];

// INSTALL: cachea todo, pero sin romperse si algo falla
self.addEventListener("install", event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            const results = await Promise.allSettled(
                files.map(url =>
                    cache.add(url).catch(err => {
                        console.warn("[SW] Falló cachear:", url, err);
                    })
                )
            );
            const failed = results.filter(r => r.status === "rejected").length;
            console.log(`[SW] Cache listo. Fallos: ${failed}/${files.length}`);
        })
    );
});

// ACTIVATE: limpia cachés viejas y toma control
self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// FETCH: cache-first con fallback a red
self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") return;

    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;

            return fetch(event.request).then(response => {
                if (response && response.status === 200 && response.type === "basic") {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                }
                return response;
            }).catch(() => {
                if (event.request.mode === "navigate") {
                    return caches.match("./index.html");
                }
            });
        })
    );
});
