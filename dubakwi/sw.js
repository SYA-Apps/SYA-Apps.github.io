// 두바퀴환승 웹 — 앱 파일을 **폰에 붙들어 두는** 서비스워커 (2026-09-30 · 땀방울 sw.js 본보기)
//
// 🔴 왜: 사용자 «로딩은 아직도 느려». 원인은 파일 크기보다 **캐시가 사실상 없는 것**이었다.
//    · GitHub Pages 는 파일을 10분만 캐시하라고 한다(max-age=600)
//    · Flutter 의 서비스워커는 이제 **스스로 지워지는 빈껍데기**라 아무것도 안 붙든다
//    · 아이폰(특히 홈 화면에 추가한 앱)은 브라우저 캐시를 자주 비운다
//    → 열 때마다 엔진·앱·글꼴 약 5MB 를 다시 받았다.
//
// 어떻게:
//  1. 앱 파일(같은 사이트 · /dubakwi/ 안 · GET)은 **캐시 먼저** — 있으면 인터넷을 안 탄다
//  2. 페이지 자체(index.html · privacy.html)는 **인터넷 먼저** — 새 판을 알아채는 자리다
//  3. 판이 바뀌면 index.html 이 `sw.js?b=<새 번호>` 로 다시 등록한다 → 새 워커가 옛 캐시를 통째로 지운다
//     (번호는 배포 때 `tool/stamp_web.py` 가 main.dart.js 의 지문으로 박는다)
//  4. 첫 화면이 뜬 뒤 페이지가 «내가 받은 파일 목록» 을 보내 주면 그것만 캐시에 채운다
//     — 아이폰은 아이폰용 엔진만, PC 는 PC 용만 담긴다(둘 다 담으면 3MB 를 헛받는다)
//
// 이 앱엔 시험판 폴더가 없다. 생기면 mine() 에 제외 줄을 더한다(땀방울 preview/ 처럼).
// 🚨 서버(Supabase)·다른 사이트 요청은 건드리지 않는다.

const B = new URL(self.location.href).searchParams.get('b') || 'none';
const SCOPE = new URL(self.registration.scope).pathname; // "/dubakwi/"
// 🚨 캐시 이름에 앱 이름과 폴더를 넣는다 — 모든 소담 앱이 한 사이트라 안 넣으면 서로의 캐시를 지운다.
const PREFIX = 'dubakwi:' + SCOPE + ':';
const CACHE = PREFIX + B;
// 🔤 구글이 주는 **대체 글꼴**(이모지 · 한글 조각 · 기호). 엔진이 우리 글꼴에 없는 글자를 그릴 때 받는다.
//    이 앱도 🚲🌱🔥 같은 이모지를 쓴다.
//    주소가 내용마다 고정이라 바뀌지 않는다 → 판이 바뀌어도 지우지 않는 따로 된 캐시에 둔다.
const FONTS = 'dubakwi:gstatic';
const PAGES = /\/(index\.html|privacy\.html)?$/;
const NEVER = /\/(sw\.js|version\.json|flutter_service_worker\.js)$/;

// 🚨 skipWaiting · clients.claim 을 쓰지 않는다(2026-10-01).
//    쓰면 앱을 열어 둔 채 새 판이 깔릴 때 **새 워커가 그 자리에서 넘겨받아**, 이미 받은 main.dart.js(옛 판)와
//    나중에 받는 자료(assets/data/*.json · 새 판)가 **섞인다** — 실제로 「2신정선」(새 자료 + 옛 코드)이 폰에 떴다.
//    새 워커는 앱이 완전히 닫힐 때까지 기다렸다가 다음에 열 때 통째로 바뀐다(한 번 닫았다 열면 새 판).
self.addEventListener('install', () => {});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k); // FONTS 는 PREFIX 로 시작하지 않아 남는다
    }
  })());
});

function gstatic(url) {
  return url.hostname === 'fonts.gstatic.com';
}

function mine(url) {
  return url.origin === self.location.origin &&
    url.pathname.startsWith(SCOPE) &&
    !NEVER.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (gstatic(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(FONTS);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })());
    return;
  }
  if (!mine(url)) return;
  if (req.mode === 'navigate' || PAGES.test(url.pathname)) return; // 페이지는 늘 인터넷에서
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    // 🚨 `no-cache` — 브라우저 HTTP 캐시(Pages max-age=600)를 그대로 믿으면, 새 판의 캐시가 **옛 판 파일**로 채워져
    //    그 판 내내 옛 화면이 나온다(2026-09-30 실제로 당했다: 자전거 색을 바꿨는데 세 번 새로 열어도 옛 색).
    //    판마다 한 번씩만 서버에 묻는다(같으면 304) — 그 뒤로는 위 캐시에서 나간다.
    const res = await fetch(new Request(req, { cache: 'no-cache' }));
    if (res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
    return res;
  })());
});

// 페이지가 첫 화면을 그린 뒤 보내 주는 «받은 파일 목록» — 없는 것만 채운다.
// `no-cache` 로 받는다: 브라우저 캐시에 남은 **옛 판**을 새 캐시에 담지 않으려는 것이다(서버에 한 번 물어본다 · 같으면 304).
self.addEventListener('message', (event) => {
  const list = (event.data && event.data.warm) || [];
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const u of list) {
      try {
        const url = new URL(u);
        if (gstatic(url)) {
          const fc = await caches.open(FONTS);
          if (!(await fc.match(url.href))) {
            const r = await fetch(url.href, { mode: 'cors' });
            if (r.ok) await fc.put(url.href, r);
          }
          continue;
        }
        if (!mine(url) || PAGES.test(url.pathname)) continue;
        if (await cache.match(url.href, { ignoreSearch: true })) continue;
        const res = await fetch(url.href, { cache: 'no-cache' });
        if (res.ok && res.type === 'basic') await cache.put(url.href, res);
      } catch (_) { /* 한 파일이 실패해도 나머지는 담는다 */ }
    }
  })());
});
