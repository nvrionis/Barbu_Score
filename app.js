// — State —
let players = [],
    enabledContracts = [],
    rounds = [],
    currentDealerIndex = 0,
    prevRankOrder = [];

// — Elements —
const setupScreen   = document.getElementById('setup-screen'),
      setupForm     = document.getElementById('setup-form'),
      pnContainer   = document.getElementById('player-names'),
      ctContainer   = document.getElementById('contract-toggle'),

      gameScreen    = document.getElementById('game-screen'),
      dealerEl      = document.getElementById('current-dealer'),
      contractSel   = document.getElementById('contract-select'),
      scoreGrid     = document.getElementById('score-inputs'),
      addBtn        = document.getElementById('add-round'),
      roundBody     = document.querySelector('#round-table tbody'),

      clearBtn      = document.getElementById('clear-data'),
      restartBtn    = document.getElementById('reset-game'),

      endScreen     = document.getElementById('end-screen'),
      podiumEl      = document.getElementById('podium'),
      winnerEl      = document.getElementById('winner-announcement');

// — Emojis for Contracts —
const EMOJI = {
  Hearts: '❤️',
  Queens: '👑',
  'King of Spades': '♠️',
  Tricks: '🃏',
  'Last Two Tricks': '🏁',
  Domino: '🁢',
  Barbu: '🧩'
};

// — Persistence Helpers —
function saveState() {
  localStorage.setItem('barbu',
    JSON.stringify({ players, enabledContracts, rounds, currentDealerIndex })
  );
}
function loadState() {
  const data = JSON.parse(localStorage.getItem('barbu') || '{}');
  if (Array.isArray(data.players) && Array.isArray(data.enabledContracts)) {
    players = data.players;
    enabledContracts = data.enabledContracts;
    rounds = data.rounds || [];
    currentDealerIndex = data.currentDealerIndex || 0;
  } else {
    localStorage.removeItem('barbu');
  }
}

// — Initialize App —
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  players.length ? initGame() : initSetup();
});

// — Setup Screen —
function initSetup() {
  // Player name inputs
  pnContainer.innerHTML = '';
  for (let i = 1; i <= 6; i++) {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.name = 'player';
    inp.placeholder = `Player ${i} Name`;
    pnContainer.append(inp);
  }
  // Contract toggles
  ctContainer.innerHTML = '';
  Object.entries(EMOJI).forEach(([contract, emoji]) => {
    const lab = document.createElement('label'),
          cb  = document.createElement('input'),
          sp  = document.createElement('span');
    cb.type    = 'checkbox';
    cb.name    = 'contract';
    cb.value   = contract;
    cb.checked = true;
    sp.textContent = `${emoji} ${contract}`;
    lab.append(cb, sp);
    ctContainer.append(lab);
  });

  // Handle start
  setupForm.onsubmit = e => {
    e.preventDefault();
    players = Array.from(
      pnContainer.querySelectorAll('input')
    ).map(i => i.value.trim()).filter(v => v);
    if (players.length < 3 || players.length > 6) {
      return alert('Enter between 3 and 6 player names.');
    }
    enabledContracts = Array.from(
      ctContainer.querySelectorAll('input[type=checkbox]')
    ).filter(cb => cb.checked).map(cb => cb.value);
    if (!enabledContracts.length) {
      return alert('Select at least one contract.');
    }
    rounds = [];
    currentDealerIndex = 0;
    saveState();
    initGame();
  };
}

// — Start Game —
function initGame() {
  setupScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');

  clearBtn.onclick = () => {
    if (confirm('Reset all data and restart?')) {
      localStorage.removeItem('barbu');
      location.reload();
    }
  };
  restartBtn.onclick = clearBtn.onclick;

  contractSel.onchange = () => {
    buildScoreInputs();
    validateForm();
  };

  renderTopBar();
  renderTableHeader();
  renderProgressGrid();
  nextRound();
  renderRounds();
}

