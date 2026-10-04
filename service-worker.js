const CACHE_NAME = "loteria-v6";

// Recursos base
const baseFiles = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./assets/Logo.png",
    "./manifest.json"
];

// Cards: 54 imágenes + 54 audios
const cardFiles = [];
for (let i = 1; i <= 54; i++) {
    cardFiles.push(`assets/cards/default_${i}.png`);
    cardFiles.push(`assets/cards/default_${i}.mp3`);
}

const files = [...baseFiles, ...cardFiles];

// ============================================================
// Utilidad: fetch con timeout (evita cuelgues en móvil)
// ============================================================
function fetchWithTimeout(url, ms = 8000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timeout: " + url)), ms);
        fetch(url, { cache: "no-store" })
            .then(res => {
                clearTimeout(timer);
                if (!res.ok) reject(new Error("HTTP " + res.status + ": " + url));
                else resolve(res);
            })
            .catch(err => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

// ============================================================
// INSTALL: precachea en lotes con timeout por archivo
// ============================================================
self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        let ok = 0, fail = 0;

        const BATCH = 6;
        for (let i = 0; i < files.length; i += BATCH) {
            const lote = files.slice(i, i + BATCH);
            const results = await Promise.allSettled(
                lote.map(async url => {
                    const res = await fetchWithTimeout(url, 8000);
                    await cache.put(url, res);
                    return url;
                })
            );
            for (const r of results) {
                if (r.status === "fulfilled") ok++;
                else {
                    fail++;
                    console.warn("[SW] Falló:", r.reason?.message || r.reason);
                }
            }
        }

        console.log(`[SW] Precarga: ${ok} ok, ${fail} fallos de ${files.length}`);

        // Si falló más del 20%, aborta (mantiene SW viejo)
        if (fail > files.length * 0.2) {
            throw new Error(`[SW] Abortado: ${fail} fallos`);
        }

        await self.skipWaiting();
    })());
});

// ============================================================
// ACTIVATE: limpia cachés viejas y toma control
// ============================================================
self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        );
        await self.clients.claim();
        console.log("[SW] Activo y en control");
    })());
});

// ============================================================
// FETCH: cache-first con fallback a red
// ============================================================
self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") return;

    // Soporte para Range (audios en Chrome PC)
    if (event.request.headers.get("range")) {
        event.respondWith(
            caches.match(event.request.url).then(c => c || fetch(event.request))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(res => {
                if (res && res.status === 200 && res.type === "basic") {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                }
                return res;
            }).catch(() => {
                if (event.request.mode === "navigate") {
                    return caches.match("./index.html");
                }
            });
        })
    );
});
