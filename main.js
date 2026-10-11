// Injected by TizenBrew into https://slideshow.roiest.nu/api/server/ping, so every /api call below is same-origin and the
// internal reverse proxy adds the Immich key. ES5 only: the TV (Tizen 4.0) runs an
// old Chromium without module scripts. The slideshow logic follows SamGal by Marco Dondero (MIT), github.com/emdioh/samgal.
(function () {
  var ALBUM_ID = '2df2d381-ff58-424a-8e60-cd95eaab7835';
  var SECONDS = 12;
  var KEYS = { LEFT: 37, RIGHT: 39, OK: 13, BACK: 10009, PLAY: 415, PAUSE: 19, STOP: 413 };

  document.documentElement.innerHTML =
    '<head><meta charset="utf-8"><style>' +
    'html,body{margin:0;height:100%;background:#000;overflow:hidden;cursor:none}' +
    '.s{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity 1.5s}' +
    '.s.on{opacity:1}' +
    '#c{position:absolute;right:40px;bottom:30px;color:#fff;font:28px sans-serif;text-shadow:0 0 6px #000;opacity:.8}' +
    '#m{position:absolute;left:40px;top:30px;color:#f88;font:24px sans-serif}' +
    '</style></head><body><img id="a" class="s"><img id="b" class="s"><div id="c"></div><div id="m"></div></body>';

  var front = document.getElementById('a'), back = document.getElementById('b');
  var caption = document.getElementById('c'), msg = document.getElementById('m');
  var photos = [], index = -1, timer = null, paused = false;

  function api(path) {
    return fetch('/api' + path).then(function (r) {
      if (!r.ok) throw new Error('Immich ' + r.status + ' on ' + path);
      return r;
    });
  }

  // Immich 3.3 returns an album's assets only through the timeline: a list of month buckets, then one column-wise bucket each.
  function images(b) {
    var out = [];
    for (var i = 0; i < b.id.length; i++) {
      if (b.isImage[i] && !b.isTrashed[i]) out.push({ id: b.id[i], caption: (b.fileCreatedAt[i] || '').slice(0, 10) });
    }
    return out;
  }

  function fetchBatch() {
    var q = '?albumId=' + ALBUM_ID;
    return api('/timeline/buckets' + q).then(function (r) { return r.json(); }).then(function (buckets) {
      return Promise.all(buckets.map(function (k) {
        return api('/timeline/bucket' + q + '&timeBucket=' + encodeURIComponent(k.timeBucket)).then(function (r) { return r.json(); });
      }));
    }).then(function (all) {
      var list = [];
      all.forEach(function (b) { list = list.concat(images(b)); });
      return shuffle(list);
    });
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function stop() { clearTimeout(timer); timer = null; }
  function schedule() { stop(); if (!paused) timer = setTimeout(function () { step(1); }, SECONDS * 1000); }
  function retry(dir) { stop(); timer = setTimeout(function () { step(dir); }, 5000); }

  function step(dir) {
    stop();
    if (dir > 0 && index + 1 >= photos.length) {
      return fetchBatch().then(function (list) {
        if (!list.length) throw new Error('no photos');
        photos = list; index = -1; msg.textContent = ''; step(1);
      }).catch(function (e) { msg.textContent = e.message; retry(dir); });
    }
    index = Math.max(0, index + dir);
    var photo = photos[index];
    api('/assets/' + photo.id + '/thumbnail?size=preview').then(function (r) { return r.blob(); }).then(function (blob) {
      var old = back.src;
      back.onload = function () {
        back.className = 's on'; front.className = 's';
        var t = front; front = back; back = t;
        caption.textContent = photo.caption;
        if (old.indexOf('blob:') === 0) setTimeout(function () { URL.revokeObjectURL(old); }, 2000);
        msg.textContent = '';
        schedule();
      };
      back.onerror = function () { step(dir); };
      back.src = URL.createObjectURL(blob);
    }).catch(function (e) { msg.textContent = e.message; retry(dir); });
  }

  function exit() {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) { window.close(); }
  }

  document.addEventListener('keydown', function (e) {
    switch (e.keyCode) {
      case KEYS.RIGHT: step(1); break;
      case KEYS.LEFT: step(-1); break;
      case KEYS.OK: paused = !paused; paused ? stop() : schedule(); msg.textContent = paused ? 'pause' : ''; break;
      case KEYS.PLAY: paused = false; msg.textContent = ''; schedule(); break;
      case KEYS.PAUSE: paused = true; msg.textContent = 'pause'; stop(); break;
      case KEYS.BACK: case KEYS.STOP: exit(); break;
    }
  });

  try { webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF); } catch (e) { /* not available in an injected page */ }

  step(1);
})();