// — RENDER STICKY TOP BAR (with tie-aware ranking) —
function renderTopBar() {
  // Compute total scores
  const totals = {};
  players.forEach(p => totals[p] = 0);
  rounds.forEach(r => 
    players.forEach(p => totals[p] += r.scores[p] || 0)
  );

  // Sort players by ascending score (lower is better)
  const sorted = players
    .map(p => ({ name: p, score: totals[p] }))
    .sort((a, b) => a.score - b.score);

  // Assign competition ranking (ties get same rank; next rank skips)
  let lastScore = null, lastRank = 0;
  const ranked = sorted.map((o, i) => {
    const score = o.score;
    // if same score as last, reuse lastRank; else rank = i+1
    const rank = (score === lastScore) ? lastRank : (i + 1);
    lastScore = score;
    lastRank  = rank;
    return { name: o.name, score, rank };
  });

  //Render into the top-bar
  const info = document.getElementById('player-info');
  info.innerHTML = ranked.map(o => {
    // Determine CSS class
    let cls;
    if (o.rank === 1) cls = 'first';
    else if (o.rank === 2) cls = 'second';
    else if (o.rank === 3) cls = 'third';
    else cls = `rank-${o.rank}`;  // e.g. rank-4, rank-5, etc.

    return `
      <div class="player-score ${cls}" data-player="${o.name}">
        ${o.rank}. ${o.name}: ${o.score}
      </div>
    `;
  }).join('');

  // Pulse animation on rank changes
  ranked.forEach(o => {
    const el = info.querySelector(`[data-player="${o.name}"]`);
    const prev = prevRankOrder.indexOf(o.name);
    if (prev >= 0 && prev !== (o.rank-1)) {
      el.classList.add('pulse');
      el.addEventListener('animationend',
        () => el.classList.remove('pulse'),
        { once: true }
      );
    }
  });

  // Save this ordering for next comparison
  prevRankOrder = ranked.map(o => o.name);
}


// — Render Round Table Header —
function renderTableHeader() {
  const row = document.getElementById('round-table-header');
  row.innerHTML =
    '<th>#</th>' +
    '<th>Dealer</th>' +
    '<th>🎮</th>' +
    players.map(p => `<th>${p}</th>`).join('');
}

// — Render Progress Grid (✅ vs ⭕) —
function renderProgressGrid() {
  const tbl   = document.getElementById('progress-grid');
  const headR = tbl.querySelector('thead tr');
  const body  = tbl.querySelector('tbody');

  // Clear
  headR.innerHTML = '<th>Player</th>';
  body.innerHTML  = '';

  // Header = contract emojis
  enabledContracts.forEach(c => {
    const th = document.createElement('th');
    th.textContent = EMOJI[c];
    headR.append(th);
  });

  // One row per player
  players.forEach(p => {
    const tr = document.createElement('tr');
    // Name cell
    const tdName = document.createElement('td');
    tdName.textContent = p;
    tr.append(tdName);
    // One ✅/⭕ per contract
    enabledContracts.forEach(c => {
      const td = document.createElement('td');
      const done = rounds.some(r => r.dealer === p && r.contract === c);
      td.textContent = done ? '✅' : '⭕';
      tr.append(td);
    });
    body.append(tr);
  });
}

// — Advance to Next Round & Populate Contract Dropdown —
function nextRound() {
  const taken = rounds
    .filter(r => r.dealer === players[currentDealerIndex])
    .map(r => r.contract);
  const avail = enabledContracts.filter(c => !taken.includes(c));

  contractSel.innerHTML = avail
    .map(c => `<option value="${c}">${EMOJI[c]} ${c}</option>`)
    .join('');

  buildScoreInputs();
  validateForm();
}

