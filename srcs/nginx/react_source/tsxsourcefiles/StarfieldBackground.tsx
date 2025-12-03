import React, { useEffect, useRef } from 'react';

class Star {
  x: number;
  y: number;
  z: number;

  constructor(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

interface StarfieldBackgroundProps {
  starCount?: number;
  speed?: number;
  backgroundImage?: string;
}

export default function StarfieldBackground({ starCount = 500, speed = 4, backgroundImage }: StarfieldBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const depthStart = 2000;
    const depthMin = 5;

    let W = window.innerWidth;
    let H = window.innerHeight;

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize stars
    starsRef.current = [];
    for (let i = 0; i < starCount; i++) {
      starsRef.current.push(
        new Star(
          (Math.random() - 0.5) * W * 2,
          (Math.random() - 0.5) * H * 2,
          Math.random() * depthStart
        )
      );
    }

    const update = () => {
      // Clear canvas (transparent) - the CSS background image shows through
      ctx.clearRect(0, 0, W, H);

      for (const s of starsRef.current) {
        s.z -= speed;
        if (s.z < depthMin) {
          s.x = (Math.random() - 0.5) * W * 2;
          s.y = (Math.random() - 0.5) * H * 2;
          s.z = depthStart;
        }

        const f = 300 / s.z;
        const x = s.x * f + W / 2;
        const y = s.y * f + H / 2;

        let brightness = 1 - s.z / depthStart;
        brightness = Math.min(1, brightness);
        const shade = Math.floor(brightness * 255);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;

        const size = Math.max(1, 3 * f);
        ctx.fillRect(x, y, size, size);
      }

      animationRef.current = requestAnimationFrame(update);
    };
    update();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, [starCount, speed]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: -1,
        pointerEvents: 'none',
        backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}
