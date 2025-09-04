// zoo.js — Zoo Pop: tap-to-match with goals, moves, rockets & bombs (no libs)
(() => {
  const width = 10;
  const colors = ['red','orange','yellow','green','blue','purple'];
  const animalByColor = {
    red:'🦊', orange:'🐯', yellow:'🐥', green:'🐸', blue:'🐼', purple:'🦉'
  };
  const colorClass = c => 't-' + c;

  const boardEl = document.getElementById('board');
  const scoreEl = document.getElementById('score');
  const movesEl = document.getElementById('moves');
  const levelEl = document.getElementById('level');
  const btnNew = document.getElementById('btn-new');
  const btnShuffle = document.getElementById('btn-shuffle');
  const btnReset = document.getElementById('btn-reset');
  const btnHelp = document.getElementById('btn-help');
  const toast = document.getElementById('toast');
  const modal = document.getElementById('modal');
  const btnClose = document.getElementById('btn-close');

  const goalAIcon = document.getElementById('goalAIcon');
  const goalBIcon = document.getElementById('goalBIcon');
  const goalACurrent = document.getElementById('goalACurrent');
  const goalATarget = document.getElementById('goalATarget');
  const goalAProgress = document.getElementById('goalAProgress');
  const goalBCurrent = document.getElementById('goalBCurrent');
  const goalBTarget = document.getElementById('goalBTarget');
  const goalBProgress = document.getElementById('goalBProgress');

  const cells = []; // DOM tiles
  const grid = [];  // logical tiles
  // tile: {color, special: 'none'|'rocket'|'bomb'}

  let score = 0;
  let moves = 30;
  let level = 1;
  let goals = { a:{color:'red', need:15, have:0}, b:{color:'blue', need:15, have:0} };
  let busy = false;

  function showToast(msg){
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1200);
  }

  function rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function idx(x,y){ return y*width + x; }
  function inBounds(x,y){ return x>=0 && x<width && y>=0 && y<width; }

  function makeTile(x,y){
    const t = document.createElement('button');
    t.className = 'tile';
    t.setAttribute('data-x', x);
    t.setAttribute('data-y', y);
    t.addEventListener('click', onTileClick);
    boardEl.appendChild(t);
    return t;
  }

  function renderTile(x,y){
    const t = cells[idx(x,y)];
    const s = grid[idx(x,y)];
    t.className = 'tile ' + colorClass(s.color) + (s.special ? (' ' + s.special) : '');
    t.textContent = s.special ? '' : animalByColor[s.color];
  }

  function createBoard(){
    boardEl.innerHTML = '';
    cells.length = 0;
    grid.length = 0;
    for(let y=0;y<width;y++){
      for(let x=0;x<width;x++){
        cells.push(makeTile(x,y));
        grid.push({color: rand(colors), special: null});
      }
    }
    syncAll();
  }

  function syncAll(){
    for(let y=0;y<width;y++) for(let x=0;x<width;x++) renderTile(x,y);
  }

  function floodGroup(x,y, targetColor, visited){
    const stack = [[x,y]];
    const group = [];
    while(stack.length){
      const [cx,cy] = stack.pop();
      const key = cx+','+cy;
      if(visited.has(key)) continue;
      if(!inBounds(cx,cy)) continue;
      const s = grid[idx(cx,cy)];
      if(s.color !== targetColor) continue;
      visited.add(key);
      group.push([cx,cy]);
      stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
    }
    return group;
  }

  function clearHighlights(){
    cells.forEach(c => c.classList.remove('highlight'));
  }

  function onTileClick(e){
    if(busy) return;
    const t = e.currentTarget;
    const x = +t.getAttribute('data-x');
    const y = +t.getAttribute('data-y');
    const tile = grid[idx(x,y)];

    if(tile.special){
      // trigger special
      applySpecial(x,y,tile.special);
      return;
    }

    const visited = new Set();
    const group = floodGroup(x,y, tile.color, visited);
    if(group.length < 2){
      showToast('Need 2+ to pop');
      pulse(x,y);
      return;
    }
    popGroup(group);
  }

  function pulse(x,y){
    const el = cells[idx(x,y)];
    el.style.transform = 'scale(.96)';
    setTimeout(()=> el.style.transform = '', 100);
  }

  function popGroup(group){
    if(busy) return;
    busy = true;
    const n = group.length;
    // Bonus specials for large groups
    let specialToCreate = null;
    if(n >= 7) specialToCreate = 'bomb';
    else if(n >= 5) specialToCreate = 'rocket';

    // scoring (popular curve): n^2 for juicy feel
    score += n * n;
    scoreEl.textContent = score.toString();
    moves--; movesEl.textContent = moves.toString();

    // update goals
    const color = grid[idx(group[0][0], group[0][1])].color;
    if(goals.a.color === color){ goals.a.have += n; }
    if(goals.b.color === color){ goals.b.have += n; }
    updateGoalsUI();

    // choose a random cell from group to become special (if any)
    const [sx,sy] = specialToCreate ? group[Math.floor(Math.random()*group.length)] : [-1,-1];

    // clear group
    group.forEach(([gx,gy]) => {
      const s = grid[idx(gx,gy)];
      s.color = null; s.special = null;
    });

    // Apply gravity
    dropAndFill().then(() => {
      // place special after drop at the chosen (now shifted) column position: pick topmost valid cell in that column
      if(specialToCreate){
        // find lowest empty spot upwards from sy in column sx (after drop there should be no nulls, so instead convert some tile in that col)
        // We'll convert the tile that landed at original (sx,0..width-1) closest to sy.
        let targetY = null;
        for(let yy=width-1; yy>=0; yy--){
          if(grid[idx(sx,yy)].color != null){ targetY = yy; break; }
        }
        if(targetY != null){
          grid[idx(sx,targetY)].special = specialToCreate;
          renderTile(sx,targetY);
        }
      }
      busy = false;
      checkEnd();
    });
  }

  function applySpecial(x,y,type){
    if(busy) return;
    busy = true;
    moves--; movesEl.textContent = moves.toString();

    if(type === 'rocket'){
      // randomly choose horizontal or vertical
      const horiz = Math.random() < 0.5;
      const affected = [];
      if(horiz){
        for(let cx=0; cx<width; cx++) affected.push([cx,y]);
      } else {
        for(let cy=0; cy<width; cy++) affected.push([x,cy]);
      }
      blast(affected).then(() => { busy=false; checkEnd(); });
    } else if(type === 'bomb'){
      const affected = [];
      for(let dy=-1; dy<=1; dy++){
        for(let dx=-1; dx<=1; dx++){
          const nx=x+dx, ny=y+dy;
          if(inBounds(nx,ny)) affected.push([nx,ny]);
        }
      }
      blast(affected).then(() => { busy=false; checkEnd(); });
    }
  }

  function blast(coords){
    // count colors for goals
    const counts = {};
    coords.forEach(([x,y]) => {
      const t = grid[idx(x,y)];
      if(t.color != null){
        counts[t.color] = (counts[t.color]||0)+1;
        // score each blast tile
        score += 3;
      }
      t.color = null; t.special = null;
    });
    scoreEl.textContent = score.toString();
    // goals
    Object.entries(counts).forEach(([c,n]) => {
      if(goals.a.color === c) goals.a.have += n;
      if(goals.b.color === c) goals.b.have += n;
    });
    updateGoalsUI();
    return dropAndFill();
  }

  async function dropAndFill(){
    // gravity: for each column, compact non-null downwards
    const delay = ms => new Promise(r => setTimeout(r, ms));
    const fall = () => {
      for(let x=0;x<width;x++){
        let write = width-1;
        for(let y=width-1;y>=0;y--){
          const s = grid[idx(x,y)];
          if(s.color != null){
            if(write !== y){
              grid[idx(x,write)].color = s.color;
              grid[idx(x,write)].special = s.special;
              s.color = null; s.special = null;
            }
            write--;
          }
        }
        // fill remaining top with new random tiles
        for(let y=write; y>=0; y--){
          grid[idx(x,y)].color = rand(colors);
          grid[idx(x,y)].special = null;
        }
      }
    };
    fall();
    syncAll();
    await delay(120);
  }

  function shuffle(){
    if(busy) return;
    const pool = [];
    for(let i=0;i<grid.length;i++) if(grid[i].color != null) pool.push({color:grid[i].color});
    // Fisher-Yates
    for(let i=pool.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    grid.forEach((g,i) => { if(g.color!=null){ g.color = pool[i % pool.length].color; g.special=null; } });
    syncAll();
    showToast('Shuffled!');
  }

  function randomGoals(){
    const c1 = rand(colors);
    let c2 = rand(colors); while(c2===c1) c2 = rand(colors);
    const base = 12 + Math.floor(level*1.5);
    goals = {
      a: {color: c1, need: base, have: 0},
      b: {color: c2, need: base, have: 0}
    };
    updateGoalsUI(true);
  }

  function updateGoalsUI(resetIcons){
    const aPct = Math.min(100, Math.round(100*goals.a.have/goals.a.need));
    const bPct = Math.min(100, Math.round(100*goals.b.have/goals.b.need));
    goalACurrent.textContent = Math.min(goals.a.have, goals.a.need);
    goalATarget.textContent = goals.a.need;
    goalAProgress.style.width = aPct + '%';
    goalBCurrent.textContent = Math.min(goals.b.have, goals.b.need);
    goalBTarget.textContent = goals.b.need;
    goalBProgress.style.width = bPct + '%';
    if(resetIcons){
      goalAIcon.textContent = animalByColor[goals.a.color];
      goalBIcon.textContent = animalByColor[goals.b.color];
    }
  }

  function newLevel(){
    levelEl.textContent = level.toString();
    moves = 30; movesEl.textContent = moves.toString();
    score = 0; scoreEl.textContent = '0';
    randomGoals();
    createBoard();
    showToast('Level ' + level);
  }

  function checkEnd(){
    const won = goals.a.have >= goals.a.need && goals.b.have >= goals.b.need;
    if(won){
      showToast('Level cleared! ✨');
      level++; newLevel();
      return;
    }
    if(moves <= 0){
      showToast('Out of moves! Try again.');
      level = Math.max(1, level-0); // keep level; could reduce if desired
      newLevel();
    }
  }

  function reset(){
    level = 1;
    newLevel();
  }

  // Events
  btnNew.addEventListener('click', () => { level++; newLevel(); });
  btnShuffle.addEventListener('click', shuffle);
  btnReset.addEventListener('click', reset);
  btnHelp.addEventListener('click', () => modal.classList.remove('hidden'));
  btnClose.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.classList.add('hidden'); });

  // Init
  newLevel();
})();