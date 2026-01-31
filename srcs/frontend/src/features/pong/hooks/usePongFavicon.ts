import { useEffect, useRef, useCallback } from 'react';

interface PongFaviconOptions {
  isPlaying: boolean;
  scores?: { left: number; right: number } | null;
  ballPosition?: { x: number; y: number } | null;
  paddle1Y?: number;
  paddle2Y?: number;
}

// Generate a static pong favicon and set it immediately on module load
function createStaticPongFavicon(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  
  // Dark background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, 32, 32);
  
  // Border
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 30, 30);
  
  // Center dashed line
  ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(16, 3);
  ctx.lineTo(16, 29);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Left paddle (cyan)
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(4, 10, 3, 12);
  
  // Right paddle (pink)
  ctx.fillStyle = '#f472b6';
  ctx.fillRect(25, 10, 3, 12);
  
  // Ball (yellow with glow)
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(16, 16, 3, 0, Math.PI * 2);
  ctx.fill();
  
  return canvas.toDataURL('image/png');
}

// Set static favicon on initial load
if (typeof document !== 'undefined') {
  const staticFavicon = createStaticPongFavicon();
  if (staticFavicon) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = staticFavicon;
  }
}

/**
 * Custom hook that renders a 2D pong game animation in the favicon during gameplay.
 * Also updates the page title to show "TRANSCENDENCE" with optional score display.
 */
export function usePongFavicon({
  isPlaying,
  scores,
  ballPosition,
  paddle1Y = 0.5,
  paddle2Y = 0.5,
}: PongFaviconOptions) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const originalFaviconRef = useRef<string | null>(null);
  const originalTitleRef = useRef<string | null>(null);
  
  // Simulated ball state for when real position isn't provided
  const simulatedBallRef = useRef({
    x: 16,
    y: 16,
    dx: 1.5,
    dy: 1,
  });

  // Get or create the canvas for drawing
  const getCanvas = useCallback(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 32;
      canvasRef.current.height = 32;
    }
    return canvasRef.current;
  }, []);

  // Get or create favicon link element
  const getFaviconLink = useCallback(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      document.head.appendChild(link);
    }
    return link;
  }, []);

  // Save original favicon
  useEffect(() => {
    const link = getFaviconLink();
    if (!originalFaviconRef.current && link.href) {
      originalFaviconRef.current = link.href;
    }
    originalTitleRef.current = document.title || 'TRANSCENDENCE';
  }, [getFaviconLink]);

  // Draw the pong game on canvas
  const drawPongFrame = useCallback((ctx: CanvasRenderingContext2D) => {
    const canvas = ctx.canvas;
    const w = canvas.width;
    const h = canvas.height;
    
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
    
    // Get ball position (use simulated if not provided)
    let ballX: number, ballY: number;
    
    if (ballPosition) {
      // Map real game coordinates to favicon (assuming game is 800x600 or similar)
      ballX = (ballPosition.x / 800) * w;
      ballY = (ballPosition.y / 600) * h;
      // Clamp to bounds
      ballX = Math.max(4, Math.min(w - 4, ballX));
      ballY = Math.max(4, Math.min(h - 4, ballY));
    } else {
      // Update simulated ball
      const ball = simulatedBallRef.current;
      ball.x += ball.dx;
      ball.y += ball.dy;
      
      // Bounce off top/bottom
      if (ball.y <= 4 || ball.y >= h - 4) {
        ball.dy *= -1;
        ball.y = Math.max(4, Math.min(h - 4, ball.y));
      }
      
      // Bounce off paddles (simplified)
      if (ball.x <= paddleMargin + paddleWidth + 3) {
        ball.dx = Math.abs(ball.dx);
        ball.x = paddleMargin + paddleWidth + 3;
      }
      if (ball.x >= w - paddleMargin - paddleWidth - 3) {
        ball.dx = -Math.abs(ball.dx);
        ball.x = w - paddleMargin - paddleWidth - 3;
      }
      
      ballX = ball.x;
      ballY = ball.y;
    }
    
    // Draw ball with glow effect
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(ballX, ballY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    
  }, [ballPosition, paddle1Y, paddle2Y]);

  // Title is static, no updates needed
  const updateTitle = useCallback(() => {
    // Static title - no updates
  }, []);

  // Animation loop
  useEffect(() => {
    console.log('[PongFavicon] isPlaying changed:', isPlaying);
    
    if (!isPlaying) {
      // Restore original favicon and title when not playing
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Restore static pong favicon
      const link = getFaviconLink();
      const staticFavicon = createStaticPongFavicon();
      if (staticFavicon) {
        link.href = staticFavicon;
      }
      return;
    }

    console.log('[PongFavicon] Starting animation!');
    const canvas = getCanvas();
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('[PongFavicon] Could not get canvas context');
      return;
    }

    const faviconLink = getFaviconLink();
    let lastUpdate = 0;
    const updateInterval = 50; // Update favicon every 50ms (20 FPS for the favicon)

    const animate = (timestamp: number) => {
      if (timestamp - lastUpdate >= updateInterval) {
        drawPongFrame(ctx);
        faviconLink.href = canvas.toDataURL('image/png');
        updateTitle();
        lastUpdate = timestamp;
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    console.log('[PongFavicon] Animation started');

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, getCanvas, getFaviconLink, drawPongFrame, updateTitle]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      const link = getFaviconLink();
      if (originalFaviconRef.current) {
        link.href = originalFaviconRef.current;
      }
    };
  }, [getFaviconLink]);
}

export default usePongFavicon;
