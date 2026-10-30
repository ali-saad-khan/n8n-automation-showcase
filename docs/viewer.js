(function () {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var NW = 200, NH = 56;
  var data = window.N8N_WORKFLOWS || [];
  var listEl = document.getElementById('list');
  var detailEl = document.getElementById('detail');
  var current = null;

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function s(tag, attrs, text) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function shortType(t) { return t.replace(/^@n8n\/n8n-nodes-langchain\./, '').replace(/^n8n-nodes-base\./, ''); }
  function category(n) {
    var t = shortType(n.type);
    if (n.type.indexOf('langchain') !== -1) return 'ai';
    if (/[Tt]rigger$/.test(t) || t === 'webhook') return 'trigger';
    if (/^(if|switch|merge|wait|filter|stopAndError|executeWorkflow|noOp)$/.test(t)) return 'logic';
    if (/^(httpRequest|respondToWebhook)$/.test(t)) return 'http';
    if (/^(set|code|splitOut|summarize|aggregate|convertToFile|dataTable)$/.test(t)) return 'data';
    return 'other';
  }
  function trunc(str, n) { return str.length > n ? str.slice(0, n - 1) + '…' : str; }
  function wrap(text, max) {
    var out = [];
    text.replace(/[#*`]/g, '').split('\n').forEach(function (para) {
      var line = '';
      para.split(/\s+/).forEach(function (w) {
        if ((line + ' ' + w).trim().length > max) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
      });
      out.push(line);
    });
    return out;
  }

  /* ---------- graph ---------- */
  function buildGraph(wf, onSelect) {
    var nodes = wf.nodes.filter(function (n) { return n.type !== 'n8n-nodes-base.stickyNote'; });
    var stickies = wf.nodes.filter(function (n) { return n.type === 'n8n-nodes-base.stickyNote'; });
    var byName = {};
    nodes.forEach(function (n) { byName[n.name] = n; });

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function grow(x, y, w, h) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h); }
    nodes.forEach(function (n) { grow(n.position[0], n.position[1], NW, NH); });
    stickies.forEach(function (n) { grow(n.position[0], n.position[1], n.parameters.width || 240, n.parameters.height || 160); });
    var pad = 40, ox = pad - minX, oy = pad - minY;
    var W = maxX - minX + pad * 2, H = maxY - minY + pad * 2 + 70;

    // input counts per node (for multi-input nodes like Merge)
    var inputs = {};
    Object.keys(wf.connections).forEach(function (src) {
      var m = wf.connections[src].main || [];
      m.forEach(function (grp) { (grp || []).forEach(function (t) { inputs[t.node] = Math.max(inputs[t.node] || 1, (t.index || 0) + 1); }); });
    });

    var svg = s('svg', { xmlns: SVGNS, viewBox: '0 0 ' + W + ' ' + H, role: 'group', 'aria-label': 'Node graph of ' + wf.name });
    var defs = s('defs');
    ['', 'ai'].forEach(function (k) {
      var m = s('marker', { id: 'arrow' + k, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
      m.appendChild(s('path', { d: 'M0,0 L10,5 L0,10 z', 'class': 'arrow ' + k }));
      defs.appendChild(m);
    });
    svg.appendChild(defs);

    stickies.forEach(function (n) {
      var w = n.parameters.width || 240, h = n.parameters.height || 160;
      var g = s('g', { 'class': 'sticky', 'aria-hidden': 'true' });
      g.appendChild(s('rect', { x: n.position[0] + ox, y: n.position[1] + oy, width: w, height: h, rx: 6 }));
      var lines = wrap(n.parameters.content || '', Math.floor(w / 6.6));
      var maxLines = Math.floor((h - 12) / 15);
      lines.slice(0, maxLines).forEach(function (ln, i) {
        g.appendChild(s('text', { x: n.position[0] + ox + 10, y: n.position[1] + oy + 20 + i * 15 }, ln));
      });
      svg.appendChild(g);
    });

    var edges = s('g'); svg.appendChild(edges);
    function outPoint(n, i, count) { return [n.position[0] + ox + NW, n.position[1] + oy + NH * (i + 1) / (count + 1)]; }
    function inPoint(n, i, count) { return [n.position[0] + ox, n.position[1] + oy + NH * (i + 1) / (count + 1)]; }

    Object.keys(wf.connections).forEach(function (src) {
      var from = byName[src]; if (!from) return;
      var types = wf.connections[src];
      Object.keys(types).forEach(function (type) {
        var outs = types[type] || [];
        outs.forEach(function (grp, oi) {
          (grp || []).forEach(function (t) {
            var to = byName[t.node]; if (!to) return;
            var d, lx, ly, cls = 'edge';
            if (type !== 'main') {
              // AI sub-node (below) -> parent: bottom of parent, from top of sub-node
              var a = [from.position[0] + ox + NW / 2, from.position[1] + oy];
              var b = [to.position[0] + ox + NW / 2, to.position[1] + oy + NH];
              var shift = (from.position[0] - to.position[0]) / 8; b[0] += Math.max(-70, Math.min(70, shift));
              var my = (a[1] + b[1]) / 2;
              d = 'M' + a[0] + ',' + a[1] + ' C' + a[0] + ',' + my + ' ' + b[0] + ',' + my + ' ' + b[0] + ',' + b[1];
              cls += ' ai'; lx = a[0] + 6; ly = a[1] - 6;
              edges.appendChild(s('path', { d: d, 'class': cls, 'marker-end': 'url(#arrowai)' }));
              edges.appendChild(s('text', { x: lx, y: ly, 'class': 'elabel' }, type.replace('ai_', '')));
              return;
            }
            var a2 = outPoint(from, oi, Math.max(outs.length, 1));
            var b2 = inPoint(to, t.index || 0, inputs[t.node] || 1);
            var dx = Math.max(40, Math.abs(b2[0] - a2[0]) / 2);
            if (to.position[0] < from.position[0]) { // backward edge (loop): route underneath both nodes
              var yb = Math.max(a2[1], b2[1]) + NH / 2 + 50;
              d = 'M' + a2[0] + ',' + a2[1] + ' C' + (a2[0] + 60) + ',' + a2[1] + ' ' + (a2[0] + 60) + ',' + yb + ' ' + a2[0] + ',' + yb +
                ' L' + b2[0] + ',' + yb + ' C' + (b2[0] - 60) + ',' + yb + ' ' + (b2[0] - 60) + ',' + b2[1] + ' ' + b2[0] + ',' + b2[1];
            } else {
              d = 'M' + a2[0] + ',' + a2[1] + ' C' + (a2[0] + dx) + ',' + a2[1] + ' ' + (b2[0] - dx) + ',' + b2[1] + ' ' + b2[0] + ',' + b2[1];
            }
            edges.appendChild(s('path', { d: d, 'class': cls, 'marker-end': 'url(#arrow)' }));
            if (outs.length > 1) {
              var lab = /\.if$/.test(from.type) ? (oi === 0 ? 'true' : 'false') : (from.onError === 'continueErrorOutput' ? (oi === 0 ? 'success' : 'error') : String(oi));
              edges.appendChild(s('text', { x: a2[0] + 6, y: a2[1] - 5, 'class': 'elabel' }, lab));
            }
          });
        });
      });
    });

    var gNodes = s('g'); svg.appendChild(gNodes);
    var nodeEls = [];
    nodes.forEach(function (n) {
      var cat = category(n);
      var g = s('g', { 'class': 'n ' + cat, tabindex: '0', role: 'button', 'aria-label': n.name + ', ' + shortType(n.type) + ', version ' + n.typeVersion + '. Press Enter for details.', transform: 'translate(' + (n.position[0] + ox) + ',' + (n.position[1] + oy) + ')' });
      g.appendChild(s('title', {}, n.name + ' (' + n.type + ' v' + n.typeVersion + ')'));
      g.appendChild(s('rect', { width: NW, height: NH, rx: 10 }));
      g.appendChild(s('text', { x: 12, y: 24 }, trunc(n.name, 27)));
      g.appendChild(s('text', { x: 12, y: 42, 'class': 't2' }, trunc(shortType(n.type) + ' v' + n.typeVersion, 33)));
      function pick() { nodeEls.forEach(function (x) { x.classList.remove('on'); }); g.classList.add('on'); onSelect(n); }
      g.addEventListener('click', pick);
      g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      nodeEls.push(g); gNodes.appendChild(g);
    });
    return { svg: svg, w: W, h: H };
  }

  /* ---------- detail view ---------- */
  function section(title, child) { return el('section', { 'class': 'card' }, [el('h3', { text: title }), child]); }
  function ul(items, cls) { return el('ul', cls ? { 'class': cls } : {}, items.map(function (t) { return el('li', { text: t }); })); }

  function render(item) {
    current = item;
    detailEl.textContent = '';
    var wf = item.workflow;

    var head = el('div', { 'class': 'card' }, [
      el('div', { 'class': 'head' }, [
        el('h2', { text: item.title }, []),
        el('a', { 'class': 'btn primary', href: 'workflows/' + item.file, download: item.file, text: 'Download JSON' })
      ]),
      el('p', { 'class': 'summary', text: item.summary })
    ]);
    head.querySelector('h2').appendChild(el('span', { 'class': 'badge', text: item.kind === 'helper' ? 'helper sub-workflow' : 'workflow' }));
    detailEl.appendChild(head);

    // graph
    var scale = 1, canvas = el('div', { 'class': 'canvas', tabindex: '0', role: 'region', 'aria-label': 'Workflow graph, scrollable. Use arrow keys to scroll, Tab to reach nodes.' });
    var sel = el('div', { 'class': 'sel' }, [el('p', { 'class': 'note', text: 'Select a node (click, or Tab then Enter) to see its parameters.' })]);
    var g = buildGraph(wf, function (n) {
      sel.textContent = '';
      sel.appendChild(el('h4', { text: n.name + ' - ' + n.type + ' v' + n.typeVersion }));
      var json = JSON.stringify(n.parameters, null, 2);
      sel.appendChild(el('pre', { text: json.length > 2500 ? json.slice(0, 2500) + '\n… (truncated)' : json }));
    });
    function apply() { g.svg.setAttribute('width', Math.round(g.w * scale)); g.svg.setAttribute('height', Math.round(g.h * scale)); }
    function fit() { scale = Math.max(0.8, Math.min(1.2, (canvas.clientWidth - 4) / g.w)); apply(); }
    function btn(label, aria, fn) { var b = el('button', { type: 'button', 'class': 'btn', 'aria-label': aria, text: label }); b.addEventListener('click', fn); return b; }
    var toolbar = el('div', { 'class': 'toolbar' }, [
      btn('Zoom in', 'Zoom in', function () { scale = Math.min(2.5, scale * 1.2); apply(); }),
      btn('Zoom out', 'Zoom out', function () { scale = Math.max(0.3, scale / 1.2); apply(); }),
      btn('Fit', 'Fit graph to width', fit),
      btn('100%', 'Reset zoom to 100 percent', function () { scale = 1; apply(); }),
      el('span', { 'class': 'hint', text: wf.nodes.filter(function (n) { return n.type !== 'n8n-nodes-base.stickyNote'; }).length + ' nodes' })
    ]);
    var legend = el('ul', { 'class': 'legend', 'aria-label': 'Legend' }, [
      ['trigger', 'Trigger / webhook'], ['logic', 'Flow control'], ['http', 'HTTP / response'], ['data', 'Data'], ['ai', 'AI'], ['other', 'Other']
    ].map(function (p) {
      var li = el('li', {}, [el('i', { style: 'background:var(--c-' + p[0] + ');border-color:var(--c-' + p[0] + '-b)' }), document.createTextNode(p[1])]);
      return li;
    }));
    canvas.appendChild(g.svg);
    detailEl.appendChild(el('section', { 'class': 'card' }, [el('h3', { text: 'Node graph' }), toolbar, canvas, legend, sel]));
    fit();

    // steps + nodes
    var stepsOl = el('ol', { 'class': 'steps' }, item.steps.map(function (t) { return el('li', { text: t }); }));
    var rows = wf.nodes.filter(function (n) { return n.type !== 'n8n-nodes-base.stickyNote'; }).map(function (n) {
      return el('tr', {}, [el('td', { text: n.name }), el('td', {}, [el('code', { text: shortType(n.type) })]), el('td', { text: String(n.typeVersion) })]);
    });
    var table = el('div', { 'class': 'tbl-wrap' }, [el('table', {}, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'Node' }), el('th', { text: 'Type' }), el('th', { text: 'v' })])]),
      el('tbody', {}, rows)
    ])]);
    detailEl.appendChild(el('div', { 'class': 'grid2' }, [section('What it does', stepsOl), section('Nodes used', table)]));

    var meta = el('div', { 'class': 'grid2', style: 'margin-top:16px' }, [
      section('Patterns demonstrated', ul(item.patterns, 'chips')),
      section('Environment / placeholders', item.env.length ? ul(item.env, 'chips') : el('p', { 'class': 'note', text: 'None.' }))
    ]);
    detailEl.appendChild(meta);
    detailEl.appendChild(el('p', { 'class': 'note', text: 'This page only draws the exported JSON. It does not execute anything. Import the downloaded file into n8n to run it.' }));

    Array.prototype.forEach.call(listEl.querySelectorAll('button'), function (b) { b.setAttribute('aria-current', b.getAttribute('data-id') === item.id ? 'true' : 'false'); });
    document.title = item.title + ' - n8n Workflow Showcase';
  }

  function select(id, focus) {
    var item = data.filter(function (d) { return d.id === id; })[0] || data[0];
    if (!item) return;
    render(item);
    try { history.replaceState(null, '', '#' + item.id); } catch (e) { /* file:// or sandbox */ }
    if (focus) document.getElementById('main').focus();
  }

  data.forEach(function (d) {
    var b = el('button', { type: 'button', 'data-id': d.id, 'aria-current': 'false' }, [
      document.createTextNode(d.title),
      el('span', { 'class': 'tag', text: d.kind === 'helper' ? 'helper sub-workflow' : d.workflow.nodes.filter(function (n) { return n.type !== 'n8n-nodes-base.stickyNote'; }).length + ' nodes' })
    ]);
    b.addEventListener('click', function () { select(d.id, true); });
    listEl.appendChild(el('li', {}, [b]));
  });

  /* theme */
  var root = document.documentElement;
  try { var saved = localStorage.getItem('n8n-demo-theme'); if (saved) root.setAttribute('data-theme', saved); } catch (e) { /* storage blocked */ }
  document.getElementById('theme').addEventListener('click', function () {
    var dark = root.getAttribute('data-theme') ? root.getAttribute('data-theme') === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('n8n-demo-theme', next); } catch (e) { /* ignore */ }
  });

  window.addEventListener('hashchange', function () { select(location.hash.slice(1), false); });
  select(location.hash.slice(1), false);
})();