// — Build Score Inputs for Selected Contract —
function buildScoreInputs() {
  const c = contractSel.value;
  dealerEl.textContent = players[currentDealerIndex];
  scoreGrid.innerHTML = '';

  // Helper to make a labeled <select>
  function makeSelect(labelText, options) {
    const w = document.createElement('div');
    w.className = 'score-item';
    const lbl = document.createElement('label');
    lbl.textContent = labelText;
    w.append(lbl);
    const dd = document.createElement('select');
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      dd.append(opt);
    });
    w.append(dd);
    scoreGrid.append(w);
    return dd;
  }

  // 1) Hearts, Queens, Tricks → dynamic group-sum dropdowns
  if (['Hearts','Queens','Tricks'].includes(c)) {
    let totalCount;
    if      (c === 'Hearts') totalCount = [4,5].includes(players.length)?13:12;
    else if (c === 'Queens') totalCount = 4;
    else                     totalCount = {3:16,4:13,5:10,6:8}[players.length];

    // One dropdown per player
    const selects = players.map(p =>
      makeSelect(p, Array.from({length:totalCount+1},(_,i)=>i))
    );

    // On change → recalc sum & shrink others
    const adjust = () => {
      const sum = selects.reduce((s,dd)=>s + Number(dd.value), 0);
      selects.forEach(dd => {
        const cur = Number(dd.value),
              other = sum - cur,
              max = totalCount - other;
        dd.innerHTML = Array.from({length:max+1},(_,i)=>
          `<option value="${i}">${i}</option>`
        ).join('');
        dd.value = Math.min(cur, max);
      });
      validateForm();
    };
    selects.forEach(dd => dd.addEventListener('change', adjust));
  }

  // 2) King of Spades → exactly one radio
  else if (c === 'King of Spades') {
    const group = 'king-spade';
    players.forEach(p => {
      const w = document.createElement('div');
      w.className = 'score-item';
      const rd = document.createElement('input');
      rd.type = 'radio';
      rd.name = group;
      rd.value = p;
      rd.addEventListener('change', validateForm);
      const lbl = document.createElement('label');
      lbl.textContent = ` ${p}`;
      w.append(rd, lbl);
      scoreGrid.append(w);
    });
  }

  // 3) Last Two Tricks → single dropdown (None/Pre-last/Last) with mutual exclusion
  else if (c === 'Last Two Tricks') {
    const selects = players.map(p =>
      makeSelect(p, ['None','Pre-last','Last'])
    );
    const adjust = () => {
      const preCount  = selects.filter(dd=>dd.value==='Pre-last').length;
      const lastCount = selects.filter(dd=>dd.value==='Last').length;
      selects.forEach(dd => {
        const cur = dd.value;
        const opts = ['None'];
        if (preCount < 1 || cur==='Pre-last') opts.push('Pre-last');
        if (lastCount< 1 || cur==='Last')     opts.push('Last');
        dd.innerHTML = opts.map(o=>`<option>${o}</option>`).join('');
        dd.value = opts.includes(cur)? cur : 'None';
      });
      validateForm();
    };
    selects.forEach(dd => dd.addEventListener('change', adjust));
  }

  // 4) Domino & Barbu → simple selects or number inputs
  else {
    players.forEach(p => {
      if (c === 'Domino') {
        makeSelect(p, ['', '-100','-50','5','10','15','20','25']);
      } else {
        // Barbu: raw number (later halved)
        const w = document.createElement('div');
        w.className = 'score-item';
        const lbl = document.createElement('label');
        lbl.textContent = p;
        w.append(lbl);
        const inp = document.createElement('input');
        inp.type = 'number'; inp.min = 0; inp.value = 0;
        inp.addEventListener('input', validateForm);
        w.append(inp);
        scoreGrid.append(w);
      }
    });
  }

  // Attach generic validation to all controls
  Array.from(scoreGrid.querySelectorAll('select,input')).forEach(el =>
    el.addEventListener('change', validateForm)
  );
  addBtn.onclick = submitRound;
}

// — Validate Inputs & Enable/Disable Submit —
function validateForm() {
  const c = contractSel.value;
  let ok = true;

  // Gather raw counts for group contracts and flags
  const counts = Array.from(
    scoreGrid.querySelectorAll('select,input')
  ).map(el => {
    if (c==='King of Spades' && el.type==='radio')
      return el.checked ? 1 : 0;
    if (el.tagName === 'SELECT') {
      if (c === 'Last Two Tricks') {
        return el.value==='Last' || el.value==='Pre-last' ? 1 : 0;
      }
      return Number(el.value) || 0;
    }
    return Number(el.value) || 0;
  });

  const sum = arr => arr.reduce((a,b)=>a+b,0);

  if (['Hearts','Queens','Tricks'].includes(c)) {
    let req = (c === 'Hearts')
      ? ([4,5].includes(players.length)?13:12)
      : (c==='Queens'?4:{3:16,4:13,5:10,6:8}[players.length]);
    if (sum(counts) !== req) ok = false;
  }
  else if (c === 'King of Spades') {
    if (counts.filter(v=>v===1).length !== 1) ok = false;
  }
  else if (c === 'Last Two Tricks') {
    const sel = Array.from(scoreGrid.querySelectorAll('select'));
    const pre = sel.filter(dd=>dd.value==='Pre-last').length;
    const last= sel.filter(dd=>dd.value==='Last').length;
    if (pre!==1 || last!==1) ok = false;
  }
  else if (c === 'Domino') {
    const raw = Array.from(scoreGrid.querySelectorAll('select'))
                     .map(dd => Number(dd.value)||0);
    if (raw.filter(v=>v===-100).length!==1 || raw.filter(v=>v===-50).length!==1)
      ok = false;
  }
  // Barbu always OK

  addBtn.disabled = !ok;
}

