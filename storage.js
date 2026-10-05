/* تخزين دائم + نسخ احتياطي تلقائي لـ localStorage داخل IndexedDB */
(function () {
  'use strict';
  var DB_NAME = 'mosaed_ls_backup_v1', STORE = 'kv', META = '__ls_backup_meta__';
  var ls;
  try { ls = window.localStorage; ls.length; } catch (e) { return; }

  // 1) طلب التخزين الدائم
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then(function (p) { if (!p) return navigator.storage.persist(); }).catch(function () {});
    }
  } catch (e) {}

  function open() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function snapshot() {
    var o = {};
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); o[k] = ls.getItem(k); }
    return o;
  }
  function backup() {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ time: Date.now(), data: snapshot() }, META);
        tx.oncomplete = function () { db.close(); res(); };
        tx.onerror = function () { db.close(); rej(tx.error); };
      });
    });
  }
  function read() {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var q = db.transaction(STORE).objectStore(STORE).get(META);
        q.onsuccess = function () { db.close(); res(q.result || null); };
        q.onerror = function () { db.close(); rej(q.error); };
      });
    });
  }

  // 2) الاستعادة إن كان localStorage فارغًا/ممسوحًا والنسخة موجودة
  var restored = false;
  read().then(function (b) {
    if (!b || !b.data) return;
    var keys = Object.keys(b.data), missing = 0;
    keys.forEach(function (k) { if (ls.getItem(k) === null) missing++; });
    if (!missing) return;
    keys.forEach(function (k) { if (ls.getItem(k) === null) { try { ls.setItem(k, b.data[k]); } catch (e) {} } });
    restored = true;
    if (!sessionStorage.getItem('__ls_restored__')) {
      sessionStorage.setItem('__ls_restored__', '1');
      location.reload(); // لتقرأ الصفحة البيانات المستعادة
    }
  }).catch(function () {});

  // 3) نسخ تلقائي عند التغيير (debounce) وعند الإخفاء/الإغلاق
  var t = null;
  function schedule() { clearTimeout(t); t = setTimeout(function () { backup().catch(function () {}); }, 1500); }
  try {
    var P = Storage.prototype, set = P.setItem, rem = P.removeItem, clr = P.clear;
    P.setItem = function () { var r = set.apply(this, arguments); if (this === ls) schedule(); return r; };
    P.removeItem = function () { var r = rem.apply(this, arguments); if (this === ls) { clearTimeout(t); backup().catch(function () {}); } return r; };
    P.clear = function () { var r = clr.apply(this, arguments); if (this === ls) { clearTimeout(t); backup().catch(function () {}); } return r; };
  } catch (e) {}
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') backup().catch(function () {}); });
  window.addEventListener('pagehide', function () { backup().catch(function () {}); });
  window.addEventListener('load', function () { setTimeout(function () { if (ls.length) backup().catch(function () {}); }, 3000); });

  window.mosaedStorage = { backup: backup, read: read };
})();
