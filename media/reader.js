(function () {
  const vscode = acquireVsCodeApi();
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (id) => document.getElementById(id);

  const state = { idx: -1, playing: false, rate: 1, following: true };
  let SEG_SEQ = 0;
  let SEGMENTS = []; // [{id, el, text}]

  const ICON_PLAY = '<svg viewBox="0 0 12 12" fill="currentColor"><path d="M2 1l8 5-8 5z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 12 12" fill="currentColor"><path d="M2 1h3v10H2zM7 1h3v10H7z"/></svg>';
  const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  function fmtRate(r) {
    return (Math.round(r * 100) / 100).toFixed(2).replace(/(\.\d)0$/, '$1') + '×';
  }

  /* ---------------- chrome ---------------- */
  function buildChrome() {
    $('app').innerHTML = `
      <header id="bar">
        <div class="bar-row">
          <button class="btn play" id="play" aria-label="Play" title="Play (Space)">${ICON_PLAY}</button>
          <span class="pos" id="pos"></span>
          <span class="spacer"></span>
          <button class="ctl" id="follow" aria-pressed="true">Follow</button>
          <button class="ctl" id="focus" aria-pressed="false">Focus</button>
          <button class="ctl" id="ambient" aria-pressed="false">Glow</button>
        </div>
        <div class="speed-row">
          <div class="speed-presets" id="speed-presets">
            ${SPEED_PRESETS.map((p) => `<button data-rate="${p}">${fmtRate(p)}</button>`).join('')}
          </div>
          <div class="speed-slider">
            <input type="range" id="rate" min="0.5" max="2" step="0.05" value="1" aria-label="Speed">
            <span class="rate-val" id="ratev">1.0×</span>
          </div>
        </div>
      </header>
      <div id="reader-wrap">
        <div id="empty-note">Nothing to read in this cell.</div>
        <div id="doc"></div>
      </div>`;
    bindChrome();
  }

  function applyRate() {
    const r = $('rate'); if (r) r.value = String(state.rate);
    const rv = $('ratev'); if (rv) rv.textContent = fmtRate(state.rate);
    document.querySelectorAll('#speed-presets button').forEach((b) => {
      b.classList.toggle('sel-on', Math.abs(parseFloat(b.dataset.rate) - state.rate) < 0.001);
    });
  }

  // Rate only takes effect on the NEXT sentence — each sentence is a one-shot
  // "speak this text at this rate" command to the OS TTS helper, not a live
  // player whose rate can be nudged mid-utterance.
  let persistTimer = 0;
  function setRate(r, persist) {
    state.rate = Math.min(2, Math.max(0.5, Math.round(r * 100) / 100));
    applyRate();
    if (persist) {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => vscode.postMessage({ type: 'persistRate', rate: state.rate }), 400);
    }
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
    $('rate').addEventListener('input', (e) => setRate(parseFloat(e.target.value), true));
    document.querySelectorAll('#speed-presets button').forEach((b) => {
      b.addEventListener('click', () => setRate(parseFloat(b.dataset.rate), true));
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
    // Code blocks are shown but not read: skip them, playback continues at the next sentence.
    root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote').forEach((block) => {
      if (block.closest('pre')) return;
      wrapBlock(block);
    });
    // "empty" hides #doc entirely, so it must reflect whether there's anything to SHOW
    // (root has content at all), not just whether there's anything to SPEAK (SEGMENTS) —
    // a code-only cell has no segments but still has a code block to display.
    document.body.classList.toggle('empty', !root.textContent || !root.textContent.trim());
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
    // Mid-paragraph newlines are just soft-wrapped whitespace (CommonMark), but
    // Intl.Segmenter's sentence boundary rules treat "\n" as sentence-ending —
    // normalize to spaces (same length, so tnode offsets stay valid) so manual
    // line-wrapping in the source markdown doesn't fragment the highlight.
    const segs = sentencesOf(text.replace(/[\r\n\t]/g, ' '));
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
      setRate(m.rate || 1, false);
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
