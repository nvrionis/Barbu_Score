// — State —
let players = [],
    enabledContracts = [],
    rounds = [],
    currentDealerIndex = 0,
    prevRankOrder = [],
    editIndex = null;

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

      exportBtn    = document.getElementById('export-btn'),
      importBtn    = document.getElementById('import-btn'),
      importInput  = document.getElementById('import-input'),
      infoBtn      = document.getElementById('info-btn'),
      closeInfoBtn = document.getElementById('close-info-btn');

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


function getDealerEmoji(r) {
  const scores       = players.map(p => r.scores[p] || 0);
  const dealerScore  = r.scores[r.dealer] || 0;
  const minScore     = Math.min(...scores);
  const maxScore     = Math.max(...scores);
  const countMin     = scores.filter(s => s === minScore).length;
  const countMax     = scores.filter(s => s === maxScore).length;

  if ((dealerScore === minScore && countMin === 1) ||
      (dealerScore === 0 && dealerScore === minScore)) {
    return '🌟';
  }
  if (dealerScore === maxScore && countMax === 1) {
    return '💩';
  }
  return '';
}


// — Persistence Helpers —
function saveState() {
  localStorage.setItem('barbu',
    JSON.stringify({ players, enabledContracts, rounds, currentDealerIndex })
  );
}
function loadState() {
  const data = JSON.parse(localStorage.getItem('barbu') || '{}');
  if (
    Array.isArray(data.players) &&
    Array.isArray(data.enabledContracts)
  ) {
    players            = data.players;
    enabledContracts   = data.enabledContracts;
    rounds             = Array.isArray(data.rounds) ? data.rounds : [];
    currentDealerIndex = typeof data.currentDealerIndex === 'number'
                         ? data.currentDealerIndex
                         : 0;
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

// ----------------------------------
// EXPORT / IMPORT LOGIC
// ----------------------------------
function exportGame() {
  const data = {
    players,
    enabledContracts,
    rounds,
    currentDealerIndex,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `barbu-game-${new Date().toISOString()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importGameFile(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      if (
        !Array.isArray(obj.players) ||
        !Array.isArray(obj.enabledContracts)
      ) {
        throw new Error('Invalid game file');
      }

      // 1) Restore full state
      players            = obj.players;
      enabledContracts   = obj.enabledContracts;
      rounds             = Array.isArray(obj.rounds) ? obj.rounds : [];
      currentDealerIndex = typeof obj.currentDealerIndex === 'number'
                           ? obj.currentDealerIndex
                           : 0;

      // 2) Persist it
      saveState();

      // 3) Restart the app in “in-game” mode, which:
      //    • Hides setup, shows game screen
      //    • Wires up contractSel.onchange
      //    • Renders top bar, table header, progress grid, dropdown & inputs, etc.
      initGame();
    } catch (e) {
      alert('Failed to import game: ' + e.message);
    }
  };
  reader.readAsText(file);
}



// ----------------------------------
// INFO MODAL TOGGLING
// ----------------------------------
const infoScreen = document.getElementById('info-screen');

infoBtn.addEventListener('click', () => {
  infoScreen.classList.toggle('hidden');
});

closeInfoBtn.addEventListener('click', () =>
  document.getElementById('info-screen').classList.add('hidden')
);

// ----------------------------------
// HOOK UP EXPORT/IMPORT ON LOAD
// ----------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // load your saved state first…
  loadState();

  // wire up import/export
  exportBtn.addEventListener('click', exportGame);
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', importGameFile);

  // then start the app
  players.length ? initGame() : initSetup();
});


// — Render Round Table Header —
// function renderTableHeader() {
//   const row = document.getElementById('round-table-header');
//   row.innerHTML =
//     '<th>#</th>' +
//     '<th>Dealer</th>' +
//     '<th>🎮</th>' +
//     players.map(p => `<th>${p}</th>`).join('') +
//     '<th>Edit</th>';
// }

function renderTableHeader() {
  const row = document.getElementById('round-table-header');
  row.innerHTML =
    '<th>#</th>' +
    '<th>Dealer</th>' +
    '<th>🎮</th>' +
    players.map(p => {
      // if the player is “Τσιφ” (Greek) or “Tsif” (Latin), append a fox
      const fox = (p === 'Τσιφ' || p === 'Tsif') ? ' 🦊' : '';
      return `<th>${p}${fox}</th>`;
    }).join('') +
    '<th>Edit</th>';
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


// — Helper: total “raw” points for each contract —
function getTotalForContract(c) {
  switch (c) {
    case 'Hearts':          return (players.length <= 4 ? 13 : 12) * 10;
    case 'Queens':          return 4 * 30;
    case 'Tricks':          return ({3:16,4:13,5:10,6:8}[players.length] * 10);
    case 'Last Two Tricks': return 40 + 80;
    default:                 return 0;
  }
}


// — Build Score Inputs for Selected Contract —
function buildScoreInputs() {
  window.barbuAdjustData = {}; // Reset adjustment registry

  const c = contractSel.value;
  dealerEl.textContent = players[currentDealerIndex];
  scoreGrid.innerHTML = '';

  function makeSelect(options, selected = '') {
    const sel = document.createElement('select');
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      if (o === selected) opt.selected = true;
      sel.append(opt);
    });
    return sel;
  }

  function createPlayerBlock(p) {
    const card = document.createElement('div');
    card.className = 'barbu-player-block';

    const title = document.createElement('div');
    title.className = 'player-title';
    title.textContent = p;
    card.append(title);

    return card;
  }

  if (['Hearts', 'Queens', 'Tricks'].includes(c)) {
    let totalCount;
    if (c === 'Hearts') totalCount = [4, 5].includes(players.length) ? 13 : 12;
    else if (c === 'Queens') totalCount = 4;
    else totalCount = { 3: 16, 4: 13, 5: 10, 6: 8 }[players.length];

    const selects = [];

    players.forEach(p => {
      const block = createPlayerBlock(p);
      const label = document.createElement('label');
      label.textContent = `${EMOJI[c]} ${c}`;
      label.dataset.player = p;
      const sel = makeSelect(Array.from({ length: totalCount + 1 }, (_, i) => i));
      selects.push(sel);

      const item = document.createElement('div');
      item.className = 'score-item';
      item.append(label, sel);

      // —— ADD THIS ⚡ BUTTON —— //
      const rem = document.createElement('button');
      rem.type = 'button';
      rem.textContent = '⚡';
      rem.title = 'Give me the rest';
      rem.className = 'assign-rest-btn';
      rem.addEventListener('click', () => {
        // sum up the *card counts* others have chosen
        const usedCount = selects
          .filter(s2 => s2 !== sel)
          .reduce((sum, s2) => sum + Number(s2.value), 0);
        const restCount = totalCount - usedCount;
        sel.value = restCount;
        sel.dispatchEvent(new Event('change'));
      });
      item.append(rem);
      // —— end “give me the rest” —— //

      block.append(item);
      scoreGrid.append(block);
    });

    const adjust = () => {
      const values = selects.map(sel => Number(sel.value) || 0);
      const totalUsed = values.reduce((a, b) => a + b, 0);
      selects.forEach((sel, i) => {
        const current = values[i];
        const max = totalCount - (totalUsed - current);
        const selected = sel.value;
        sel.innerHTML = Array.from({ length: max + 1 }, (_, j) =>
          `<option value="${j}">${j}</option>`
        ).join('');
        sel.value = selected > max ? max : selected;
      });
      validateForm();
    };

    selects.forEach(sel => sel.addEventListener('change', adjust));
    adjust();
  } else {
    const lttSelects = [];
    const barbuLTTSelects = [];

    players.forEach(p => {
      const block = createPlayerBlock(p);

      if (c === 'King of Spades') {
        const rd = document.createElement('input');
        rd.type = 'radio';
        rd.name = 'king-spade';
        rd.value = p;
        rd.addEventListener('change', validateForm);

        const label = document.createElement('label');
        label.style.fontWeight = 'normal';
        label.dataset.player = p;
        label.innerHTML = `${EMOJI[c]} ${c} `;
        label.append(rd);


        const item = document.createElement('div');
        item.className = 'score-item';
        item.append(label);
        block.append(item);
      }

      else if (c === 'Last Two Tricks') {
        const label = document.createElement('label');
        label.textContent = `${EMOJI[c]} ${c}`;
        label.dataset.player = p;

        const sel = makeSelect(['None', 'Pre-last', 'Last', 'Both']);
        lttSelects.push(sel);

        const item = document.createElement('div');
        item.className = 'score-item';
        item.append(label, sel);

        // —— ADD ⚡ BUTTON —— //
        const remLTT = document.createElement('button');
        remLTT.type = 'button';
        remLTT.textContent = '⚡';
        remLTT.title = 'Give me the rest';
        remLTT.className = 'assign-rest-btn';
        remLTT.addEventListener('click', () => {
          // sum other LTT selects
          const mapping = { 'None':0, 'Pre-last':40, 'Last':80, 'Both':120 };
          const used = lttSelects
            .filter(s2 => s2 !== sel)
            .reduce((sum, s2) => sum + mapping[s2.value], 0);
          const remPts = 120 - used;
          const inv = { 0:'None', 40:'Pre-last', 80:'Last', 120:'Both' };
          sel.value = inv[remPts];
          sel.dispatchEvent(new Event('change'));
        });
        item.append(remLTT);
        // —— end LTT rest —— //

        block.append(item);
      }

      else if (c === 'Domino') {
        const item = document.createElement('div');
        item.className = 'score-item';
      
        // 1) Domino label
        const label = document.createElement('label');
        label.textContent = `${EMOJI[c]} ${c}`;
        label.dataset.player = p;
        item.append(label);
      
        // 2) “First” radio
        const firstRd = document.createElement('input');
        firstRd.type = 'radio';
        firstRd.name = 'domino-first';
        firstRd.value = p;
        firstRd.addEventListener('change', validateForm);
        const firstLab = document.createElement('label');
        firstLab.textContent = '1st';
        firstLab.append(firstRd);
        item.append(firstLab);
      
        // 3) “Second” radio
        const secondRd = document.createElement('input');
        secondRd.type = 'radio';
        secondRd.name = 'domino-second';
        secondRd.value = p;
        secondRd.addEventListener('change', validateForm);
        const secondLab = document.createElement('label');
        secondLab.textContent = '2nd';
        secondLab.append(secondRd);
        item.append(secondLab);
      
        // 4) “Cards Left” dropdown
        const maxCards = 10; // or whatever maximum you want
        const cardSel = makeSelect(
          Array.from({ length: maxCards + 1 }, (_, i) => i)
        );
        cardSel.dataset.player = p;         // ← **Important**: ensure this line exists
        cardSel.addEventListener('change', validateForm);
        item.append(cardSel);
      
        block.append(item);
      }
      

      else if (c === 'Barbu') {
        block.dataset.playerGroup = p;
        const subContracts = ['Hearts', 'Queens', 'Tricks', 'King of Spades', 'Last Two Tricks'];
        subContracts.forEach(sub => {
          if (!enabledContracts.includes(sub)) return;

          const item = document.createElement('div');
          item.className = 'score-item';
          const label = document.createElement('label');
          label.textContent = `${EMOJI[sub]} ${sub}`;
          label.dataset.player = p;

          if (['Hearts', 'Queens', 'Tricks'].includes(sub)) {
            let totalCount = (sub === 'Hearts') ? ([4, 5].includes(players.length) ? 13 : 12)
              : (sub === 'Queens' ? 4 : { 3: 16, 4: 13, 5: 10, 6: 8 }[players.length]);
            const sel = makeSelect(Array.from({ length: totalCount + 1 }, (_, i) => i));
            sel.dataset.contract = sub;

            if (!window.barbuAdjustData) window.barbuAdjustData = {};
            if (!window.barbuAdjustData[sub]) window.barbuAdjustData[sub] = [];
            window.barbuAdjustData[sub].push(sel);

            sel.addEventListener('change', () => {
              adjustBarbuSelects(sub, totalCount);
              validateForm();
            });
            item.append(label, sel);

            // —— ADD ⚡ for Barbu sub-contract —— //
            const remB = document.createElement('button');
            remB.type = 'button';
            remB.textContent = '⚡';
            remB.title = 'Give me the rest';
            remB.className = 'assign-rest-btn';
            remB.addEventListener('click', () => {
              // sum up the *card counts* others have chosen for this subgame
              const list = window.barbuAdjustData[sub];
              const usedCount = list
                .filter(s2 => s2 !== sel)
                .reduce((sum, s2) => sum + Number(s2.value), 0);
              const restCount = totalCount - usedCount;
              sel.value = restCount;
              sel.dispatchEvent(new Event('change'));
            });
            item.append(remB);
            // —— end Barbu rest —— //
            
          } else if (sub === 'King of Spades') {
            const rd = document.createElement('input');
            rd.type = 'radio';
            rd.name = 'barbu-king-spade';
            rd.value = p;
            rd.addEventListener('change', validateForm);
            rd.dataset.contract = 'King of Spades'; // ✅ Ensure this is set
          
            const label = document.createElement('label');
            label.style.fontWeight = 'normal';
            label.dataset.player = p;
            label.innerHTML = `${EMOJI[sub]} ${sub} `;
            label.append(rd); // ✅ Move radio button to the right
          
            item.append(label);
          }
          
          else if (sub === 'Last Two Tricks') {
            const sel = makeSelect(['None','Pre-last','Last','Both']);
            sel.dataset.contract = sub;
            barbuLTTSelects.push(sel);
          
            const item = document.createElement('div');
            item.className = 'score-item';
            item.append(label, sel);
          
            // ⚡ rest button
            const rem = document.createElement('button');
            rem.type = 'button';
            rem.textContent = '⚡';
            rem.title = 'Give me the rest';
            rem.className = 'assign-rest-btn';
            rem.addEventListener('click', () => {
              const mapping = { 'None': 0, 'Pre-last': 40, 'Last': 80, 'Both': 120 };
              let used = 0;
              barbuLTTSelects.forEach(s2 => {
                if (s2 !== sel) used += mapping[s2.value] || 0;
              });
              const remPts = 120 - used;
              const inv = { 0: 'None', 40: 'Pre-last', 80: 'Last', 120: 'Both' };
              sel.value = inv[remPts] || 'None';
              sel.dispatchEvent(new Event('change'));
            });
            item.append(rem);
          
            block.append(item);
          }
          

          block.append(item);
        });
      }

      scoreGrid.append(block);
    });

    function adjustLTT(selects) {
      const values = selects.map(dd => dd.value);
      selects.forEach(dd => {
        const current = dd.value;
        const others = selects.filter(x => x !== dd).map(x => x.value);

        const hasBoth = others.includes('Both');
        const hasPreOrLast = others.includes('Pre-last') || others.includes('Last');
        const preCount = values.filter(v => v === 'Pre-last').length;
        const lastCount = values.filter(v => v === 'Last').length;

        let opts = ['None'];
        if (!hasPreOrLast && (!hasBoth || current === 'Both')) opts.push('Both');
        if (!hasBoth && (preCount < 1 || current === 'Pre-last')) opts.push('Pre-last');
        if (!hasBoth && (lastCount < 1 || current === 'Last')) opts.push('Last');

        dd.innerHTML = opts.map(o => `<option>${o}</option>`).join('');
        if (!opts.includes(current)) dd.value = 'None';
        else dd.value = current;
      });
    }

    function adjustBarbuSelects(sub, totalCount) {
      const selects = window.barbuAdjustData[sub];
      if (!selects) return;
    
      const values = selects.map(sel => Number(sel.value) || 0);
      const totalUsed = values.reduce((a, b) => a + b, 0);
    
      selects.forEach((sel, i) => {
        const current = values[i];
        const max = totalCount - (totalUsed - current);
        const selected = sel.value;
    
        sel.innerHTML = Array.from({ length: max + 1 }, (_, j) =>
          `<option value="${j}">${j}</option>`
        ).join('');
        sel.value = selected > max ? max : selected;
      });
    }    

    if (lttSelects.length) {
      lttSelects.forEach(sel => sel.addEventListener('change', () => {
        adjustLTT(lttSelects);
        validateForm();
      }));
      adjustLTT(lttSelects);
    }

    if (barbuLTTSelects.length) {
      barbuLTTSelects.forEach(sel => sel.addEventListener('change', () => {
        adjustLTT(barbuLTTSelects);
        validateForm();
      }));
      adjustLTT(barbuLTTSelects);
    }
  }

  addBtn.onclick = submitRound;
  validateForm();
}


// — Validate Inputs & Enable/Disable Submit —
function validateForm() {
  const c = contractSel.value;
  let ok = true;

  const sum = arr => arr.reduce((a, b) => a + b, 0);

  // 1) Single‐contract rounds
  if (['Hearts', 'Queens', 'Tricks'].includes(c)) {
    const counts = Array.from(scoreGrid.querySelectorAll('select'))
      .map(el => Number(el.value) || 0);
    const required = c === 'Hearts'
      ? ([4,5].includes(players.length) ? 13 : 12)
      : c === 'Queens'
        ? 4
        : {3:16, 4:13, 5:10, 6:8}[players.length];
    if (sum(counts) !== required) ok = false;
  }
  else if (c === 'King of Spades') {
    const selected = scoreGrid.querySelectorAll('input[type="radio"]:checked');
    if (selected.length !== 1) ok = false;
  }
  else if (c === 'Last Two Tricks') {
    const counts = { 'Pre-last': 0, 'Last': 0, 'Both': 0 };
    scoreGrid.querySelectorAll('select').forEach(sel => {
      counts[sel.value] = (counts[sel.value] || 0) + 1;
    });
    const total = counts['Both'] * 120 + counts['Last'] * 80 + counts['Pre-last'] * 40;
    if (
      total !== 120 ||
      counts['Both'] > 1 ||
      (counts['Both'] === 0 && (counts['Pre-last'] !== 1 || counts['Last'] !== 1))
    ) ok = false;
  }
  else if (c === 'Domino') {
    // 1) Exactly one “first”
    const firstCount  = scoreGrid.querySelectorAll('input[name="domino-first"]:checked').length;
    // 2) Exactly one “second”
    const secondCount = scoreGrid.querySelectorAll('input[name="domino-second"]:checked').length;
    if (firstCount !== 1 || secondCount !== 1) {
      ok = false;
    } else {
      // 3) Ensure the same player is not both 1st and 2nd
      const fSel = scoreGrid.querySelector('input[name="domino-first"]:checked');
      const sSel = scoreGrid.querySelector('input[name="domino-second"]:checked');
      if (fSel.value === sSel.value) {
        ok = false;
      } else {
        // 4) Every “other” player (not 1st or 2nd) must choose at least 1 card left
        players.forEach(p => {
          if (p !== fSel.value && p !== sSel.value) {
            const cs = scoreGrid.querySelector(`select[data-player="${p}"]`);
            // if the dropdown is missing or value is 0 → invalid
            if (!cs || Number(cs.value) < 1) {
              ok = false;
            }
          }
        });
      }
    }
  }
  
  // 2) Barbu (multi‐contract) round
  else if (c === 'Barbu') {
    // Hearts
    if (enabledContracts.includes('Hearts')) {
      const hearts = Array.from(
        scoreGrid.querySelectorAll('select[data-contract="Hearts"]')
      ).map(el => Number(el.value) || 0);
      const reqH = [4,5].includes(players.length) ? 13 : 12;
      if (sum(hearts) !== reqH) ok = false;
    }

    // Queens
    if (enabledContracts.includes('Queens')) {
      const queens = Array.from(
        scoreGrid.querySelectorAll('select[data-contract="Queens"]')
      ).map(el => Number(el.value) || 0);
      if (sum(queens) !== 4) ok = false;
    }

    // Tricks
    if (enabledContracts.includes('Tricks')) {
      const tricks = Array.from(
        scoreGrid.querySelectorAll('select[data-contract="Tricks"]')
      ).map(el => Number(el.value) || 0);
      const reqT = {3:16, 4:13, 5:10, 6:8}[players.length];
      if (sum(tricks) !== reqT) ok = false;
    }

    // King of Spades
    if (enabledContracts.includes('King of Spades')) {
      const rd = scoreGrid.querySelectorAll('input[name="barbu-king-spade"]:checked');
      if (rd.length !== 1) ok = false;
    }

    // Last Two Tricks
    if (enabledContracts.includes('Last Two Tricks')) {
      const ltts = Array.from(
        scoreGrid.querySelectorAll('select[data-contract="Last Two Tricks"]')
      );
      const cnt = { 'Pre-last': 0, 'Last': 0, 'Both': 0 };
      ltts.forEach(sel => { cnt[sel.value] = (cnt[sel.value]||0) + 1 });
      const total = cnt['Both']*120 + cnt['Last']*80 + cnt['Pre-last']*40;
      if (
        total !== 120 ||
        cnt['Both'] > 1 ||
        (cnt['Both'] === 0 && (cnt['Pre-last'] !== 1 || cnt['Last'] !== 1))
      ) ok = false;
    }
  }

  // Enable/disable the submit button
  addBtn.disabled = !ok;
}



// — Submit Round & Advance Dealer —
function submitRound() {
  const c = contractSel.value;
  const scores = {};

  // ─── Domino branch ───
  if (c === 'Domino') {
    // For Domino, we expect:
    //  • exactly one radio named "domino-first" checked → that player gets -100
    //  • exactly one radio named "domino-second" checked → that player gets -50
    //  • every other player has a <select data-player="PlayerName"> for #cards-left
    players.forEach(p => {
      let v = 0;

      // 1) Was this player chosen as "1st"?
      const firstRadio = scoreGrid.querySelector(`input[name="domino-first"][value="${p}"]`);
      // 2) Was this player chosen as "2nd"?
      const secondRadio = scoreGrid.querySelector(`input[name="domino-second"][value="${p}"]`);
      // 3) The "cards left" dropdown must have data-player="${p}"
      const cardSelect = scoreGrid.querySelector(`select[data-player="${p}"]`);

      if (firstRadio && firstRadio.checked) {
        v = -100;
      }
      else if (secondRadio && secondRadio.checked) {
        v = -50;
      }
      else if (cardSelect) {
        // cost = 5 × (#cards left)
        const cardsLeft = Number(cardSelect.value) || 0;
        v = cardsLeft * 5;
      } else {
        // If somehow the dropdown is missing, treat as 0 cards left
        v = 0;
      }

      scores[p] = v;
    });
  }

  // ─── Non-Barbu, non-Domino contracts (Hearts, Queens, Tricks, King of Spades, Last Two Tricks) ───
  else if (c !== 'Barbu') {
    scoreGrid.querySelectorAll('select,input').forEach(el => {
      let p = null, v = 0;

      // King of Spades (single‐contract)
      if (c === 'King of Spades' && el.type === 'radio') {
        p = el.value;
        v = el.checked ? 80 : 0;
      }
      // Heart/Queen/Tricks/Last Two Tricks dropdowns will also be <select> here
      else if (el.tagName === 'SELECT') {
        // Find associated player via the <label> sibling
        const label = el.parentElement.querySelector('label');
        p = label ? label.dataset.player : null;
        if (!p) return;

        if (c === 'Last Two Tricks') {
          if (el.value === 'Both')      v = 120;
          else if (el.value === 'Last') v = 80;
          else if (el.value === 'Pre-last') v = 40;
          else                           v = 0;
        } else {
          // Hearts / Queens / Tricks → multiply by appropriate factor
          const raw = Number(el.value) || 0;
          if (c === 'Hearts')    v = raw * 10;
          else if (c === 'Queens')  v = raw * 30;
          else if (c === 'Tricks')  v = raw * 10;
        }
      }
      // (This branch catches any stray inputs other than King‐of‐Spades radios)
      else {
        // It’s probably a dropdown or leftover; just in case, fetch its player
        const label = el.parentElement.querySelector('label');
        p = label ? label.dataset.player : null;
        if (!p) return;

        v = Number(el.value) || 0;
      }

      scores[p] = (scores[p] || 0) + v;
    });
  }

  // ─── Barbu round (multi-contract) ───
  else {
    players.forEach(p => {
      let total = 0;
      // find the container for this player’s Barbu inputs
      const container = scoreGrid.querySelector(`[data-player-group="${p}"]`);
      if (!container) return;

      // 1) Hearts / Queens / Tricks sub-selects
      ['Hearts','Queens','Tricks'].forEach(sub => {
        const sel = container.querySelector(`select[data-contract="${sub}"]`);
        if (!sel) return;
        const raw = Number(sel.value) || 0;
        const factor = (sub === 'Hearts') ? 10
                     : (sub === 'Queens') ? 30
                     : /* Tricks */ 10;
        total += raw * factor;
      });

      // 2) King of Spades sub-radio
      const kingRadio = scoreGrid.querySelector(`input[type="radio"][name="barbu-king-spade"]:checked`);
      if (kingRadio && kingRadio.value === p) total += 80;

      // 3) Last Two Tricks sub-select
      const lttSel = container.querySelector(`select[data-contract="Last Two Tricks"]`);
      if (lttSel) {
        if (lttSel.value === 'Both')      total += 120;
        else if (lttSel.value === 'Last') total += 80;
        else if (lttSel.value === 'Pre-last') total += 40;
      }

      // Halve for Barbu
      scores[p] = Math.floor(total / 2);
    });
  }

  // ─── Insert or Update the Round ───
  if (editIndex !== null) {
    // Overwrite an existing round in “edit” mode:
    const oldDealer = rounds[editIndex].dealer;
    rounds[editIndex] = { dealer: oldDealer, contract: c, scores };
    editIndex = null;
    saveState();

    renderTopBar();
    renderProgressGrid();
    renderRounds();

    // Return to “new round” for the same dealer
    addBtn.textContent = 'Submit Round';
    nextRound();
  }
  else {
    // Normal “append a new round” path
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
}


// — Append One Row to the Table — 
function appendRow() {
  const idx         = rounds.length - 1,
        r           = rounds[idx],
        tr          = document.createElement('tr'),
        dealerEmoji = getDealerEmoji(r);

  tr.classList.add('slide-in');
  tr.innerHTML = `
    <td>${idx + 1}</td>
    <td>
      ${r.dealer}
      ${dealerEmoji ? `<span class="dealer-emoji"> ${dealerEmoji}</span>` : ''}
    </td>
    <td>${EMOJI[r.contract]}</td>
    ${players.map(p => `<td>${r.scores[p] || 0}</td>`).join('')}
    <td><button class="edit-btn" data-idx="${idx}">✏️</button></td>
  `;
  roundBody.append(tr);

  tr.querySelector('.edit-btn')
    .addEventListener('click', () => startEditRound(idx));

  if (rounds.length >= players.length * enabledContracts.length) {
    finishGame();
  }
}


// — Re-render All Past Rounds (on load) — 
function renderRounds() {
  const tbody = document.querySelector('#round-table tbody');
  tbody.innerHTML = '';

  rounds.forEach((r, idx) => {
    const dealerEmoji = getDealerEmoji(r);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>
        ${r.dealer}
        ${dealerEmoji ? `<span class="dealer-emoji"> ${dealerEmoji}</span>` : ''}
      </td>
      <td>${EMOJI[r.contract]}</td>
      ${players.map(p => `<td>${r.scores[p] || 0}</td>`).join('')}
      <td><button class="edit-btn" data-idx="${idx}">✏️</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => startEditRound(+btn.dataset.idx));
  });
}



// ----------------------------------
// startEditRound: load a round into the form
// ----------------------------------
function startEditRound(idx) {
  editIndex = idx;
  const r = rounds[idx];

  // 1) Lock the contract dropdown to this one
  contractSel.innerHTML =
    `<option value="${r.contract}">${EMOJI[r.contract]} ${r.contract}</option>`;

  // 2) Rebuild the score inputs for that contract
  buildScoreInputs();

  // 3) Populate each player’s control with the old score
  players.forEach(p => {
    const pts = r.scores[p] || 0;
    const label = scoreGrid.querySelector(`label[data-player="${p}"]`);
    if (!label) return;
    const sel = label.nextElementSibling;
    const rd  = label.querySelector('input[type="radio"]');

    if (sel && sel.tagName === 'SELECT') {
      if (['Hearts', 'Queens', 'Tricks'].includes(r.contract)) {
        const div = { Hearts:10, Queens:30, Tricks:10 }[r.contract];
        sel.value = pts / div;
      } else if (r.contract === 'Last Two Tricks') {
        sel.value = pts === 120 ? 'Both'
                  : pts === 80  ? 'Last'
                  : pts === 40  ? 'Pre-last'
                  : 'None';
      } else if (r.contract === 'Domino') {
        sel.value = String(pts);
      }
    }
    else if (rd) {
      rd.checked = (pts === 80);
    }
  });

  // 4) Retrigger each <select>’s change so that its internal adjust() fires
  scoreGrid.querySelectorAll('select').forEach(sel =>
    sel.dispatchEvent(new Event('change'))
  );

  // 5) Update the button and re-validate
  addBtn.textContent = 'Save Changes';
  validateForm();

  // 6) Center‐scroll the score inputs and focus the first control
  scoreGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const firstControl = scoreGrid.querySelector('select, input[type="radio"]');
  if (firstControl) firstControl.focus({ preventScroll: true });

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
