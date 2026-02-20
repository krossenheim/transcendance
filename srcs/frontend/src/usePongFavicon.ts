import { useEffect, useRef } from 'react';
// @ts-expect-error Vite worker import
import FaviconWorker from './faviconWorker?worker';

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
 * Uses a Web Worker to offload the expensive toDataURL operation off the main thread.
 */
export function usePongFavicon({
  isPlaying,
  scores,
  ballPosition,
  paddle1Y = 0.5,
  paddle2Y = 0.5,
}: PongFaviconOptions) {
  const workerRef = useRef<Worker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRunningRef = useRef<boolean>(false);
  const pendingFrameRef = useRef<boolean>(false);
  
  // Use refs for frequently changing values to avoid recreating effects
  const ballPositionRef = useRef(ballPosition);
  const paddle1YRef = useRef(paddle1Y);
  const paddle2YRef = useRef(paddle2Y);
  
  // Update refs on prop changes
  useEffect(() => {
    ballPositionRef.current = ballPosition;
    paddle1YRef.current = paddle1Y;
    paddle2YRef.current = paddle2Y;
  }, [ballPosition, paddle1Y, paddle2Y]);
  
  // Simulated ball state for when real position isn't provided
  const simulatedBallRef = useRef({
    x: 16,
    y: 16,
    dx: 1.5,
    dy: 1,
  });

  // Animation loop using Web Worker
  useEffect(() => {
    if (!isPlaying) {
      // Stop animation and restore static favicon
      isRunningRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      
      // Restore static pong favicon
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      const staticFavicon = createStaticPongFavicon();
      if (staticFavicon) {
        link.href = staticFavicon;
      }
      return;
    }

    // Create worker
    const worker = new FaviconWorker();
    workerRef.current = worker;
    isRunningRef.current = true;
    pendingFrameRef.current = false;

    // Get favicon link
    let faviconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!faviconLink) {
      faviconLink = document.createElement('link');
      faviconLink.rel = 'icon';
      faviconLink.type = 'image/png';
      document.head.appendChild(faviconLink);
    }
    const link = faviconLink;

    // Handle worker messages
    worker.onmessage = (e: MessageEvent<{ type: string; blob?: Blob }>) => {
      if (e.data.type === 'frame' && e.data.blob) {
        // Create object URL from blob (fast, doesn't block)
        const url = URL.createObjectURL(e.data.blob);
        const oldUrl = link.href;
        link.href = url;
        
        // Revoke old object URL to prevent memory leaks
        if (oldUrl.startsWith('blob:')) {
          URL.revokeObjectURL(oldUrl);
        }
        
        pendingFrameRef.current = false;
      }
    };

    let lastUpdate = 0;
    const updateInterval = 50; // Target ~20 FPS for favicon

    const animate = (timestamp: number) => {
      if (!isRunningRef.current) return;
      
      // Only request new frame if previous one is done (prevents queue buildup)
      if (timestamp - lastUpdate >= updateInterval && !pendingFrameRef.current) {
        const w = 32;
        const h = 32;
        const paddleWidth = 2;
        const paddleMargin = 3;
        
        let ballX: number, ballY: number;
        
        if (ballPositionRef.current) {
          // Map real game coordinates to favicon
          ballX = (ballPositionRef.current.x / 800) * w;
          ballY = (ballPositionRef.current.y / 600) * h;
          ballX = Math.max(4, Math.min(w - 4, ballX));
          ballY = Math.max(4, Math.min(h - 4, ballY));
        } else {
          // Update simulated ball
          const ball = simulatedBallRef.current;
          ball.x += ball.dx;
          ball.y += ball.dy;
          
          const bounceMargin = 4;
          if (ball.y <= bounceMargin || ball.y >= h - bounceMargin) {
            ball.dy *= -1;
            ball.y = Math.max(bounceMargin, Math.min(h - bounceMargin, ball.y));
          }
          const leftBound = paddleMargin + paddleWidth + 3;
          const rightBound = w - paddleMargin - paddleWidth - 3;
          if (ball.x <= leftBound) {
            ball.dx = Math.abs(ball.dx);
            ball.x = leftBound;
          }
          if (ball.x >= rightBound) {
            ball.dx = -Math.abs(ball.dx);
            ball.x = rightBound;
          }
          
          ballX = ball.x;
          ballY = ball.y;
        }
        
        pendingFrameRef.current = true;
        worker.postMessage({
          type: 'draw',
          ballX,
          ballY,
          paddle1Y: paddle1YRef.current,
          paddle2Y: paddle2YRef.current,
        });
        
        lastUpdate = timestamp;
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      isRunningRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      worker.terminate();
    };
  }, [isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);
}

export default usePongFavicon;
