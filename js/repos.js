(function () {
  var box = document.getElementById('repos');
  if (!box) return;
  var user = box.dataset.user;
  var limit = parseInt(box.dataset.limit || '0', 10);
  function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  fetch('https://api.github.com/users/' + user + '/repos?per_page=100&sort=updated')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (repos) {
      repos = repos.filter(function (r) { return !r.fork && r.name !== user + '.github.io'; });
      if (limit) repos = repos.slice(0, limit);
      if (!repos.length) { box.innerHTML = '<p class="text-muted">还没有公开项目。</p>'; return; }
      box.innerHTML = repos.map(function (r) {
        return '<a class="repo" href="' + r.html_url + '">' +
          '<h3>' + esc(r.name) + '</h3>' +
          '<p>' + (esc(r.description) || '<span class="text-muted">暂无描述</span>') + '</p>' +
          '<div class="repo-meta">' + (r.language ? '<span>' + esc(r.language) + '</span>' : '') +
          '<span>★ ' + r.stargazers_count + '</span>' +
          '<span>更新于 ' + r.updated_at.slice(0, 10) + '</span></div></a>';
      }).join('');
    })
    .catch(function () {
      box.innerHTML = '<p class="text-muted">暂时加载不了项目列表，可以直接去 <a href="https://github.com/' + user + '?tab=repositories">GitHub</a> 查看。</p>';
    });
})();
