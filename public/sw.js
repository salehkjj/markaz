const ROOT='/markaz/';
const CACHE='markaz-shell-v8';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([ROOT+'offline.html',ROOT+'icon-192.png',ROOT+'icon-512.png'])).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('markaz-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate'&&new URL(event.request.url).pathname.startsWith(ROOT)){event.respondWith(fetch(event.request).catch(()=>caches.match(ROOT+'offline.html')));}});
