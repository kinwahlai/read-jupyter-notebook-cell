(function () {
  const vscode = acquireVsCodeApi();
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (id) => document.getElementById(id);

  const state = { idx: -1, playing: false, rate: 1, following: true };
  let SEG_SEQ = 0;
  let SEGMENTS = []; // [{id, el, text}]

  const ICON_PLAY = '<svg viewBox="0 0 12 12" fill="currentColor"><path d="M2 1l8 5-8 5z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 12 12" fill="currentColor"><path d="M2 1h3v10H2zM7 1h3v10H7z"/></svg>';

  /* ---------------- chrome ---------------- */
  function buildChrome() {
    $('app').innerHTML = `
      <header id="bar">
        <button class="btn play" id="play" aria-label="Play" title="Play (Space)">${ICON_PLAY}</button>
        <span class="pos" id="pos"></span>
        <span class="spacer"></span>
        <button class="ctl" id="follow" aria-pressed="true">Follow</button>
        <button class="ctl" id="focus" aria-pressed="false">Focus</button>
        <button class="ctl" id="ambient" aria-pressed="false">Glow</button>
        <label class="rate">Speed <input type="range" id="rate" min="0.5" max="2" step="0.1" value="1"></label>
      </header>
      <div id="reader-wrap">
        <div id="empty-note">Nothing to read in this cell.</div>
        <div id="doc"></div>
      </div>`;
    bindChrome();
  }

  function bindChrome() {
    $('play').addEventListener('click', togglePlay);
    $('follow').addEventListener('click', () => {
      state.following = !state.following;
      $('follow').setAttribute('aria-pressed', String(state.following));
      if (state.following && state.playing) {
        const seg = SEGMENTS[state.idx];
        if (seg) scrollToSeg(seg);
      }
    });
    $('focus').addEventListener('click', () => {
      const on = document.body.classList.toggle('focusing');
      $('focus').setAttribute('aria-pressed', String(on));
    });
    $('ambient').addEventListener('click', () => {
      const on = document.body.classList.toggle('ambient');
      $('ambient').setAttribute('aria-pressed', String(on));
    });
    $('rate').addEventListener('input', (e) => {
      state.rate = parseFloat(e.target.value) || 1;
    });
    document.addEventListener('keydown', (e) => {
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    });
  }

  /* ---------------- sentence wrapping ----------------
     Adapted from markdown-read-aloud: a Range-based splitter keeps nested
     inline markup (<strong>, <a>, <code>) intact even when a sentence
     boundary falls inside it. */
  const BLOCKISH = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, ul, ol';
  const isBlockish = (n) => n.nodeType === 1 && (n.matches(BLOCKISH) || !!n.querySelector(BLOCKISH));

  function sentencesOf(text) {
    try { return [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)]; }
    catch { return [{ segment: text, index: 0 }]; }
  }

  function buildSegments(root) {
    SEG_SEQ = 0; SEGMENTS = [];
    root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, pre').forEach((block) => {
      if (block.tagName === 'PRE') { handlePre(block); return; }
      if (block.closest('pre')) return;
      wrapBlock(block);
    });
    document.body.classList.toggle('empty', SEGMENTS.length === 0);
  }

  function wrapBlock(block) {
    if (!block.textContent.trim()) return;
    let run = [];
    const runs = [];
    block.childNodes.forEach((n) => {
      if (isBlockish(n)) { if (run.length) runs.push(run); run = []; }
      else run.push(n);
    });
    if (run.length) runs.push(run);
    for (const r of runs) segmentRun(r);
  }

  function segmentRun(nodes) {
    const text = nodes.map((n) => n.textContent).join('');
    if (!text.trim()) return;
    const tnodes = [];
    let off = 0;
    for (const n of nodes) {
      if (n.nodeType === 3) {
        tnodes.push({ node: n, start: off, end: off + n.nodeValue.length });
        off += n.nodeValue.length;
      } else if (n.nodeType === 1) {
        const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
        let t;
        while ((t = w.nextNode())) { tnodes.push({ node: t, start: off, end: off + t.nodeValue.length }); off += t.nodeValue.length; }
      }
    }
    if (!tnodes.length) return;
    const last = tnodes[tnodes.length - 1];
    const locateStart = (i) => { for (const t of tnodes) if (i < t.end) return [t.node, Math.max(0, i - t.start)]; return [last.node, last.node.nodeValue.length]; };
    const locateEnd = (i) => { for (const t of tnodes) if (i <= t.end) return [t.node, Math.max(0, i - t.start)]; return [last.node, last.node.nodeValue.length]; };
    const segs = sentencesOf(text);
    const spans = [];
    for (const s of segs) {
      const range = document.createRange();
      const [sn, so] = locateStart(s.index);
      const [en, eo] = locateEnd(s.index + s.segment.length);
      range.setStart(sn, so); range.setEnd(en, eo);
      const span = document.createElement('span');
      span.className = 'seg'; span.dataset.seg = String(SEG_SEQ);
      span.appendChild(range.cloneContents());
      const tts = s.segment.replace(/\s+/g, ' ').trim();
      if (tts) { span.tabIndex = -1; SEGMENTS.push({ id: SEG_SEQ, el: span, text: tts }); }
      SEG_SEQ++;
      spans.push(span);
    }
    const parent = nodes[0].parentNode;
    const anchor = nodes[0];
    for (const sp of spans) parent.insertBefore(sp, anchor);
    for (const n of nodes) n.remove();
  }

  // Code blocks: chunk into line groups so each spoken segment stays short,
  // highlighting the whole <pre> for every chunk it owns.
  function handlePre(pre) {
    const lines = pre.textContent.split('\n');
    let buf = '';
    const flush = () => {
      const t = buf.replace(/\s+/g, ' ').trim();
      if (t) SEGMENTS.push({ id: SEG_SEQ++, el: pre, text: t });
      buf = '';
    };
    for (const ln of lines) {
      buf += ln + '\n';
      if (buf.length > 240) flush();
    }
    flush();
  }

  /* ---------------- playback ---------------- */
  function clearHL() { SEGMENTS.forEach((s) => s.el.classList.remove('speaking')); }

  function scrollToSeg(seg) {
    seg.el.scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'center' });
  }

  function activate(i) {
    clearHL();
    const seg = SEGMENTS[i];
    if (!seg) return;
    seg.el.classList.add('speaking');
    if (state.following) scrollToSeg(seg);
    updateStatus();
  }

  function updateStatus() {
    const ps = $('pos');
    if (ps) ps.textContent = SEGMENTS.length ? (state.idx + 1) + ' / ' + SEGMENTS.length : '';
  }

  function setPlayIcon() {
    const b = $('play');
    if (!b) return;
    b.innerHTML = state.playing ? ICON_PAUSE : ICON_PLAY;
    b.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    b.title = (state.playing ? 'Pause' : 'Play') + ' (Space)';
  }

  function setPlaying(p) {
    state.playing = p;
    setPlayIcon();
  }

  function playAt(i) {
    if (i < 0) i = 0;
    if (i >= SEGMENTS.length) { finish(); return; }
    state.idx = i;
    activate(i);
    vscode.postMessage({ type: 'speak', text: SEGMENTS[i].text, rate: state.rate });
  }

  function doPlay() {
    if (!SEGMENTS.length) return;
    setPlaying(true);
    playAt(state.idx < 0 || state.idx >= SEGMENTS.length ? 0 : state.idx);
  }

  function doPause() {
    setPlaying(false);
    vscode.postMessage({ type: 'stop' });
  }

  function togglePlay() { state.playing ? doPause() : doPlay(); }

  function finish() {
    setPlaying(false);
    clearHL();
    state.idx = -1;
    updateStatus();
  }

  // click a sentence to jump there
  document.addEventListener('click', (e) => {
    const el = e.target.closest('.seg');
    if (!el) return;
    const id = Number(el.dataset.seg);
    const idx = SEGMENTS.findIndex((s) => s.id === id);
    if (idx < 0) return;
    if (state.playing) { vscode.postMessage({ type: 'stop' }); playAt(idx); }
    else { state.idx = idx; activate(idx); }
  });

  /* ---------------- host messages ---------------- */
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'render') {
      state.rate = m.rate || 1;
      const rateInput = $('rate');
      if (rateInput) rateInput.value = String(state.rate);
      $('doc').innerHTML = m.html;
      buildSegments($('doc'));
      state.idx = -1;
      clearHL();
      updateStatus();
      if (SEGMENTS.length) doPlay();
    } else if (m.type === 'spoken') {
      if (state.playing) playAt(state.idx + 1);
    }
  });

  buildChrome();
  vscode.postMessage({ type: 'ready' });
})();
