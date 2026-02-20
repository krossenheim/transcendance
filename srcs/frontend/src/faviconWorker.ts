// Web Worker for generating favicon frames off the main thread

interface FaviconMessage {
  type: 'draw';
  ballX: number;
  ballY: number;
  paddle1Y: number;
  paddle2Y: number;
}

const canvas = new OffscreenCanvas(32, 32);
const ctx = canvas.getContext('2d')!;

function drawPongFrame(ballX: number, ballY: number, paddle1Y: number, paddle2Y: number) {
  const w = 32;
  const h = 32;
  
  // Clear with dark background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, w, h);
  
  // Draw border
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 1;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  
  // Draw center dashed line
  ctx.strokeStyle = '#4ade8060';
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(w / 2, 2);
  ctx.lineTo(w / 2, h - 2);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Paddle dimensions
  const paddleWidth = 2;
  const paddleHeight = 8;
  const paddleMargin = 3;
  
  // Draw left paddle (cyan)
  ctx.fillStyle = '#22d3ee';
  const p1Y = paddle1Y * (h - paddleHeight - 4) + 2;
  ctx.fillRect(paddleMargin, p1Y, paddleWidth, paddleHeight);
  
  // Draw right paddle (magenta)
  ctx.fillStyle = '#f472b6';
  const p2Y = paddle2Y * (h - paddleHeight - 4) + 2;
  ctx.fillRect(w - paddleMargin - paddleWidth, p2Y, paddleWidth, paddleHeight);
  
  // Draw ball with glow effect
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(ballX, ballY, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

self.onmessage = async (e: MessageEvent<FaviconMessage>) => {
  if (e.data.type === 'draw') {
    const { ballX, ballY, paddle1Y, paddle2Y } = e.data;
    drawPongFrame(ballX, ballY, paddle1Y, paddle2Y);
    
    // Convert to blob (async, non-blocking)
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    
    // Send back the blob for the main thread to use
    (self as unknown as Worker).postMessage({ type: 'frame', blob });
  }
};

export {};
