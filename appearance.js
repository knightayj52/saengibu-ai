/* Appearance preferences are local only; no account, sheet or API access. */
(() => {
  'use strict';
  const KEY = 'sgb_appearance_v1';
  const PRESETS = {
    studio: { name: '라벤더 스튜디오', note: '은은한 보라 · 기본', accent: '#7255c5', tone: '#b7a5ed' },
    ocean: { name: '블루 아워', note: '맑고 차분한 블루', accent: '#3268cb', tone: '#9dbfe7' },
    rose: { name: '로즈 페이퍼', note: '부드러운 로즈', accent: '#ac4968', tone: '#e5afbb' },
    sand: { name: '샌드 데스크', note: '따뜻한 모래빛', accent: '#886132', tone: '#debd82' },
    graphite: { name: '모노 그라파이트', note: '정제된 무채색', accent: '#515967', tone: '#a5acb6' },
    forest: { name: '세이지 가든', note: '편안한 세이지', accent: '#306b5c', tone: '#9ebfaf' }
  };
  const DEFAULT = { preset: 'studio', mode: 'light', accent: null, tone: null, depth: 8, texture: 'glow' };
  const validHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function normalize(raw) {
    const x = raw && typeof raw === 'object' ? raw : {};
    return {
      preset: own(PRESETS, x.preset) ? x.preset : DEFAULT.preset,
      mode: ['light', 'dark', 'system'].includes(x.mode) ? x.mode : DEFAULT.mode,
      accent: validHex(x.accent) ? x.accent.toLowerCase() : null,
      tone: validHex(x.tone) ? x.tone.toLowerCase() : null,
      depth: typeof x.depth === 'number' && Number.isFinite(x.depth) ? Math.min(20, Math.max(0, x.depth)) : DEFAULT.depth,
      texture: ['plain', 'glow'].includes(x.texture) ? x.texture : DEFAULT.texture
    };
  }
  function read() { try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch (_) { return { ...DEFAULT }; } }
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
  function luminance(hex) {
    return rgb(hex).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
  }
  function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
  function readable(color, surface, target = 4.5) {
    const end = luminance(surface) > .35 ? '#171923' : '#ffffff';
    for (let i = 0; i <= 100; i++) { const c = mix(color, end, i / 100); if (contrast(c, surface) >= target) return c; }
    return end;
  }
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  const darkMode = p => p.mode === 'dark' || (p.mode === 'system' && media.matches);
  let saved = read(), draft = null, dialog, opener;
  function apply(p) {
    const palette = PRESETS[p.preset], dark = darkMode(p);
    const chosen = p.accent || palette.accent, tone = p.tone || palette.tone;
    const bg = mix(dark ? '#101218' : '#ffffff', tone, p.depth / 100 * (dark ? .45 : 1));
    const card = dark ? '#1c1f29' : '#ffffff';
    const ink = dark ? '#eff0f8' : '#262b39';
    const sub = dark ? '#adb2c5' : '#636b7e';
    const soft = mix(card, chosen, dark ? .15 : .08);
    const accent = readable(readable(chosen, card), soft);
    const actionInk = contrast(chosen, '#ffffff') >= contrast(chosen, '#000000') ? '#ffffff' : '#000000';
    const vars = {
      '--bg': bg, '--card': card, '--ink': ink, '--sub': sub,
      '--line': dark ? '#373c4d' : '#e1e3eb', '--navy': accent, '--navy2': readable(chosen, card, 6),
      '--brand': accent, '--action': chosen, '--action-ink': actionInk,
      '--action-hover': mix(chosen, actionInk === '#ffffff' ? '#000000' : '#ffffff', .10),
      '--soft': soft, '--soft-strong': mix(card, chosen, dark ? .27 : .16), '--surface': dark ? '#252937' : '#f5f6fa',
      '--glow': mix(bg, tone, dark ? .14 : .30), '--glow-alt': mix(bg, chosen, dark ? .08 : .10),
      '--scene': mix(card, tone, dark ? .12 : .24), '--scene-orb': mix(card, chosen, dark ? .22 : .16),
      '--accent': dark ? '#edbc69' : '#a77325', '--ok': dark ? '#a0d9b3' : '#246540', '--bad': dark ? '#ffb3b3' : '#a33340',
      '--ok-bg': dark ? '#20372d' : '#edf6ef', '--warn-bg': dark ? '#3b3224' : '#fbf4e4',
      '--warn-ink': dark ? '#efcf91' : '#78571b', '--bad-bg': dark ? '#412932' : '#fcedef',
      '--shadow': dark ? '0 18px 55px #00000030' : '0 18px 55px #35345a0c'
    };
    const root = document.documentElement;
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.texture = p.texture;
    root.style.colorScheme = dark ? 'dark' : 'light';
  }
  // Apply saved preferences before body paint, avoiding a bright flash in dark mode.
  apply(saved);
  const onSystemChange = () => { if ((draft || saved).mode === 'system') { apply(draft || saved); if (draft) sync(); } };
  if (media.addEventListener) media.addEventListener('change', onSystemChange);
  else if (media.addListener) media.addListener(onSystemChange);

  function sync() {
    const p = draft || saved, preset = PRESETS[p.preset];
    document.querySelectorAll('[data-palette]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.palette === p.preset)));
    document.querySelectorAll('[data-color-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.colorMode === p.mode)));
    document.querySelectorAll('[data-texture]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.texture === p.texture)));
    document.getElementById('appearanceAccent').value = p.accent || preset.accent;
    document.getElementById('appearanceTone').value = p.tone || preset.tone;
    document.getElementById('accentHex').textContent = (p.accent || preset.accent).toUpperCase();
    document.getElementById('toneHex').textContent = (p.tone || preset.tone).toUpperCase();
    document.getElementById('appearanceDepth').value = p.depth;
    document.getElementById('depthValue').textContent = p.depth + '%';
    document.getElementById('appearancePreviewName').textContent = preset.name + (p.accent || p.tone ? ' · 나만의 색상' : '');
    document.getElementById('appearanceSummary').textContent = preset.name + ' · ' + ({ light: '라이트', dark: '다크', system: '기기 설정' }[p.mode]);
  }
  function update(values) { if (!draft) return; draft = normalize({ ...draft, ...values }); apply(draft); sync(); }
  function open(e) {
    opener = e.currentTarget;
    draft = { ...saved };
    document.getElementById('appearanceStatus').textContent = '';
    sync(); dialog.showModal(); document.body.classList.add('appearance-open');
  }
  function cancel() { draft = null; apply(saved); }
  function bootAppearance() {
    dialog = document.getElementById('appearanceDialog');
    const choices = document.getElementById('appearancePalettes');
    Object.entries(PRESETS).forEach(([key, p]) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'palette-choice'; button.dataset.palette = key;
      button.setAttribute('aria-pressed', 'false');
      const sample = document.createElement('span'); sample.className = 'palette-mini'; sample.setAttribute('aria-hidden', 'true');
      sample.style.setProperty('--palette-accent', p.accent); sample.style.setProperty('--palette-bg', mix('#ffffff', p.tone, .16));
      sample.innerHTML = '<i></i><span><b></b><b></b><b></b></span><em>✓</em>';
      const name = document.createElement('strong'); name.textContent = p.name;
      const note = document.createElement('small'); note.textContent = p.note;
      button.append(sample, name, note); button.onclick = () => update({ preset: key, accent: null, tone: null }); choices.append(button);
    });
    document.querySelectorAll('[data-open-appearance]').forEach(b => b.addEventListener('click', open));
    document.querySelectorAll('[data-color-mode]').forEach(b => b.addEventListener('click', () => update({ mode: b.dataset.colorMode })));
    document.querySelectorAll('[data-texture]').forEach(b => b.addEventListener('click', () => update({ texture: b.dataset.texture })));
    document.getElementById('appearanceAccent').addEventListener('input', e => update({ accent: e.target.value }));
    document.getElementById('appearanceTone').addEventListener('input', e => update({ tone: e.target.value }));
    document.getElementById('appearanceDepth').addEventListener('input', e => update({ depth: Number(e.target.value) }));
    document.getElementById('appearanceReset').onclick = () => { draft = { ...DEFAULT }; apply(draft); sync(); };
    document.getElementById('appearanceCancel').onclick = () => { cancel(); dialog.close(); };
    document.getElementById('appearanceClose').onclick = () => { cancel(); dialog.close(); };
    document.getElementById('appearanceSave').onclick = () => {
      const next = normalize(draft);
      try { localStorage.setItem(KEY, JSON.stringify(next)); }
      catch (_) { document.getElementById('appearanceStatus').textContent = '브라우저 저장 공간을 사용할 수 없어 저장하지 못했습니다. 저장 허용 여부를 확인해 주세요.'; return; }
      saved = next; draft = null; apply(saved); sync(); dialog.close();
      const status = document.getElementById('appearanceToast');
      status.textContent = '화면 스타일을 저장했습니다.'; status.hidden = false;
      window.clearTimeout(status._timer); status._timer = window.setTimeout(() => { status.hidden = true; }, 3500);
    };
    dialog.addEventListener('cancel', cancel);
    dialog.addEventListener('close', () => { if (draft) cancel(); sync(); document.body.classList.remove('appearance-open'); if (opener) opener.focus(); });
    window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) { saved = read(); if (!draft) { apply(saved); sync(); } } });
    sync();
  }
  document.addEventListener('DOMContentLoaded', bootAppearance);
})();
