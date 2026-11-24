$(function () {
  'use strict';


  const LEVELS = [
    { level: 1, cols: 8,  rows: 8,  time: 120, traps: 0, keys: 0, enemies: 0, darkMode: false, label: 'ด่านเริ่มต้น สบายๆ 🌟' },
    { level: 2, cols: 11, rows: 11, time: 110, traps: 1, keys: 0, enemies: 0, darkMode: false, label: 'ระวังกับดัก ⚡' },
    { level: 3, cols: 13, rows: 13, time: 100, traps: 2, keys: 1, enemies: 0, darkMode: false, label: 'ค้นหากุญแจสีทอง 🔑' },
    { level: 4, cols: 15, rows: 15, time: 90,  traps: 2, keys: 1, enemies: 1, darkMode: false, label: 'ผู้พิทักษ์เขาวงกต 👾' },
    { level: 5, cols: 17, rows: 17, time: 80,  traps: 2, keys: 1, enemies: 1, darkMode: true,  label: 'แสงไฟฉายในความมืด 🔦' },
  ];

  /* ===================================================
     สถานะของเกม (Single-Player Game State)
  =================================================== */
  const state = {
    currentLevelIdx:   0,
    totalScore:        0,
    totalTimeUsed:     0,
    timeLeft:          0,
    timerInterval:     null,
    enemyMoveInterval: null,
    running:           false,
    player:            { col: 0, row: 0 },
    playerAnimOffset:  { x: 0, y: 0 },
    isMoving:          false,
    maze:              [],
    keys:              [],
    collectedKeys:     0,
    traps:             [],
    enemies:           [],
    cellSize:          28,
    particles:         [],
  };

  /* ===================================================
     Canvas & Context
  =================================================== */
  const canvas     = document.getElementById('maze-canvas');
  const ctx        = canvas.getContext('2d');
  const darkCanvas = document.getElementById('dark-overlay');
  const darkCtx    = darkCanvas.getContext('2d');
  const pCanvas    = document.getElementById('particle-canvas');
  const pCtx       = pCanvas.getContext('2d');

  let animFrameId = null;

  /* ===================================================
     สร้างดาวพื้นหลัง (Animated Star Background)
  =================================================== */
  function createStars() {
    const $bg = $('#star-bg');
    $bg.empty();
    for (let i = 0; i < 110; i++) {
      const size = Math.random() * 2.5 + 0.5;
      $('<div>').addClass('star').css({
        left: (Math.random() * 100) + '%',
        top:  (Math.random() * 100) + '%',
        width: size + 'px',
        height: size + 'px',
        '--dur': (Math.random() * 4 + 2) + 's',
        '--op':  (Math.random() * 0.5 + 0.2),
        animationDelay: (Math.random() * 5) + 's'
      }).appendTo($bg);
    }
  }

  /* ===================================================
     แสดงหน้าจอ (Show Screen with Smooth Fade)
  =================================================== */
  function showScreen(id) {
    $('.screen').removeClass('active');
    setTimeout(() => $('#' + id).addClass('active'), 50);
  }

  /* ===================================================
     อัปเดต High Score บนหน้าต่างๆ
  =================================================== */
  function updateStartHighScore() {
    const hs = parseInt(localStorage.getItem('neonMazeHighScore') || '0');
    $('#start-highscore').text(hs.toLocaleString());
  }

  /* ===================================================
     เริ่มเกมใหม่ตั้งแต่ด่าน 1 (Start Game)
  =================================================== */
  function startGame() {
    state.currentLevelIdx = 0;
    state.totalScore      = 0;
    state.totalTimeUsed   = 0;

    showScreen('game-screen');
    loadLevel(0);
  }

  /* ===================================================
     โหลดด่านที่ระบุ (Load Level)
  =================================================== */
  function loadLevel(idx) {
    state.currentLevelIdx = idx;
    const cfg = LEVELS[idx];

    // หยุด loop เดิมทั้งหมด
    stopGameIntervals();

    // สร้างเขาวงกตสำหรับด่านนี้
    state.maze = generateMaze(cfg.cols, cfg.rows);

    // สร้างไอเทมต่าง ๆ ในจุดที่ไม่ซ้ำกับทางเริ่มและทางออก
    const items = generateItems(cfg);
    state.traps   = items.traps;
    state.keys    = items.keys;
    state.enemies = items.enemies;

    // รีเซ็ตสถานะตัวละครและตัวนับ
    state.player           = { col: 0, row: 0 };
    state.playerAnimOffset = { x: 0, y: 0 };
    state.isMoving         = false;
    state.collectedKeys    = 0;
    state.timeLeft         = cfg.time;
    state.particles        = [];
    state.running          = false;

    // ปรับขนาด Canvas ให้พอดี
    computeCellSize(cfg);
    canvas.width  = cfg.cols * state.cellSize;
    canvas.height = cfg.rows * state.cellSize;
    darkCanvas.width  = canvas.width;
    darkCanvas.height = canvas.height;
    darkCanvas.style.display = cfg.darkMode ? 'block' : 'none';

    updateStatusBar();

    // แสดง Transition Animation ก่อนเริ่มด่าน
    showTransition(cfg.level, cfg.label, () => {
      state.running = true;
      startTimer();
      if (cfg.enemies > 0) startEnemyMovement(cfg);
      startRenderLoop();
    });
  }

  /* ===================================================
     สร้างไอเทม (กับดัก, กุญแจ, ศัตรู)
  =================================================== */
  function generateItems(cfg) {
    const { cols, rows, traps: nT, keys: nK, enemies: nE } = cfg;
    const pool = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // ห้ามวางที่จุดเกิดและจุดทางออก
        if (r === 0 && c === 0) continue;
        if (r === rows - 1 && c === cols - 1) continue;
        // ห้ามวางติดจุดเกิดเกินไปเพื่อให้เดินสบาย
        if (r <= 1 && c <= 1) continue;
        pool.push({ col: c, row: r });
      }
    }
    shuffle(pool);

    return {
      traps:   pool.slice(0, nT),
      keys:    pool.slice(nT, nT + nK),
      enemies: pool.slice(nT + nK, nT + nK + nE).map(p => ({
        col: p.col,
        row: p.row,
        prevCol: p.col,
        prevRow: p.row,
        animProgress: 1
      }))
    };
  }

  /* ===================================================
     สุ่มสลับ Array (Fisher-Yates Shuffle)
  =================================================== */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  /* ===================================================
     สร้างเขาวงกต (Iterative DFS / Recursive Backtracking)
     รับประกันมีทางเดินจาก (0,0) ไปยังทางออกแน่นอน
  =================================================== */
  function generateMaze(cols, rows) {
    const grid = [];
    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        grid[r][c] = { top: true, right: true, bottom: true, left: true, visited: false };
      }
    }

    const DIRS = [
      [-1,  0, 'top',    'bottom'],
      [ 0,  1, 'right',  'left'  ],
      [ 1,  0, 'bottom', 'top'   ],
      [ 0, -1, 'left',   'right' ]
    ];

    const stack = [{ r: 0, c: 0 }];
    grid[0][0].visited = true;
    let visited = 1;
    const total = cols * rows;

    while (visited < total) {
      const curr = stack[stack.length - 1];
      const shuffled = DIRS.slice().sort(() => Math.random() - 0.5);
      let moved = false;

      for (const [dr, dc, wC, wN] of shuffled) {
        const nr = curr.r + dr, nc = curr.c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !grid[nr][nc].visited) {
          grid[curr.r][curr.c][wC] = false;
          grid[nr][nc][wN]         = false;
          grid[nr][nc].visited     = true;
          stack.push({ r: nr, c: nc });
          visited++;
          moved = true;
          break;
        }
      }
      if (!moved) stack.pop();
    }
    return grid;
  }

  /* ===================================================
     คำนวณขนาด Cell ให้สมดุลและสวยงาม
  =================================================== */
  function computeCellSize(cfg) {
    const wrapper = document.getElementById('canvas-wrapper');
    const dpadRes = window.innerWidth <= 600 ? 155 : 180;
    const maxW    = wrapper.clientWidth  - 24;
    const maxH    = wrapper.clientHeight - dpadRes;
    const byW     = Math.floor(maxW / cfg.cols);
    const byH     = Math.floor(maxH / cfg.rows);
    state.cellSize = Math.max(14, Math.min(byW, byH, 44));
  }

  /* ===================================================
     ระบบจับเวลา (Timer)
  =================================================== */
  function startTimer() {
    updateTimerDisplay();
    state.timerInterval = setInterval(() => {
      if (!state.running) return;
      state.timeLeft--;
      updateTimerDisplay();
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        triggerGameOver('time');
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const $el = $('#timer-display');
    $el.text(state.timeLeft);
    if (state.timeLeft <= 15) {
      $el.addClass('warning');
    } else {
      $el.removeClass('warning');
    }
  }

  /* ===================================================
     อัปเดตแถบสถานะ (Update Status Bar)
  =================================================== */
  function updateStatusBar() {
    const cfg = LEVELS[state.currentLevelIdx];
    $('#level-badge').text(cfg.level);
    $('#score-display').text(state.totalScore.toLocaleString());
    updateTimerDisplay();

    if (cfg.keys > 0) {
      if (state.collectedKeys >= cfg.keys) {
        $('#key-display').text('ครบแล้ว 🔑').css('color', '#00ff88');
      } else {
        $('#key-display').text(state.collectedKeys + '/' + cfg.keys + ' 🔑').css('color', '#ffcc00');
      }
    } else {
      $('#key-display').text('–').css('color', 'var(--text-muted)');
    }
  }

  /* ===================================================
     การเคลื่อนที่ของผู้เล่น (Move Player)
  =================================================== */
  function movePlayer(dir) {
    if (!state.running || state.isMoving) return;

    const { col, row } = state.player;
    const cell = state.maze[row][col];
    const cfg  = LEVELS[state.currentLevelIdx];

    let nc = col, nr = row;
    if (dir === 'up'    && !cell.top)    nr--;
    if (dir === 'down'  && !cell.bottom) nr++;
    if (dir === 'left'  && !cell.left)   nc--;
    if (dir === 'right' && !cell.right)  nc++;
    if (nc === col && nr === row) return;

    animatePlayerMove(col, row, nc, nr, () => {
      state.player.col = nc;
      state.player.row = nr;
      checkCellEvents(nc, nr, cfg);
    });
  }

  /* ===================================================
     Animation การเคลื่อนที่ (Smooth Movement)
  =================================================== */
  function animatePlayerMove(fromC, fromR, toC, toR, onDone) {
    const cs  = state.cellSize;
    const dx  = (toC - fromC) * cs;
    const dy  = (toR - fromR) * cs;
    const dur = 100;
    const t0  = performance.now();

    state.isMoving         = true;
    state.playerAnimOffset = { x: 0, y: 0 };

    function step(now) {
      const t    = Math.min((now - t0) / dur, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      state.playerAnimOffset = { x: dx * ease, y: dy * ease };

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        state.playerAnimOffset = { x: 0, y: 0 };
        state.isMoving         = false;
        if (onDone) onDone();
      }
    }
    requestAnimationFrame(step);
  }

  /* ===================================================
     ตรวจสอบเหตุการณ์เมื่อเดินถึง Cell (Check Cell Events)
  =================================================== */
  function checkCellEvents(col, row, cfg) {
    // 1. เก็บกุญแจ
    const ki = state.keys.findIndex(k => k.col === col && k.row === row);
    if (ki !== -1) {
      state.keys.splice(ki, 1);
      state.collectedKeys++;
      updateStatusBar();
      spawnParticles(col, row, '#ffcc00', 16);
      flashScreen('rgba(255, 204, 0, 0.25)');
    }

    // 2. โดนกับดัก (ลดเวลาเพียง 3 วินาที)
    const ti = state.traps.findIndex(t => t.col === col && t.row === row);
    if (ti !== -1) {
      state.traps.splice(ti, 1);
      state.timeLeft = Math.max(0, state.timeLeft - 3);
      updateTimerDisplay();
      spawnParticles(col, row, '#ff6600', 12);
      flashScreen('rgba(255, 102, 0, 0.35)');
      if (state.timeLeft <= 0) {
        triggerGameOver('time');
        return;
      }
    }

    // 3. ชนศัตรู
    if (state.enemies.some(e => e.col === col && e.row === row)) {
      triggerGameOver('enemy');
      return;
    }

    // 4. ถึงประตูทางออก
    if (col === cfg.cols - 1 && row === cfg.rows - 1) {
      if (state.collectedKeys < cfg.keys) {
        flashScreen('rgba(255, 204, 0, 0.3)');
        return;
      }
      triggerLevelClear();
    }
  }

  /* ===================================================
     Flash หน้าจอเมื่อเกิดเหตุการณ์พิเศษ
  =================================================== */
  function flashScreen(color) {
    const $f = $('<div>').css({
      position: 'fixed',
      inset: 0,
      background: color,
      zIndex: 50,
      pointerEvents: 'none'
    }).appendTo('body');
    $f.animate({ opacity: 0 }, 400, () => $f.remove());
  }

  /* ===================================================
     Particle System (เอฟเฟกต์ประกายไฟ/ละอองแสง)
  =================================================== */
  function spawnParticles(col, row, color, count) {
    const cs   = state.cellSize;
    const rect = canvas.getBoundingClientRect();
    const cx   = rect.left + (col + 0.5) * cs;
    const cy   = rect.top  + (row + 0.5) * cs;

    for (let i = 0; i < count; i++) {
      state.particles.push({
        x: cx,
        y: cy,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        life: 1,
        color,
        size: Math.random() * 4 + 2
      });
    }
  }

  function updateParticles() {
    pCanvas.width  = window.innerWidth;
    pCanvas.height = window.innerHeight;
    pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);

    state.particles = state.particles.filter(p => p.life > 0);
    state.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= 0.04;
      pCtx.globalAlpha = Math.max(0, p.life);
      pCtx.fillStyle   = p.color;
      pCtx.beginPath();
      pCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      pCtx.fill();
    });
    pCtx.globalAlpha = 1;
  }

  /* ===================================================
     การเคลื่อนไหวของศัตรู (ช้าและเป็นมิตร: เดินทุกๆ 1.1 วินาที)
  =================================================== */
  function startEnemyMovement(cfg) {
    const DIRS = [
      { dr: -1, dc:  0, w: 'top'    },
      { dr:  0, dc:  1, w: 'right'  },
      { dr:  1, dc:  0, w: 'bottom' },
      { dr:  0, dc: -1, w: 'left'   }
    ];

    state.enemyMoveInterval = setInterval(() => {
      if (!state.running) return;
      state.enemies.forEach(enemy => {
        const cell     = state.maze[enemy.row][enemy.col];
        const shuffled = DIRS.slice().sort(() => Math.random() - 0.5);

        for (const d of shuffled) {
          const nr = enemy.row + d.dr, nc = enemy.col + d.dc;
          if (nr >= 0 && nr < cfg.rows && nc >= 0 && nc < cfg.cols && !cell[d.w]) {
            enemy.prevCol = enemy.col;
            enemy.prevRow = enemy.row;
            enemy.col = nc;
            enemy.row = nr;
            enemy.animProgress = 0;
            break;
          }
        }
        if (enemy.col === state.player.col && enemy.row === state.player.row) {
          triggerGameOver('enemy');
        }
      });
    }, 1100);
  }

  /* ===================================================
     Main Render Loop
  =================================================== */
  function startRenderLoop() {
    function loop() {
      if (!state.running) return;
      animFrameId = requestAnimationFrame(loop);

      state.enemies.forEach(e => {
        if (e.animProgress < 1) {
          e.animProgress = Math.min(1, e.animProgress + 0.08);
        }
      });

      renderMaze();
      if (LEVELS[state.currentLevelIdx].darkMode) {
        renderDarkOverlay();
      }
      updateParticles();
    }
    loop();
  }

  /* ===================================================
     วาดเขาวงกต (Render Maze)
  =================================================== */
  function renderMaze() {
    const cfg = LEVELS[state.currentLevelIdx];
    const cs  = state.cellSize;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // สีพื้นหลังเขาวงกต
    ctx.fillStyle = '#07071c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ทางเดิน
    for (let r = 0; r < cfg.rows; r++) {
      for (let c = 0; c < cfg.cols; c++) {
        ctx.fillStyle = '#0c0c28';
        ctx.fillRect(c * cs + 1, r * cs + 1, cs - 2, cs - 2);
      }
    }

    // วาดไอเทม
    state.traps.forEach(t => drawTrap(t.col, t.row, cs));
    state.keys.forEach(k => drawKey(k.col, k.row, cs));
    drawExit(cfg.cols - 1, cfg.rows - 1, cs, cfg.keys);

    // วาดศัตรู
    state.enemies.forEach(e => {
      const ex = (e.prevCol + (e.col - e.prevCol) * e.animProgress) * cs + cs / 2;
      const ey = (e.prevRow + (e.row - e.prevRow) * e.animProgress) * cs + cs / 2;
      drawEnemy(ex, ey, cs);
    });

    // วาดตัวละครผู้เล่น (สีฟ้า Cyan นีออน)
    const px = state.player.col * cs + cs / 2 + state.playerAnimOffset.x;
    const py = state.player.row * cs + cs / 2 + state.playerAnimOffset.y;
    drawPlayer(px, py, cs);

    // วาดกำแพงทับบนสุด
    drawWalls(cfg.cols, cfg.rows, cs);
  }

  /* ===================================================
     วาดกำแพงนีออน (Draw Walls)
  =================================================== */
  function drawWalls(cols, rows, cs) {
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth   = Math.max(2, cs * 0.07);
    ctx.lineCap     = 'round';
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur  = 6;
    ctx.beginPath();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = state.maze[r][c];
        const x = c * cs, y = r * cs;
        if (cell.top)    { ctx.moveTo(x,      y);      ctx.lineTo(x + cs, y);      }
        if (cell.right)  { ctx.moveTo(x + cs, y);      ctx.lineTo(x + cs, y + cs); }
        if (cell.bottom) { ctx.moveTo(x,      y + cs); ctx.lineTo(x + cs, y + cs); }
        if (cell.left)   { ctx.moveTo(x,      y);      ctx.lineTo(x,      y + cs); }
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  /* ===================================================
     วาดผู้เล่น (Draw Player)
  =================================================== */
  function drawPlayer(x, y, cs) {
    const r  = cs * 0.35;
    const gl = 14 + Math.sin(Date.now() / 400) * 6;

    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur  = gl;
    ctx.fillStyle   = '#00d4ff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur  = 0;

    // ประกายไฮไลต์ตรงกลาง
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.beginPath();
    ctx.arc(x - r * 0.28, y - r * 0.28, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ===================================================
     วาดทางออก (Draw Exit Door)
  =================================================== */
  function drawExit(col, row, cs, keysNeeded) {
    const locked = state.collectedKeys < keysNeeded;
    const x = col * cs, y = row * cs;
    const p = Math.sin(Date.now() / 800) * 0.15;

    ctx.shadowColor = locked ? '#888' : '#00ff88';
    ctx.shadowBlur  = 16;
    ctx.fillStyle   = locked ? `rgba(90,90,90,${0.7 + p})` : `rgba(0,255,136,${0.8 + p})`;
    ctx.fillRect(x + 3, y + 3, cs - 6, cs - 6);
    ctx.shadowBlur   = 0;

    ctx.font         = Math.max(10, cs * 0.52) + 'px Arial';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(locked ? '🔒' : '🚪', x + cs / 2, y + cs / 2);
  }

  /* ===================================================
     วาดกุญแจ (Draw Golden Key)
  =================================================== */
  function drawKey(col, row, cs) {
    const bob = Math.sin(Date.now() / 350) * 2.5;
    ctx.shadowColor  = '#ffcc00';
    ctx.shadowBlur   = 12;
    ctx.font         = Math.max(10, cs * 0.55) + 'px Arial';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔑', col * cs + cs / 2, row * cs + cs / 2 + bob);
    ctx.shadowBlur   = 0;
  }

  /* ===================================================
     วาดกับดัก (Draw Trap)
  =================================================== */
  function drawTrap(col, row, cs) {
    const t = Date.now() / 500;
    ctx.shadowColor  = '#ff4400';
    ctx.shadowBlur   = 10;
    ctx.fillStyle    = `rgba(255, 60, 0, ${0.45 + Math.sin(t) * 0.25})`;
    ctx.fillRect(col * cs + 3, row * cs + 3, cs - 6, cs - 6);
    ctx.shadowBlur   = 0;

    ctx.font         = Math.max(10, cs * 0.52) + 'px Arial';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡', col * cs + cs / 2, row * cs + cs / 2);
  }

  /* ===================================================
     วาดศัตรูลาดตระเวน (Draw Enemy)
  =================================================== */
  function drawEnemy(x, y, cs) {
    const t = Date.now() / 300;
    ctx.shadowColor  = '#ff0080';
    ctx.shadowBlur   = 14 + Math.sin(t) * 6;
    ctx.fillStyle    = '#ff0080';
    ctx.beginPath();
    ctx.arc(x, y, cs * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur   = 0;

    ctx.font         = Math.max(10, cs * 0.44) + 'px Arial';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👾', x, y + 1);
  }

  /* ===================================================
     โหมดมืด — รัศมีไฟฉายกว้างสบายตา (Flashlight Radius)
  =================================================== */
  function renderDarkOverlay() {
    const cs  = state.cellSize;
    const px  = (state.player.col + 0.5) * cs + state.playerAnimOffset.x;
    const py  = (state.player.row + 0.5) * cs + state.playerAnimOffset.y;
    const rad = cs * 3.8; // รัศมีมองเห็นกว้างขึ้นเพื่อความสบายตา

    darkCtx.clearRect(0, 0, darkCanvas.width, darkCanvas.height);
    darkCtx.fillStyle = 'rgba(0, 0, 10, 0.95)';
    darkCtx.fillRect(0, 0, darkCanvas.width, darkCanvas.height);

    const grad = darkCtx.createRadialGradient(px, py, 0, px, py, rad);
    grad.addColorStop(0,    'rgba(0,0,0,1)');
    grad.addColorStop(0.60, 'rgba(0,0,0,1)');
    grad.addColorStop(0.85, 'rgba(0,0,0,0.45)');
    grad.addColorStop(1,    'rgba(0,0,0,0)');

    darkCtx.globalCompositeOperation = 'destination-out';
    darkCtx.fillStyle = grad;
    darkCtx.beginPath();
    darkCtx.arc(px, py, rad, 0, Math.PI * 2);
    darkCtx.fill();
    darkCtx.globalCompositeOperation = 'source-over';

    const mRect = canvas.getBoundingClientRect();
    const wRect = document.getElementById('canvas-wrapper').getBoundingClientRect();
    darkCanvas.style.top  = (mRect.top  - wRect.top)  + 'px';
    darkCanvas.style.left = (mRect.left - wRect.left) + 'px';
  }

  /* ===================================================
     เมื่อผ่านด่าน (Trigger Level Clear)
  =================================================== */
  function triggerLevelClear() {
    if (!state.running) return;
    state.running = false;
    stopGameIntervals();

    const cfg        = LEVELS[state.currentLevelIdx];
    const secLeft    = state.timeLeft;
    const timeUsed   = cfg.time - secLeft;
    const timeBonus  = secLeft * 10;
    const levelBonus = cfg.level * 100;
    const levelScore = timeBonus + levelBonus;

    state.totalScore    += levelScore;
    state.totalTimeUsed += timeUsed;

    spawnParticles(cfg.cols / 2, cfg.rows / 2, '#00ff88', 35);

    $('#clear-title').text(`ผ่านด่านที่ ${cfg.level} แล้ว! 🎉`);
    $('#clear-time-left').text(`+${timeBonus.toLocaleString()} (${secLeft} วิ)`);
    $('#clear-level-bonus').text(`+${levelBonus.toLocaleString()}`);
    $('#clear-level-score').text(`+${levelScore.toLocaleString()}`);
    $('#clear-total-score').text(state.totalScore.toLocaleString());

    const isLastLevel = state.currentLevelIdx >= LEVELS.length - 1;
    $('#btn-next-level').text(isLastLevel ? '🏆 สรุปผลชนะเกม' : '▶ ด่านต่อไป');

    $('#modal-clear').addClass('show');
  }

  /* ===================================================
     เมื่อเกมจบ / แพ้ (Trigger Game Over)
  =================================================== */
  function triggerGameOver(reason) {
    if (!state.running) return;
    state.running = false;
    stopGameIntervals();

    flashScreen('rgba(255, 0, 60, 0.35)');

    if (reason === 'enemy') {
      $('#over-icon').text('👾');
      $('#over-title').text('ถูกจับได้!');
      $('#over-reason').text('คุณเดินชนผู้พิทักษ์เขาวงกต');
    } else {
      $('#over-icon').text('⏰');
      $('#over-title').text('หมดเวลา!');
      $('#over-reason').text('เวลาในด่านนี้หมดลงแล้ว');
    }

    $('#over-score').text(state.totalScore.toLocaleString());

    setTimeout(() => {
      $('#modal-over').addClass('show');
    }, 350);
  }

  /* ===================================================
     หน้าจอชนะเกมทั้งหมด (Show End Screen)
  =================================================== */
  function showEndScreen() {
    stopGameIntervals();

    const prevHigh = parseInt(localStorage.getItem('neonMazeHighScore') || '0');
    const isNewRecord = state.totalScore > prevHigh;

    if (isNewRecord) {
      localStorage.setItem('neonMazeHighScore', state.totalScore.toString());
      $('#end-new-record').removeClass('hidden');
    } else {
      $('#end-new-record').addClass('hidden');
    }

    $('#final-score').text(state.totalScore.toLocaleString() + ' คะแนน');
    $('#final-time').text(state.totalTimeUsed + ' วิ');
    $('#final-highscore').text(Math.max(prevHigh, state.totalScore).toLocaleString() + ' คะแนน');

    showScreen('end-screen');
  }

  /* ===================================================
     Level Transition Animation (เปลี่ยนด่าน)
  =================================================== */
  function showTransition(levelNum, label, callback) {
    $('#transition-text').text('ด่านที่ ' + levelNum);
    $('#transition-sub').text(label);
    $('#level-transition').addClass('show');

    setTimeout(() => {
      $('#level-transition').removeClass('show');
      setTimeout(callback, 300);
    }, 1400);
  }

  /* ===================================================
     หยุดการทำงานและ Timer ทั้งหมด
  =================================================== */
  function stopGameIntervals() {
    clearInterval(state.timerInterval);
    clearInterval(state.enemyMoveInterval);
    cancelAnimationFrame(animFrameId);
  }

  /* ===================================================
     กลับหน้าเมนูหลัก (Return to Main Menu)
  =================================================== */
  function goToMenu() {
    $('.modal-overlay').removeClass('show');
    state.running = false;
    stopGameIntervals();
    updateStartHighScore();
    showScreen('start-screen');
  }

  /* ===================================================
     ===== EVENT LISTENERS =====
  =================================================== */

  // --- Start Screen ---
  $('#btn-start').on('click', startGame);
  $('#btn-howto').on('click', () => showScreen('howto-screen'));
  $('#btn-back-from-howto').on('click', () => showScreen('start-screen'));

  // --- Modal Clear (ผ่านด่าน) ---
  $('#btn-next-level').on('click', () => {
    $('#modal-clear').removeClass('show');
    const isLastLevel = state.currentLevelIdx >= LEVELS.length - 1;
    setTimeout(() => {
      if (isLastLevel) {
        showEndScreen();
      } else {
        loadLevel(state.currentLevelIdx + 1);
      }
    }, 250);
  });

  // --- Modal Over (แพ้ / เกมจบ) ---
  $('#btn-retry').on('click', () => {
    $('#modal-over').removeClass('show');
    setTimeout(() => {
      loadLevel(state.currentLevelIdx);
    }, 250);
  });

  $('#btn-over-menu').on('click', goToMenu);

  // --- End Screen (ชนะครบ) ---
  $('#btn-play-again').on('click', startGame);
  $('#btn-back-to-menu').on('click', goToMenu);

  // --- Quit Button (ในเกม) ---
  $('#quit-btn').on('click', () => {
    if (confirm('คุณต้องการออกจากเกมและกลับหน้าหลักหรือไม่?')) {
      goToMenu();
    }
  });

  // --- คีย์บอร์ด (ลูกศร ↑↓←→ และ WASD) ---
  $(document).on('keydown', function (e) {
    const map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right'
    };
    const dir = map[e.key];
    if (dir) {
      e.preventDefault();
      movePlayer(dir);
    }
  });

  // --- D-Pad บนหน้าจอ ---
  $('#dpad').on('touchstart mousedown', '.dpad-btn[data-dir]', function (e) {
    e.preventDefault();
    const dir = $(this).data('dir');
    if (dir) {
      $(this).addClass('pressed');
      movePlayer(dir);
    }
  });

  $('#dpad').on('touchend mouseup mouseleave', '.dpad-btn', function () {
    $(this).removeClass('pressed');
  });

  // --- Touch Swipe บนมือถือ ---
  let swX = 0, swY = 0;
  $('#canvas-wrapper')
    .on('touchstart', e => {
      swX = e.originalEvent.touches[0].clientX;
      swY = e.originalEvent.touches[0].clientY;
    })
    .on('touchend', e => {
      const dx = e.originalEvent.changedTouches[0].clientX - swX;
      const dy = e.originalEvent.changedTouches[0].clientY - swY;
      const MIN = 24;
      if (Math.abs(dx) > Math.abs(dy)) {
        if      (dx >  MIN) movePlayer('right');
        else if (dx < -MIN) movePlayer('left');
      } else {
        if      (dy >  MIN) movePlayer('down');
        else if (dy < -MIN) movePlayer('up');
      }
    });

  // --- หน้าจอ Resize ---
  let resizeTimer;
  $(window).on('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.running) {
        const cfg = LEVELS[state.currentLevelIdx];
        computeCellSize(cfg);
        canvas.width  = cfg.cols * state.cellSize;
        canvas.height = cfg.rows * state.cellSize;
        darkCanvas.width  = canvas.width;
        darkCanvas.height = canvas.height;
      }
    }, 200);
  });

  /* ===================================================
     INIT — เริ่มต้นระบบ
  =================================================== */
  function init() {
    createStars();
    updateStartHighScore();
    showScreen('start-screen');
  }

  init();

}); // end jQuery document ready
