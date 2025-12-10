// Powerup preview script
const POWERUPS = [
  'ADD_BALL',
  'INCREASE_PADDLE_SPEED',
  'DECREASE_PADDLE_SPEED',
  'SUPER_SPEED',
  'INCREASE_BALL_SIZE',
  'DECREASE_BALL_SIZE',
  'REVERSE_CONTROLS'
];

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const select = document.getElementById('powerupSelect');
const showAllBtn = document.getElementById('showAll');

// populate select
POWERUPS.forEach(p => {
  const opt = document.createElement('option'); opt.value = p; opt.textContent = p; select.appendChild(opt);
});

function fitCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  ctx.setTransform(ratio,0,0,ratio,0,0);
}

window.addEventListener('resize', () => { fitCanvas(); draw(); });
fitCanvas();

// drawing helpers
function drawRoundedRect(x,y,w,h,r,fill,stroke){
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  if(fill){ ctx.fillStyle = fill; ctx.fill(); }
  if(stroke){ ctx.strokeStyle = stroke; ctx.stroke(); }
}

function drawAddBall(x,y,scale=1){
  // small bouncing ball icon + small "+"
  const r = 14*scale;
  ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#222'; ctx.font = `${12*scale}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('+', x, y);
}

function drawPaddle(x,y,scale=1, color='#ff66cc'){
  const w = 70*scale, h = 14*scale;
  drawRoundedRect(x - w/2, y - h/2, w, h, 4*scale, color, 'rgba(0,0,0,0.2)');
}

function drawIncreasePaddle(x,y,scale=1){
  drawPaddle(x, y+8, scale);
  // up arrow
  ctx.beginPath(); ctx.moveTo(x, y-18*scale); ctx.lineTo(x-10*scale, y-2*scale); ctx.lineTo(x+10*scale, y-2*scale); ctx.closePath();
  ctx.fillStyle = '#7ee787'; ctx.fill();
}

function drawDecreasePaddle(x,y,scale=1){
  drawPaddle(x, y-4, scale);
  // down arrow
  ctx.beginPath(); ctx.moveTo(x, y+18*scale); ctx.lineTo(x-10*scale, y+2*scale); ctx.lineTo(x+10*scale, y+2*scale); ctx.closePath();
  ctx.fillStyle = '#ff9b9b'; ctx.fill();
}

function drawSuperSpeed(x,y,scale=1){
  // lightning bolt
  ctx.beginPath(); ctx.moveTo(x-8*scale,y-20*scale); ctx.lineTo(x+6*scale,y-4*scale); ctx.lineTo(x-2*scale,y-4*scale); ctx.lineTo(x+8*scale,y+18*scale); ctx.lineTo(x-6*scale,y+6*scale); ctx.lineTo(x+4*scale,y+6*scale); ctx.closePath();
  ctx.fillStyle = '#ffea6a'; ctx.fill();
  ctx.strokeStyle = '#e9d34b'; ctx.stroke();
}

function drawIncreaseBallSize(x,y,scale=1){
  ctx.fillStyle = '#8ad0ff'; ctx.beginPath(); ctx.arc(x,y,20*scale,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#222'; ctx.font = `${14*scale}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('+', x, y);
}

function drawDecreaseBallSize(x,y,scale=1){
  ctx.fillStyle = '#8ad0ff'; ctx.beginPath(); ctx.arc(x,y,10*scale,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#222'; ctx.font = `${12*scale}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('-', x, y);
}

function drawReverseControls(x,y,scale=1){
  // left and right arrows with small swap line
  ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 3*scale; ctx.beginPath();
  ctx.moveTo(x-36*scale,y); ctx.lineTo(x-8*scale,y);
  ctx.moveTo(x+36*scale,y); ctx.lineTo(x+8*scale,y);
  ctx.stroke();
  // arrowheads
  ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.moveTo(x-36*scale,y); ctx.lineTo(x-26*scale,y-8*scale); ctx.lineTo(x-26*scale,y+8*scale); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x+36*scale,y); ctx.lineTo(x+26*scale,y-8*scale); ctx.lineTo(x+26*scale,y+8*scale); ctx.closePath(); ctx.fill();
  // reversing curve
  ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1*scale; ctx.beginPath(); ctx.moveTo(x-4*scale,y-18*scale); ctx.quadraticCurveTo(x, y, x+4*scale,y+18*scale); ctx.stroke();
}

function drawLabel(text,x,y){ ctx.fillStyle='#cfd6ea'; ctx.font='13px sans-serif'; ctx.textAlign='center'; ctx.fillText(text,x,y+38); }

function clear(){ ctx.clearRect(0,0,canvas.width,canvas.height); }

function drawSingle(powerup){ clear(); const cx = canvas.width/ (window.devicePixelRatio||1) /2; const cy = canvas.height/(window.devicePixelRatio||1)/2;
  switch(powerup){
    case 'ADD_BALL': drawAddBall(cx,cy,1.7); break;
    case 'INCREASE_PADDLE_SPEED': drawIncreasePaddle(cx,cy,1.3); break;
    case 'DECREASE_PADDLE_SPEED': drawDecreasePaddle(cx,cy,1.3); break;
    case 'SUPER_SPEED': drawSuperSpeed(cx,cy,1.6); break;
    case 'INCREASE_BALL_SIZE': drawIncreaseBallSize(cx,cy,1.2); break;
    case 'DECREASE_BALL_SIZE': drawDecreaseBallSize(cx,cy,1.2); break;
    case 'REVERSE_CONTROLS': drawReverseControls(cx,cy,1.2); break;
  }
  drawLabel(powerup, cx, cy);
}

function drawAll(){ clear(); const cols = 4; const gutter = 30; const w = canvas.width/(window.devicePixelRatio||1);
  const cellW = (w - gutter*2) / cols; let x = gutter + cellW/2; let y = 70; let col = 0;
  for(let i=0;i<POWERUPS.length;i++){
    const p = POWERUPS[i];
    switch(p){
      case 'ADD_BALL': drawAddBall(x,y); break;
      case 'INCREASE_PADDLE_SPEED': drawIncreasePaddle(x,y); break;
      case 'DECREASE_PADDLE_SPEED': drawDecreasePaddle(x,y); break;
      case 'SUPER_SPEED': drawSuperSpeed(x,y); break;
      case 'INCREASE_BALL_SIZE': drawIncreaseBallSize(x,y); break;
      case 'DECREASE_BALL_SIZE': drawDecreaseBallSize(x,y); break;
      case 'REVERSE_CONTROLS': drawReverseControls(x,y); break;
    }
    drawLabel(p, x, y);
    col++; x += cellW; if(col>=cols){ col=0; x = gutter + cellW/2; y += 140; }
  }
}

// UI wiring
select.addEventListener('change', ()=>{ drawSingle(select.value); });
showAllBtn.addEventListener('click', ()=>{ drawAll(); });

// default
select.value = POWERUPS[0]; drawSingle(POWERUPS[0]);