// — Submit Round & Advance Dealer —
function submitRound() {
  const c = contractSel.value;
  const scores = {};

  scoreGrid.querySelectorAll('select,input').forEach(el => {
    let p, v = 0;

    if (c==='King of Spades' && el.type==='radio') {
      p = el.value;
      v = el.checked?80:0;
    }
    else if (el.tagName==='SELECT') {
      p = el.parentElement.querySelector('label').textContent;
      if (c==='Last Two Tricks') {
        v = el.value==='Last'?80: el.value==='Pre-last'?40:0;
      } else {
        v = Number(el.value)||0;
        if      (c==='Hearts') v *= 10;
        else if (c==='Queens') v *= 30;
        else if (c==='Tricks') v *= 10;
      }
    }
    else {
      p = el.parentElement.querySelector('label').textContent;
      v = Number(el.value)||0;
    }

    scores[p] = (scores[p]||0) + v;
  });

  rounds.push({
    dealer: players[currentDealerIndex],
    contract: c,
    scores
  });
  currentDealerIndex = (currentDealerIndex + 1) % players.length;
  saveState();

  renderTopBar();
  renderProgressGrid();
  appendRow();
  nextRound();
}

// — Append One Row to the Table —
function appendRow() {
  const idx = rounds.length - 1,
        r   = rounds[idx],
        tr  = document.createElement('tr');
  tr.classList.add('slide-in');

  tr.innerHTML = `
    <td>${idx+1}</td>
    <td>${r.dealer}</td>
    <td>${EMOJI[r.contract]}</td>
    ${players.map(p=>`<td>${r.scores[p]||0}</td>`).join('')}
  `;
  roundBody.append(tr);

  // If all rounds done → finish
  if (rounds.length >= players.length * enabledContracts.length) {
    finishGame();
  }
}

// — Re-render All Past Rounds (on load) —
function renderRounds() {
  roundBody.innerHTML = '';
  rounds.forEach((_,i) => appendRow());
}

// — Game Over & Podium Screen —
function finishGame(){
  gameScreen.classList.add('hidden');
  endScreen.classList.remove('hidden');

  const totals = {}, arr = [];
  players.forEach(p => totals[p] = 0);
  rounds.forEach(r => players.forEach(p => totals[p] += r.scores[p]||0));
  players.forEach(p => arr.push({ p, s: totals[p] }));
  arr.sort((a,b) => a.s - b.s);

  // 1) Podium for top 3
  podiumEl.innerHTML = arr.slice(0,3).map((o,i) => `
    <div class="place ${['first','second','third'][i]}">
      <div class="medal">${['🥇','🥈','🥉'][i]}</div>
      <div class="name">${o.p}</div>
      <div class="score">${o.s}</div>
    </div>
  `).join('');

  // 2) Others: sad 😢 except the very last gets heavy crying 😭
  const others = arr.slice(3);
  others.forEach((o, idx) => {
    const isLast = idx === others.length - 1;
    const face  = isLast ? '😭' : '😢';
    const d = document.createElement('div');
    d.className = 'other';
    d.textContent = `${face} ${o.p}: ${o.s}`;
    podiumEl.append(d);
  });

  // 3) Winner announcement (if you still have this)
  winnerEl.textContent = `🏆 ${arr[0].p} Wins!`;
}
