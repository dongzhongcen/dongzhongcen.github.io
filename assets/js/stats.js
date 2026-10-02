/* 阅读量 + 点赞（按设备去重）。后端：Cloudflare Worker + D1（见 blog-stats 项目）。
   data-api 为空时整个脚本不做任何事。 */
(function () {
  var s = document.currentScript, API = s && s.getAttribute('data-api');
  var post = s && s.getAttribute('data-post');
  if (!API || !post) return;
  API = API.replace(/\/$/, '');
  var KEY = 'blogDeviceId', dev;
  try {
    dev = localStorage.getItem(KEY);
    if (!dev) {
      dev = (crypto.randomUUID ? crypto.randomUUID() :
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
        }));
      localStorage.setItem(KEY, dev);
    }
  } catch (e) { return; }

  function req(path, body) {
    return fetch(API + path, body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    } : undefined).then(function (r) { return r.json(); });
  }

  function ready(fn) { document.readyState !== 'loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }

  ready(function () {
    var meta = document.querySelector('header .post-meta') || document.querySelector('.post-meta');
    var views = document.createElement('span');
    views.className = 'stats-views';
    views.innerHTML = '<i class="far fa-eye fa-fw me-1"></i><em>…</em> 次阅读';
    var line = meta && (meta.querySelector('.readtime') || meta.lastElementChild);
    if (line && line.parentNode) line.parentNode.appendChild(views);

    var content = document.querySelector('article .content') || document.querySelector('.content');
    var box = document.createElement('div');
    box.className = 'stats-like-wrap';
    box.innerHTML = '<button type="button" class="stats-like" aria-pressed="false" title="点个赞">' +
      '<i class="fas fa-heart"></i><span class="stats-like-text">喜欢</span><span class="stats-like-num">0</span></button>';
    if (content) content.parentNode.insertBefore(box, content.nextSibling);
    var btn = box.querySelector('button'), num = box.querySelector('.stats-like-num');

    function render(d) {
      if (!d || typeof d.views !== 'number') return;
      views.querySelector('em').textContent = d.views;
      num.textContent = d.likes;
      btn.classList.toggle('liked', !!d.liked);
      btn.setAttribute('aria-pressed', d.liked ? 'true' : 'false');
    }

    req('/view', { post: post, device: dev }).then(render).catch(function () {
      views.style.display = 'none'; box.style.display = 'none';
    });

    var busy = false;
    btn.addEventListener('click', function () {
      if (busy) return; busy = true;
      var like = !btn.classList.contains('liked');
      btn.classList.toggle('liked', like);
      num.textContent = Math.max(0, (+num.textContent || 0) + (like ? 1 : -1));
      if (like) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
      req('/like', { post: post, device: dev, like: like }).then(render)
        .catch(function () {}).then(function () { busy = false; });
    });
  });
})();
