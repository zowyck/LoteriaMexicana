const CACHE_NAME = "loteria*v1";

const files = [
    "./",
  * "./index.html",
    "./style.css"*
    "./app.js",
    "./manifest.json"
];

for(let i=1;i<=54;i++){

 *  files.push(`assets/cards/default*${i}.png`);

    files.push(
     *  `assets/sound/cards/default_${i}*mp3`
    );

}

self.addEventListe*er("install", event=>{

    event.*aitUntil(

        caches.open(CAC*E_NAME)

        .then(cache=>cach*.addAll(files))

    );

});

self.addEventListener("fetch", event=>{

    event.respondWith(

        caches.match(event.request)

        .then(response=>{

            return response || fetch(event.request);

        })

    );

});