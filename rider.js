/* Der Dicke auf dem Dampfer – eigene SVG-Illustration (keine Markenlogos).
   Ein älterer, kräftiger Tourenfahrer ohne Helm auf einem großen Reise-Tourer.
   Szenen: sun, night, cloudy, rain, thunder, snow, fog, storm, heat, cold */
(function () {
  const SCENES = {
    sun:     { sky: ['#8fd3ff', '#e9f7ff'], line: 'Kaiserwetter. Nix wie raus auf die Landstraße!', mood: 'happy' },
    night:   { sky: ['#14213d', '#33415c'], line: 'Nachtfahrt – Augen auf, Wildwechsel!', mood: 'calm' },
    cloudy:  { sky: ['#a9b4c2', '#dfe5ec'], line: 'Grau, aber trocken. Passt scho.', mood: 'calm' },
    rain:    { sky: ['#5f6f82', '#9aa7b6'], line: 'Regenkombi an – oder erst a Kaffee.', mood: 'grumpy' },
    thunder: { sky: ['#2e3440', '#5b6577'], line: 'Bei Blitz bleibt der Dampfer in der Garage.', mood: 'shock' },
    snow:    { sky: ['#c9d6e3', '#f4f8fb'], line: 'Saisonkennzeichen hat heut recht.', mood: 'grumpy' },
    fog:     { sky: ['#b8bfc6', '#e3e6e8'], line: 'Suppe! Tempo runter, Licht an.', mood: 'calm' },
    storm:   { sky: ['#7d8ea3', '#c3ccd6'], line: 'Seitenwind! Die Fuhre will heut woanders hin.', mood: 'shock' },
    heat:    { sky: ['#ffb347', '#ffe29a'], line: 'Lederweste reicht. Viel trinken!', mood: 'sweat' },
    cold:    { sky: ['#9fc5e8', '#e8f1fa'], line: 'Griffheizung auf Stufe drei.', mood: 'grumpy' },
  };

  function pickScene(code, temp, gust, isDay) {
    if (code >= 95) return 'thunder';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if (code === 45 || code === 48) return 'fog';
    if (gust != null && gust >= 55) return 'storm';
    if (temp != null && temp >= 28) return 'heat';
    if (temp != null && temp <= 4) return 'cold';
    if (!isDay) return 'night';
    if (code <= 1) return 'sun';
    return 'cloudy';
  }

  function sky(scene, id) {
    const s = SCENES[scene];
    let g = `<defs><linearGradient id="sky${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${s.sky[0]}"/><stop offset="1" stop-color="${s.sky[1]}"/></linearGradient>
      <linearGradient id="chrome${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset=".5" stop-color="#9aa3ad"/><stop offset="1" stop-color="#e6e9ec"/></linearGradient>
      <linearGradient id="paint${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8e1b2c"/><stop offset="1" stop-color="#4e0d18"/></linearGradient>
      <clipPath id="clip${id}"><rect x="0" y="0" width="320" height="260" rx="22"/></clipPath></defs>
      <g clip-path="url(#clip${id})"><rect width="320" height="260" fill="url(#sky${id})"/>`;
    const cloud = (x, y, s2, c) => `<g transform="translate(${x} ${y}) scale(${s2})" fill="${c}"><ellipse cx="0" cy="10" rx="34" ry="14"/><circle cx="-14" cy="2" r="14"/><circle cx="8" cy="-4" r="18"/><circle cx="26" cy="6" r="12"/></g>`;
    switch (scene) {
      case 'sun':
      case 'heat': {
        const c = scene === 'heat' ? '#ff7b00' : '#ffcc33';
        g += `<g transform="translate(262 48)"><circle r="24" fill="${c}"/>`;
        for (let i = 0; i < 12; i++) g += `<rect x="-2.5" y="-44" width="5" height="12" rx="2.5" fill="${c}" transform="rotate(${i * 30})"/>`;
        g += `</g>`;
        if (scene === 'heat') g += `<g stroke="#ff9a3c" stroke-width="2" fill="none" opacity=".6"><path d="M20 210 q8-8 0-16 q-8-8 0-16"/><path d="M300 215 q8-8 0-16 q-8-8 0-16"/></g>`;
        break;
      }
      case 'night':
        g += `<circle cx="258" cy="46" r="20" fill="#f6f1d5"/><circle cx="268" cy="40" r="18" fill="#22304f"/>`;
        [[30, 30], [70, 60], [120, 24], [190, 40], [300, 90], [220, 18], [40, 100]].forEach(([x, y]) => g += `<circle cx="${x}" cy="${y}" r="1.6" fill="#fff"/>`);
        break;
      case 'cloudy':
        g += cloud(250, 40, 1, '#fff') + cloud(80, 34, .8, '#f2f4f7') + cloud(180, 70, .6, '#e9edf2');
        break;
      case 'rain':
      case 'thunder': {
        const c = scene === 'thunder' ? '#4a5263' : '#7c8796';
        g += cloud(250, 36, 1.2, c) + cloud(90, 30, 1, c) + cloud(170, 44, .9, c);
        g += `<g stroke="#cfe3ff" stroke-width="2" stroke-linecap="round" opacity=".85">`;
        for (let i = 0; i < 26; i++) { const x = (i * 37) % 320, y = 70 + ((i * 53) % 150); g += `<line x1="${x}" y1="${y}" x2="${x - 5}" y2="${y + 14}"/>`; }
        g += `</g>`;
        if (scene === 'thunder') g += `<path d="M232 52 l-18 38 h14 l-12 34 l30-44 h-14 l12-28z" fill="#ffe14d" stroke="#fff3a0" stroke-width="1.5"/>`;
        break;
      }
      case 'snow':
        g += cloud(240, 34, 1.1, '#e7edf3') + cloud(90, 30, .9, '#eef2f6');
        g += `<g fill="#fff">`;
        for (let i = 0; i < 34; i++) { const x = (i * 41) % 320, y = 60 + ((i * 29) % 170); g += `<circle cx="${x}" cy="${y}" r="${2 + (i % 3)}"/>`; }
        g += `</g><rect x="0" y="232" width="320" height="28" fill="#fff"/>`;
        break;
      case 'fog':
        g += cloud(230, 40, 1, '#d5dade');
        break;
      case 'storm':
        g += cloud(250, 40, 1, '#dfe5ec') + cloud(90, 36, .8, '#dfe5ec');
        g += `<g stroke="#ffffff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"><path d="M300 90 h-70 q-14 0-14-10"/><path d="M310 120 h-110 q-16 0-16 12"/><path d="M290 150 h-60"/></g>`;
        break;
      case 'cold':
        g += `<g transform="translate(262 48)" stroke="#ffffff" stroke-width="3" stroke-linecap="round">`;
        for (let i = 0; i < 6; i++) g += `<line x1="0" y1="0" x2="0" y2="-22" transform="rotate(${i * 60})"/>`;
        g += `</g>` + cloud(90, 36, .8, '#ffffff');
        break;
    }
    // Straße
    if (scene !== 'snow') g += `<rect x="0" y="232" width="320" height="28" fill="${scene === 'night' ? '#1f2633' : '#6b7280'}"/><g fill="#f5f5f5" opacity=".8"><rect x="10" y="244" width="34" height="4" rx="2"/><rect x="90" y="244" width="34" height="4" rx="2"/><rect x="170" y="244" width="34" height="4" rx="2"/><rect x="250" y="244" width="34" height="4" rx="2"/></g>`;
    else g += `<g fill="#dfe7ef"><rect x="10" y="244" width="34" height="4" rx="2"/><rect x="170" y="244" width="34" height="4" rx="2"/></g>`;
    return g;
  }

  function wheel(cx, cy, id) {
    return `<g><circle cx="${cx}" cy="${cy}" r="33" fill="#1b1d21"/><circle cx="${cx}" cy="${cy}" r="22" fill="url(#chrome${id})"/>
      <circle cx="${cx}" cy="${cy}" r="17" fill="#3b4048"/>
      ${[0, 72, 144, 216, 288].map(a => `<rect x="${cx - 2}" y="${cy - 17}" width="4" height="17" fill="#c7ccd2" transform="rotate(${a} ${cx} ${cy})"/>`).join('')}
      <circle cx="${cx}" cy="${cy}" r="5" fill="#d9dde2"/></g>`;
  }

  function bike(id, scene) {
    const lightOn = ['night', 'fog', 'rain', 'thunder', 'snow'].includes(scene);
    return `<g>
      <ellipse cx="160" cy="236" rx="140" ry="7" fill="#000" opacity=".22"/>
      ${wheel(70, 200, id)}${wheel(250, 200, id)}
      <!-- Auspuff -->
      <path d="M110 214 h-70 q-10 0-10-7 v-2 h80z" fill="url(#chrome${id})"/>
      <!-- Motorblock (Boxer) -->
      <rect x="120" y="176" width="72" height="34" rx="10" fill="#30343b"/>
      <rect x="112" y="186" width="20" height="18" rx="6" fill="url(#chrome${id})"/>
      <rect x="182" y="186" width="20" height="18" rx="6" fill="url(#chrome${id})"/>
      <!-- Gabel -->
      <path d="M232 132 L250 200" stroke="url(#chrome${id})" stroke-width="8" stroke-linecap="round"/>
      <!-- Koffer + Topcase -->
      <rect x="30" y="150" width="78" height="40" rx="12" fill="url(#paint${id})"/>
      <rect x="36" y="157" width="66" height="4" rx="2" fill="#c5a3a9" opacity=".6"/>
      <rect x="22" y="104" width="62" height="44" rx="14" fill="url(#paint${id})"/>
      <rect x="28" y="112" width="50" height="4" rx="2" fill="#c5a3a9" opacity=".6"/>
      <rect x="18" y="128" width="8" height="8" rx="2" fill="#ff3b3b"/>
      <!-- Rahmen/Verkleidung -->
      <path d="M86 150 Q100 140 128 146 L210 140 Q238 128 262 150 Q270 170 248 176 L120 182 Q92 180 86 150z" fill="url(#paint${id})"/>
      <!-- Sitzbank -->
      <path d="M78 140 q8-12 30-10 l26 6 q10 4 24 0 l12-2 v12 l-92 4z" fill="#1d1f24"/>
      <!-- Tank / Front -->
      <path d="M182 136 Q214 112 248 118 Q276 128 278 160 L250 168 Q224 150 192 152z" fill="url(#paint${id})"/>
      <path d="M200 132 Q224 118 252 122" stroke="#d9a2ab" stroke-width="2" fill="none" opacity=".7"/>
      <!-- Scheibe -->
      <path d="M244 118 Q246 82 236 66 L252 64 Q266 92 262 124z" fill="#bfe3ff" opacity=".55" stroke="#e8f6ff" stroke-width="1.5"/>
      <!-- Scheinwerfer -->
      <ellipse cx="274" cy="146" rx="7" ry="10" fill="${lightOn ? '#fff7c2' : '#e8eef3'}" stroke="#9aa3ad" stroke-width="2"/>
      ${lightOn ? `<path d="M280 138 L320 120 L320 176 L280 156z" fill="#fff7c2" opacity=".35"/>` : ''}
      <!-- Spiegel + Lenker -->
      <path d="M222 112 l-6-14" stroke="#30343b" stroke-width="3"/><ellipse cx="214" cy="96" rx="7" ry="4" fill="#30343b"/>
      <path d="M210 118 L230 116" stroke="#30343b" stroke-width="6" stroke-linecap="round"/>
    </g>`;
  }

  function rider(id, scene, mood) {
    const skin = '#f2c4a0', skinShade = '#dba381';
    const windy = scene === 'storm';
    const beardShift = windy ? -8 : 0;
    let mouth;
    switch (mood) {
      case 'happy': mouth = `<path d="M154 92 q8 7 16 0" stroke="#5a2e1f" stroke-width="2.5" fill="none" stroke-linecap="round"/>`; break;
      case 'grumpy': mouth = `<path d="M154 96 q8 -6 16 0" stroke="#5a2e1f" stroke-width="2.5" fill="none" stroke-linecap="round"/>`; break;
      case 'shock': mouth = `<ellipse cx="162" cy="95" rx="4.5" ry="5.5" fill="#5a2e1f"/>`; break;
      case 'sweat': mouth = `<path d="M154 94 q8 4 16 0" stroke="#5a2e1f" stroke-width="2.5" fill="none" stroke-linecap="round"/>`; break;
      default: mouth = `<path d="M155 94 h14" stroke="#5a2e1f" stroke-width="2.5" stroke-linecap="round"/>`;
    }
    const jacketColor = scene === 'rain' || scene === 'thunder' ? '#f4c430' : '#2b2b2b';
    const vest = scene === 'rain' || scene === 'thunder'
      ? `<path d="M118 108 Q150 96 182 110 L196 160 Q160 176 118 166z" fill="#f4c430" opacity=".95"/><path d="M130 112 L134 164" stroke="#d9a400" stroke-width="2"/>`
      : '';
    const scarf = (scene === 'cold' || scene === 'snow')
      ? `<path d="M140 104 q22 10 42 0 l2 10 q-24 10 -46 0z" fill="#c0392b"/><path d="M144 112 l-14 26 l10 2 l12-24z" fill="#c0392b"/>`
      : `<path d="M146 104 q16 8 32 0" stroke="${skinShade}" stroke-width="3" fill="none"/>`;
    const sweat = mood === 'sweat'
      ? `<path d="M182 70 q4 6 0 9 q-4 -3 0 -9z" fill="#7cc7ff"/><path d="M140 76 q4 6 0 9 q-4 -3 0 -9z" fill="#7cc7ff"/>`
      : '';
    const snowCap = scene === 'snow' ? `<path d="M140 58 q22 -14 44 0 q-22 -4 -44 0z" fill="#fff"/>` : '';
    const shades = (scene === 'sun' || scene === 'heat')
      ? `<g><rect x="149" y="73" width="14" height="8" rx="3" fill="#111"/><rect x="167" y="73" width="14" height="8" rx="3" fill="#111"/><path d="M163 76 h4" stroke="#111" stroke-width="2"/><path d="M149 76 l-8 -2" stroke="#111" stroke-width="2"/></g>`
      : `<g fill="#2b2b2b"><circle cx="157" cy="77" r="2.4"/><circle cx="174" cy="77" r="2.4"/></g><path d="M151 71 l10 1 M169 71 l10 -1" stroke="#9aa0a6" stroke-width="2.5" stroke-linecap="round"/>`;
    return `<g>
      <!-- Bein (hinten, Schatten) -->
      <path d="M136 156 Q160 168 182 160 L188 196 l-10 2 l-6-28 Q150 176 132 168z" fill="#1f2a44"/>
      <!-- Stiefel -->
      <path d="M176 192 h18 q6 0 6 6 v4 h-26z" fill="#141414"/>
      <!-- Oberschenkel vorne -->
      <path d="M128 150 Q160 150 192 158 L196 172 Q160 172 126 170z" fill="#23304f"/>
      <!-- Torso / Bauch -->
      <path d="M118 112 Q150 96 184 110 Q206 132 198 158 Q176 176 136 170 Q114 158 118 112z" fill="#e9e3d5"/>
      <ellipse cx="178" cy="144" rx="35" ry="30" fill="#e9e3d5"/>
      <path d="M160 168 q22 6 46 -8" stroke="#cfc6b3" stroke-width="2" fill="none"/>
      <ellipse cx="190" cy="140" rx="2" ry="3" fill="#cfc6b3"/>
      <path d="M118 112 Q134 104 146 104 L150 168 Q132 168 122 160z" fill="${jacketColor}"/>
      <path d="M178 106 Q192 112 196 126 L188 128 Q182 116 172 110z" fill="${jacketColor}"/>
      <circle cx="132" cy="128" r="3" fill="#c8c8c8"/>
      ${vest}
      <!-- Arm -->
      <path d="M150 112 Q186 116 214 118 L214 128 Q182 130 146 126z" fill="${scene === 'rain' || scene === 'thunder' ? '#f4c430' : '#2b2b2b'}"/>
      <ellipse cx="216" cy="122" rx="7" ry="6" fill="${(scene === 'cold' || scene === 'snow') ? '#2b2b2b' : skin}"/>
      ${scarf}
      <!-- Kopf -->
      <g transform="translate(${beardShift / 4} 0)">
        <ellipse cx="164" cy="78" rx="21" ry="23" fill="${skin}"/>
        <ellipse cx="143" cy="80" rx="5" ry="7" fill="${skinShade}"/>
        <!-- Glatze mit grauem Haarkranz -->
        <path d="M143 74 q-2 -14 6 -20 M184 74 q2 -14 -6 -20" stroke="#c9ccd1" stroke-width="6" fill="none" stroke-linecap="round"/>
        <ellipse cx="160" cy="60" rx="9" ry="3" fill="#fff" opacity=".35"/>
        ${snowCap}
        <!-- Nase -->
        <ellipse cx="183" cy="84" rx="5" ry="4.5" fill="#e8a988"/>
        ${shades}
        <!-- Rauschebart -->
        <path d="M144 84 Q146 112 164 118 Q${180 + beardShift} 116 ${186 + beardShift} 92 Q176 98 164 98 Q152 98 144 84z" fill="#d9dcdf"/>
        <path d="M150 90 q12 -6 30 0" stroke="#c4c8cd" stroke-width="5" fill="none" stroke-linecap="round"/>
        ${mouth}
        ${sweat}
      </g>
    </g>`;
  }

  function fogOverlay(scene) {
    if (scene !== 'fog') return '';
    return `<g fill="#fff" opacity=".55"><rect x="-10" y="120" width="340" height="18" rx="9"/><rect x="20" y="160" width="300" height="16" rx="8"/><rect x="-20" y="196" width="280" height="16" rx="8"/></g>`;
  }

  let uid = 0;
  function renderRider(scene, opts = {}) {
    const id = 'r' + (uid++);
    const s = SCENES[scene] || SCENES.cloudy;
    const svg = `<svg viewBox="0 0 320 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Motorradfahrer: ${s.line}">
      ${sky(scene, id)}${bike(id, scene)}${rider(id, scene, s.mood)}${fogOverlay(scene)}</g></svg>`;
    return opts.withLine === false ? svg : { svg, line: s.line };
  }

  window.Rider = { renderRider, pickScene, SCENES };
})();
