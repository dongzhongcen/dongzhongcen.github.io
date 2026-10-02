/* 写日记页：生成预填好模板的 GitHub 新建文件链接 */
(function (root) {
  'use strict';

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* 北京时间（Asia/Shanghai 全年 UTC+8，没有夏令时） */
  function shanghaiNow(now) {
    var d = new Date((now ? now.getTime() : Date.now()) + 8 * 3600 * 1000);
    var date = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    var time = pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
    return { date: date, time: time };
  }

  function cleanSlug(s) {
    s = String(s || '').trim().toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return s || 'diary';
  }

  function yamlString(s) {
    return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  function parseTags(s) {
    var tags = String(s || '').split(/[,，、]/).map(function (t) { return t.trim(); })
      .filter(function (t) { return t; });
    return tags.length ? tags : ['日记'];
  }

  function template(opts) {
    return [
      '---',
      'title: ' + yamlString(opts.title),
      'date: ' + opts.date + ' ' + opts.time + ' +0800',
      'categories: [学习日记]',
      'tags: [' + opts.tags.join(', ') + ']',
      '---',
      '',
      '## 今天做了什么',
      '',
      '',
      '## 学到的新概念',
      '- ',
      '',
      '## 卡住的地方和怎么解决的',
      '',
      '',
      '## 还没想明白的问题',
      '',
      '',
      '## 明天想做什么',
      ''
    ].join('\n');
  }

  function build(o) {
    o = o || {};
    var now = shanghaiNow(o.now);
    var title = String(o.title || '').trim() || (now.date + ' 学习日记');
    var path = '_posts/' + now.date + '-' + cleanSlug(o.slug) + '.md';
    var value = template({ title: title, date: now.date, time: now.time, tags: parseTags(o.tags) });
    var url = (o.repo || 'https://github.com/dongzhongcen/dongzhongcen.github.io') +
      '/new/' + (o.branch || 'main') +
      '?filename=' + encodeURIComponent(path).replace(/%2F/g, '/') +
      '&value=' + encodeURIComponent(value);
    return { url: url, path: path, title: title, value: value, date: now.date };
  }

  root.DiaryLink = { build: build, shanghaiNow: shanghaiNow, cleanSlug: cleanSlug };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DiaryLink;
  if (typeof document === 'undefined') return;

  var box = document.getElementById('write-diary');
  if (!box) return;
  var $ = function (id) { return document.getElementById(id); };
  var go = $('write-go');

  function refresh() {
    var r = build({
      repo: box.dataset.repo, branch: box.dataset.branch,
      title: $('write-title').value, slug: $('write-slug').value, tags: $('write-tags').value
    });
    go.href = r.url;
    $('write-path').textContent = r.path;
    $('write-date').textContent = r.date + '-';
    $('write-title').placeholder = r.date + ' 学习日记';
    return r;
  }

  ['write-title', 'write-slug', 'write-tags'].forEach(function (id) {
    $(id).addEventListener('input', refresh);
  });
  /* 点击时再算一次，保证日期和时间是点按钮那一刻的 */
  go.addEventListener('click', refresh);
  refresh();
})(typeof window !== 'undefined' ? window : globalThis);
