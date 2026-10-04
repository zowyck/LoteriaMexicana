const CACHE_NAME = "loteria-v5";

// Recursos base
const baseFiles = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
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
// INSTALL: precachea todo. Si falla mucho, aborta.
// ============================================================
self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        let ok = 0, fail = 0;

        for (const url of files) {
            try {
                await cache.add(url);
                ok++;
            } catch (err) {
                fail++;
                console.warn("[SW] Falló:", url);
            }
        }

        console.log(`[SW] Precarga: ${ok} ok, ${fail} fallos de ${files.length}`);

        // Si falló más del 20%, no reemplaza el SW viejo
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

// ============================================================
// MENSAJE: responde al cliente sobre el estado del caché
// ============================================================
self.addEventListener("message", event => {
    if (event.data?.type === "CHECK_CACHE") {
        event.waitUntil((async () => {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.keys();
            event.source.postMessage({
                type: "CACHE_STATUS",
                total: files.length,
                cached: cached.length,
                complete: cached.length >= files.length
            });
        })());
    }
});
