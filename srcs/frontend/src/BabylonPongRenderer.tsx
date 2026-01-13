"use client"

import { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from "react"
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  ShadowGenerator,
  DirectionalLight,
  type Mesh,
  PointLight,
  Vector2,
  PolygonMeshBuilder,
  DynamicTexture,
  Quaternion,
} from "@babylonjs/core"
import earcut from "earcut"
import type { TypeGameStateSchema } from "./types/pong-interfaces"
import { getUserColorBabylon, getUserColorCSS } from "./userColorUtils"

const BACKEND_WIDTH = 1000
const BACKEND_HEIGHT = 1000
const SCALE_FACTOR = 0.02 // Scale down the world
const BALL_RADIUS = 0.2 // Half of diameter 0.4
// Tunable offset for paddle rotation to match backend angle convention.
// If paddles appear rotated by 90deg, change this to Math.PI/2 or 0 accordingly.
const PADDLE_ROTATION_OFFSET = 0 // adjust to Math.PI/2 if needed

// Create a beach ball texture with classic vertical stripes that wrap around the sphere
function createBeachBallTexture(scene: Scene): DynamicTexture {
  const textureSize = 512
  const texture = new DynamicTexture("beachBallTexture", textureSize, scene, true)
  const ctx = texture.getContext()

  // Classic beach ball colors - 6 panels alternating with white
  const panelColors = ["#FF2222", "#FFDD00", "#2266FF", "#22CC22", "#FF6600", "#CC22CC"]
  const numPanels = 6
  const stripeWidth = textureSize / numPanels

  // Fill background white
  ctx.fillStyle = "#FFFFFF"
  ctx.fillRect(0, 0, textureSize, textureSize)

  // Draw vertical stripes (these will wrap around the sphere as longitude lines)
  for (let i = 0; i < numPanels; i++) {
    ctx.fillStyle = panelColors[i]!
    // Each colored stripe is slightly narrower than the white gap
    const stripeStart = i * stripeWidth + stripeWidth * 0.1
    const stripeW = stripeWidth * 0.8
    ctx.fillRect(stripeStart, 0, stripeW, textureSize)
  }

  // Add subtle seam lines between panels for realism
  ctx.strokeStyle = "rgba(0, 0, 0, 0.15)"
  ctx.lineWidth = 2
  for (let i = 0; i <= numPanels; i++) {
    ctx.beginPath()
    ctx.moveTo(i * stripeWidth, 0)
    ctx.lineTo(i * stripeWidth, textureSize)
    ctx.stroke()
  }

  // Add top and bottom cap circles (white with subtle outline)
  const capRadius = textureSize * 0.08
  // Top cap (near V=0)
  ctx.fillStyle = "#FFFFFF"
  ctx.beginPath()
  ctx.arc(textureSize / 2, capRadius, capRadius, 0, 2 * Math.PI)
  ctx.fill()
  ctx.strokeStyle = "rgba(0, 0, 0, 0.2)"
  ctx.lineWidth = 2
  ctx.stroke()

  // Bottom cap (near V=1)
  ctx.fillStyle = "#FFFFFF"
  ctx.beginPath()
  ctx.arc(textureSize / 2, textureSize - capRadius, capRadius, 0, 2 * Math.PI)
  ctx.fill()
  ctx.stroke()

  texture.update()
  return texture
}

// Export helper to get CSS color for a paddle ID (uses same colors as user colors)
export function getPaddleColorCSS(paddleId: number, darkMode = true): string {
  return getUserColorCSS(paddleId, darkMode)
}

interface BabylonPongRendererProps {
  gameState: TypeGameStateSchema | null
  darkMode?: boolean
}

const BabylonPongRenderer = forwardRef(function BabylonPongRenderer(
  { gameState, darkMode = true, paddleRotationOffset = PADDLE_ROTATION_OFFSET }: BabylonPongRendererProps & { paddleRotationOffset?: number },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const engineRef = useRef<Engine | null>(null)

  // Favicon animation refs
  const faviconCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const faviconAnimationRef = useRef<number | null>(null)
  const simulatedBallRef = useRef({ x: 16, y: 16, dx: 1.5, dy: 1 })

  // Store references
  const paddlesRef = useRef<Map<number, Mesh>>(new Map())
  const ballsRef = useRef<Map<number, Mesh>>(new Map())
  const ballLightsRef = useRef<Map<number, PointLight>>(new Map())
  const edgesRef = useRef<Mesh[]>([])
  const floorRef = useRef<Mesh | null>(null)
  const shadowGeneratorRef = useRef<ShadowGenerator | null>(null)

  // Sound effects
  const paddleSoundsRef = useRef<Map<number, { play: () => void; dispose: () => void }>>(new Map())

  // Track previous ball velocities to detect bounces and which paddle was hit
  const previousBallVelocitiesRef = useRef<Map<number, { dx: number; dy: number }>>(new Map())

  // Track ball rotation for realistic rolling effect (using quaternions)
  const ballRotationsRef = useRef<Map<number, Quaternion>>(new Map())

  // Track squash animation state per ball
  // When a ball bounces, we animate: squash (flatten) -> stretch -> normal
  interface SquashState {
    active: boolean
    startTime: number
    impactAngle: number  // Direction of impact (radians) for oriented squash
    impactSpeed: number  // Speed at impact - faster = more squash
  }
  const ballSquashRef = useRef<Map<number, SquashState>>(new Map())

  // Powerups: stable meshes keyed by spawnTime (string) + index fallback
  const powerupsRef = useRef<Map<string, Mesh>>(new Map())

  // Store beach ball texture reference
  const beachBallTextureRef = useRef<DynamicTexture | null>(null)

  // Lerp-based smoothing: store target positions and let Babylon's render loop interpolate
  // This decouples React state updates from rendering for smoother motion
  interface LerpTarget {
    targetPos: Vector3
    targetScaleX: number
    targetScaleY: number
    targetScaleZ: number
    // Velocity for extrapolation (in world units per second)
    velocityX: number
    velocityZ: number
    lastUpdateTime: number
    // Visual radius for correct rotation calculation
    visualRadius: number
  }
  const ballTargetsRef = useRef<Map<number, LerpTarget>>(new Map())
  const paddleTargetsRef = useRef<Map<number, Vector3>>(new Map())
  const smoothedVelocitiesRef = useRef<Map<number, { vx: number; vz: number }>>(new Map())
  const lastFrameDeltaRef = useRef<number>(16.667) // Default to 60fps
  const EXPECTED_FRAME_MS = 16.667 // 60fps target

  // Favicon animation during gameplay
  useEffect(() => {
    console.log('[BabylonPongRenderer] Starting favicon animation');
    
    // Create favicon canvas
    if (!faviconCanvasRef.current) {
      faviconCanvasRef.current = document.createElement('canvas');
      faviconCanvasRef.current.width = 32;
      faviconCanvasRef.current.height = 32;
    }
    
    const canvas = faviconCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Get or create favicon link
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      document.head.appendChild(link);
    }
    
    let lastUpdate = 0;
    const updateInterval = 50; // 20 FPS for favicon
    
    const drawFrame = () => {
      const w = 32, h = 32;
      
      // Helper to flip Y coordinate (game Y goes down, but we want up in favicon)
      const flipY = (y: number) => h - y;
      
      // Dark background
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, w, h);
      
      // Border
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 1;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      
      // Center dashed line
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(16, 2);
      ctx.lineTo(16, 30);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw all paddles from game state
      const fallbackPaddleColors = ['#22d3ee', '#f472b6', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#60a5fa', '#c084fc'];
      if (gameState?.paddles?.length) {
        gameState.paddles.forEach((paddle, idx) => {
          if (!paddle) return;
          // Map paddle position to favicon coordinates (with Y flip)
          const px = (paddle.x / BACKEND_WIDTH) * w;
          const py = flipY((paddle.y / BACKEND_HEIGHT) * h);
          // Clamp to bounds
          const clampedX = Math.max(4, Math.min(w - 4, px));
          const clampedY = Math.max(4, Math.min(h - 4, py));
          // Use owner_id to get consistent color with the 3D game
          const ownerId = (paddle as any).owner_id ?? (paddle as any).ownerId ?? idx;
          ctx.fillStyle = getUserColorCSS(ownerId, true) || fallbackPaddleColors[idx % fallbackPaddleColors.length];
          
          // Use canvas rotation to draw paddle at correct angle (negate rotation for flip)
          ctx.save();
          ctx.translate(clampedX, clampedY);
          ctx.rotate(-(paddle.r || 0) + Math.PI / 2);
          // Draw paddle centered on origin (length 8, width 2)
          ctx.fillRect(-4, -1, 8, 2);
          ctx.restore();
        });
      } else {
        // Fallback: draw static paddles if no game state
        ctx.fillStyle = '#22d3ee';
        ctx.fillRect(3, 12, 2, 8);
        ctx.fillStyle = '#f472b6';
        ctx.fillRect(w - 5, 12, 2, 8);
      }
      
      // Draw all balls from game state
      const ballColors = ['#fbbf24', '#f87171', '#4ade80', '#60a5fa', '#c084fc'];
      const balls = gameState?.balls || [];
      if (balls.length > 0) {
        for (let idx = 0; idx < balls.length; idx++) {
          const ball = balls[idx];
          if (!ball) continue;
          let ballX = (ball.x / BACKEND_WIDTH) * w;
          let ballY = flipY((ball.y / BACKEND_HEIGHT) * h);
          ballX = Math.max(3, Math.min(w - 3, ballX));
          ballY = Math.max(3, Math.min(h - 3, ballY));
          
          // Scale ball radius - backend default is ~10 for 1000x1000, scale proportionally
          // Normal ball ~10 radius -> ~2px in favicon, bigger balls should be visibly larger
          const baseRadius = ball.radius || 10;
          const scaledRadius = Math.max(1.5, Math.min(5, (baseRadius / 10) * 2));
          
          // Draw ball with glow
          const color = ballColors[idx % ballColors.length];
          ctx.shadowColor = color;
          ctx.shadowBlur = 3;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(ballX, ballY, scaledRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      } else {
        // Simulate ball when no game state
        const sim = simulatedBallRef.current;
        sim.x += sim.dx;
        sim.y += sim.dy;
        if (sim.y <= 4 || sim.y >= h - 4) sim.dy *= -1;
        if (sim.x <= 6 || sim.x >= w - 6) sim.dx *= -1;
        sim.x = Math.max(4, Math.min(w - 4, sim.x));
        sim.y = Math.max(4, Math.min(h - 4, sim.y));
        
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(sim.x, flipY(sim.y), 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      
      // Draw powerups as small diamonds - colors match Babylon renderer
      // Type mapping from Babylon: 0=ADD_BALL(orange), 1=INC_PADDLE_SPEED(red), 2=DEC_PADDLE_SPEED(blue),
      // 3=SUPER_SPEED(purple), 4=INC_BALL_SIZE(green), 5=DEC_BALL_SIZE(yellow), 6=REVERSE_CONTROLS(pink)
      const powerupColors: { [key: number]: string } = {
        0: '#e69919', // ADD_BALL -> orange
        1: '#e63333', // INCREASE_PADDLE_SPEED -> red
        2: '#3399e6', // DECREASE_PADDLE_SPEED -> blue
        3: '#cc4de6', // SUPER_SPEED -> purple
        4: '#33e64d', // INCREASE_BALL_SIZE -> green
        5: '#e6e633', // DECREASE_BALL_SIZE -> yellow
        6: '#e666b3', // REVERSE_CONTROLS -> pink
      };
      const powerups = gameState?.powerups || [];
      if (powerups.length > 0) {
        for (const powerup of powerups) {
          if (!powerup) continue;
          // Powerup array format: [x, y, vx, vy, radius, spawnTime, type, duration, activationStart]
          let px: number, py: number, ptype: number;
          if (Array.isArray(powerup)) {
            px = Number(powerup[0]) || 0;
            py = Number(powerup[1]) || 0;
            // Type is at index 6
            ptype = Number(powerup[6]) ?? 0;
          } else {
            px = (powerup as any).x || 0;
            py = (powerup as any).y || 0;
            ptype = (powerup as any).type ?? 0;
          }
          
          const ppx = (px / BACKEND_WIDTH) * w;
          const ppy = flipY((py / BACKEND_HEIGHT) * h);
          const clampedPx = Math.max(3, Math.min(w - 3, ppx));
          const clampedPy = Math.max(3, Math.min(h - 3, ppy));
          
          ctx.fillStyle = powerupColors[ptype] || '#ffffff';
          ctx.globalAlpha = 0.9;
          // Draw as diamond
          ctx.beginPath();
          ctx.moveTo(clampedPx, clampedPy - 3);
          ctx.lineTo(clampedPx + 3, clampedPy);
          ctx.lineTo(clampedPx, clampedPy + 3);
          ctx.lineTo(clampedPx - 3, clampedPy);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    };
    
    const animate = (timestamp: number) => {
      if (timestamp - lastUpdate >= updateInterval) {
        drawFrame();
        link!.href = canvas.toDataURL('image/png');
        
        // Update title with scores
        lastUpdate = timestamp;
      }
      faviconAnimationRef.current = requestAnimationFrame(animate);
    };
    
    faviconAnimationRef.current = requestAnimationFrame(animate);
    console.log('[BabylonPongRenderer] Favicon animation started');
    
    return () => {
      if (faviconAnimationRef.current) {
        cancelAnimationFrame(faviconAnimationRef.current);
      }
      // Restore static favicon
      console.log('[BabylonPongRenderer] Favicon animation stopped');
    };
  }, [gameState]);

  // Initialize Babylon scene
  useEffect(() => {
    if (!canvasRef.current) return

    const engine = new Engine(canvasRef.current, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    })
    engineRef.current = engine

    const scene = new Scene(engine)
    // Dark mode: deep blue-ish background, Light mode: light gray-white
    const bgColor = darkMode ? new Color3(0.05, 0.05, 0.1) : new Color3(0.9, 0.92, 0.95)
    scene.clearColor = bgColor.toColor4()
    sceneRef.current = scene

    // Create synthetic bounce sounds using Web Audio API - use oscillator for reliable playback
    const createBounceSound = (frequency: number, duration: number, name: string) => {
      // Instead of pre-generating, we'll play using Web Audio API directly
      // This is more reliable than trying to create WAV files
      return {
        play: () => {
          try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

            // Create oscillator
            const oscillator = audioContext.createOscillator()
            const gainNode = audioContext.createGain()

            oscillator.type = 'sine'
            oscillator.frequency.value = frequency

            // Exponential decay envelope
            const now = audioContext.currentTime
            gainNode.gain.setValueAtTime(0.3, now)
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration)

            oscillator.connect(gainNode)
            gainNode.connect(audioContext.destination)

            oscillator.start(now)
            oscillator.stop(now + duration)

            // Clean up after sound finishes
            oscillator.onended = () => {
              oscillator.disconnect()
              gainNode.disconnect()
              audioContext.close()
            }

            console.log(`[Pong Sound] ${name} played with Web Audio API`)
          } catch (error) {
            console.warn(`[Pong Sound] Failed to play ${name}:`, error)
          }
        },
        dispose: () => {
          // Nothing to dispose
        }
      }
    }

    // Initialize sounds for each paddle (8 different frequencies)
    // Using a pentatonic scale for pleasant tones: C, D, E, G, A, C, D, E
    const frequencies = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51]
    for (let i = 0; i < 8; i++) {
      paddleSoundsRef.current.set(i, createBounceSound(frequencies[i]!, 0.08, `paddle${i}`))
    }

    console.log("[Pong Sound] 8 paddle sounds initialized (Web Audio API)")

    // Camera
    const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 25, Vector3.Zero(), scene)
    camera.attachControl(canvasRef.current, true)
    camera.lowerRadiusLimit = 10
    camera.upperRadiusLimit = 50

    // Lights
    const hemiLight = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene)
    hemiLight.intensity = 0.3

    const dirLight = new DirectionalLight("dir", new Vector3(-1, -2, -1), scene)
    dirLight.position = new Vector3(20, 40, 20)
    dirLight.intensity = 0.8

    const shadowGenerator = new ShadowGenerator(1024, dirLight)
    shadowGenerator.useBlurExponentialShadowMap = true
    shadowGenerator.blurKernel = 32
    shadowGeneratorRef.current = shadowGenerator

    // Register ball and paddle movement using onBeforeRenderObservable (like powerups)
    // This is more integrated with Babylon's render pipeline for smoother results
    scene.onBeforeRenderObservable.add(() => {
      const dt = engine.getDeltaTime()
      lastFrameDeltaRef.current = dt
      const dtSeconds = dt / 1000
      
      // Lerp alpha for smooth transitions (frame-rate independent)
      const lerpAlpha = Math.min(dt / EXPECTED_FRAME_MS, 1)
      
      // Frame-rate independent blend factors
      // These use exponential decay: blend = 1 - (1 - baseBlend)^(dt/targetDt)
      const velocityBlendBase = 0.2  // How quickly to adopt new velocity (per 16.67ms)
      const velocityBlendFactor = 1 - Math.pow(1 - velocityBlendBase, dt / EXPECTED_FRAME_MS)
      
      // Position correction settings
      const CORRECTION_START_DIST = 0.05  // Start correcting at this distance
      const CORRECTION_SNAP_DIST = 1.5    // Teleport if beyond this distance
      const CORRECTION_STRENGTH = 3.0     // How aggressively to correct (units per second per unit of error)
      
      // Update ball positions using PURE velocity-based movement with gentle position correction
      ballsRef.current.forEach((mesh, ballId) => {
        const target = ballTargetsRef.current.get(ballId)
        if (target) {
          // Get or initialize smoothed velocity
          let smoothed = smoothedVelocitiesRef.current.get(ballId)
          if (!smoothed) {
            smoothed = { vx: target.velocityX, vz: target.velocityZ }
            smoothedVelocitiesRef.current.set(ballId, smoothed)
          }
          
          // Check for major direction change (bounce) - if so, snap velocity immediately
          const smoothedSpeed = Math.sqrt(smoothed.vx * smoothed.vx + smoothed.vz * smoothed.vz)
          const targetSpeed = Math.sqrt(target.velocityX * target.velocityX + target.velocityZ * target.velocityZ)
          
          let isBounce = false
          if (smoothedSpeed > 0.001 && targetSpeed > 0.001) {
            const dotProduct = (smoothed.vx * target.velocityX + smoothed.vz * target.velocityZ) / (smoothedSpeed * targetSpeed)
            isBounce = dotProduct < 0.3 // More generous bounce detection
          }
          
          if (isBounce) {
            // Bounce detected: snap velocity and position immediately
            smoothed.vx = target.velocityX
            smoothed.vz = target.velocityZ
            mesh.position.x = target.targetPos.x
            mesh.position.z = target.targetPos.z
          } else {
            // Smoothly blend velocity using frame-rate independent factor
            smoothed.vx += (target.velocityX - smoothed.vx) * velocityBlendFactor
            smoothed.vz += (target.velocityZ - smoothed.vz) * velocityBlendFactor
          }
          
          // Pure velocity-based movement
          const frameMovementX = smoothed.vx * dtSeconds
          const frameMovementZ = smoothed.vz * dtSeconds
          
          mesh.position.x += frameMovementX
          mesh.position.z += frameMovementZ
          
          // Calculate position error from server
          const dx = target.targetPos.x - mesh.position.x
          const dz = target.targetPos.z - mesh.position.z
          const distanceToServer = Math.sqrt(dx * dx + dz * dz)
          
          if (distanceToServer >= CORRECTION_SNAP_DIST) {
            // Major desync - snap immediately
            mesh.position.x = target.targetPos.x
            mesh.position.z = target.targetPos.z
          } else if (distanceToServer > CORRECTION_START_DIST) {
            // Gentle correction: add a small force toward server position
            // This keeps balls from drifting too far while staying smooth
            const correctionAmount = Math.min(distanceToServer * CORRECTION_STRENGTH * dtSeconds, distanceToServer * 0.5)
            const correctionFactor = correctionAmount / distanceToServer
            mesh.position.x += dx * correctionFactor
            mesh.position.z += dz * correctionFactor
          }
          
          // Keep Y position consistent
          mesh.position.y = target.targetPos.y
          
          // Rolling rotation based on movement
          const moveDist2D = Math.sqrt(frameMovementX * frameMovementX + frameMovementZ * frameMovementZ)
          if (moveDist2D > 0.0001 && mesh.rotationQuaternion && target.visualRadius > 0) {
            const rotationAmount = -moveDist2D / target.visualRadius
            const currentRotation = ballRotationsRef.current.get(ballId) || Quaternion.Identity()
            const dirX = frameMovementX / moveDist2D
            const dirZ = frameMovementZ / moveDist2D
            const axisX = -dirZ
            const axisZ = dirX
            const incrementalRotation = Quaternion.RotationAxis(new Vector3(axisX, 0, axisZ), rotationAmount)
            const newRotation = incrementalRotation.multiply(currentRotation)
            newRotation.normalize()
            ballRotationsRef.current.set(ballId, newRotation)
            mesh.rotationQuaternion = newRotation
          }
          
          // Lerp scale (squash animation)
          mesh.scaling = Vector3.Lerp(
            mesh.scaling,
            new Vector3(target.targetScaleX, target.targetScaleY, target.targetScaleZ),
            lerpAlpha
          )
        }
      })
      
      // Update paddle positions using smooth lerp
      paddlesRef.current.forEach((mesh, paddleId) => {
        const targetPos = paddleTargetsRef.current.get(paddleId)
        if (targetPos) {
          mesh.position = Vector3.Lerp(mesh.position, targetPos, lerpAlpha * 0.8)
        }
      })
    })

    // Simplified render loop - just renders, all movement is in onBeforeRenderObservable
    engine.runRenderLoop(() => {
      scene.render()
    })

    const handleResize = () => engine.resize()
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      paddleSoundsRef.current.forEach(sound => sound.dispose())
      paddleSoundsRef.current.clear()

      // Clear all mesh references
      paddlesRef.current.clear()
      ballsRef.current.clear()
      ballLightsRef.current.clear()
      edgesRef.current = []
      floorRef.current = null
      previousBallVelocitiesRef.current.clear()
      // Dispose powerup meshes
      powerupsRef.current.forEach(m => m.dispose())
      powerupsRef.current.clear()

      scene.dispose()
      engine.dispose()
    }
  }, [])

  // Update scene colors when dark mode changes
  useEffect(() => {
    if (!sceneRef.current) return
    const scene = sceneRef.current

    // Update background color
    const bgColor = darkMode ? new Color3(0.05, 0.05, 0.1) : new Color3(0.9, 0.92, 0.95)
    scene.clearColor = bgColor.toColor4()

    // Update floor color if it exists
    if (floorRef.current?.material) {
      const floorMat = floorRef.current.material as StandardMaterial
      floorMat.diffuseColor = darkMode ? new Color3(0.1, 0.1, 0.15) : new Color3(0.85, 0.9, 0.85)
      floorMat.specularColor = darkMode ? new Color3(0.1, 0.1, 0.1) : new Color3(0.3, 0.3, 0.3)
    }

    // Update wall colors
    edgesRef.current.forEach((wall) => {
      if (wall.material) {
        const wallMat = wall.material as StandardMaterial
        wallMat.diffuseColor = darkMode ? new Color3(0.2, 0.2, 0.3) : new Color3(0.6, 0.65, 0.7)
        wallMat.emissiveColor = darkMode ? new Color3(0.1, 0.1, 0.2) : new Color3(0.3, 0.35, 0.4)
      }
    })

    // Update paddle colors
    paddlesRef.current.forEach((paddle) => {
      if (paddle.material) {
        const mat = paddle.material as StandardMaterial
        mat.diffuseColor = darkMode ? new Color3(0, 1, 0) : new Color3(0, 0.6, 0)
        mat.emissiveColor = darkMode ? new Color3(0, 0.4, 0) : new Color3(0, 0.2, 0)
      }
    })

    // Update ball colors
    ballsRef.current.forEach((ball) => {
      if (ball.material) {
        const mat = ball.material as StandardMaterial
        mat.diffuseColor = darkMode ? new Color3(1, 0, 0) : new Color3(0.8, 0.2, 0)
        mat.emissiveColor = darkMode ? new Color3(0.5, 0, 0) : new Color3(0.3, 0.1, 0)
      }
    })
  }, [darkMode])

  // Update game state
  useEffect(() => {
    console.log("[BabylonPongRenderer] Updating game state:", gameState)
    if (!gameState || !sceneRef.current) return

    const scene = sceneRef.current
    const shadowGenerator = shadowGeneratorRef.current

    // Helper to map backend coords to 3D
    const toWorld = (x: number, y: number, yPos = 0) => {
      return new Vector3((x - BACKEND_WIDTH / 2) * SCALE_FACTOR, yPos, (y - BACKEND_HEIGHT / 2) * SCALE_FACTOR)
    }

    // 1. Update Floor and Walls (only if edges change)
    if (gameState.edges && gameState.edges.length > 0) {
      // Check if we need to rebuild the floor/walls (e.g. if vertex count changed)
      // For simplicity, we rebuild if the floor doesn't exist or vertex count differs
      // In a real game, edges usually don't change often.

      // We can check if we already have the correct number of walls
      if (edgesRef.current.length !== gameState.edges.length) {
        // Dispose old
        edgesRef.current.forEach((m) => m.dispose())
        edgesRef.current = []
        if (floorRef.current) floorRef.current.dispose()

        // Build Floor Polygon
        const floorPoints = gameState.edges.map(
          (e) => new Vector2((e.x - BACKEND_WIDTH / 2) * SCALE_FACTOR, (e.y - BACKEND_HEIGHT / 2) * SCALE_FACTOR),
        )

        const floorBuilder = new PolygonMeshBuilder("floorPoly", floorPoints, scene, earcut as any)
        const floor = floorBuilder.build()
        floor.position.y = -0.1

        const floorMat = new StandardMaterial("floorMat", scene)
        // Dark mode: dark blue-gray, Light mode: light green/white
        floorMat.diffuseColor = darkMode ? new Color3(0.1, 0.1, 0.15) : new Color3(0.85, 0.9, 0.85)
        floorMat.specularColor = darkMode ? new Color3(0.1, 0.1, 0.1) : new Color3(0.3, 0.3, 0.3)
        floor.material = floorMat
        floor.receiveShadows = true
        floorRef.current = floor

        // Build Walls
        const wallHeight = 0.5
        const wallThickness = 0.2

        for (let i = 0; i < gameState.edges.length; i++) {
          const p1 = gameState.edges[i]!
          const p2 = gameState.edges[(i + 1) % gameState.edges.length]!

          const v1 = toWorld(p1.x, p1.y, 0)
          const v2 = toWorld(p2.x, p2.y, 0)

          const center = Vector3.Center(v1, v2)
          const len = Vector3.Distance(v1, v2)
          const dir = v2.subtract(v1).normalize()

          const wall = MeshBuilder.CreateBox(
            `wall_${i}`,
            {
              width: len,
              height: wallHeight,
              depth: wallThickness,
            },
            scene,
          )

          wall.position = center
          wall.position.y = wallHeight / 2 - 0.1 // Sunk slightly

          // Rotation: align local X with direction
          // atan2(z, x) gives angle in XZ plane
          const angle = Math.atan2(dir.z, dir.x)
          wall.rotation.y = -angle // Babylon rotation might need negation depending on coord system

          const wallMat = new StandardMaterial("wallMat", scene)
          // Dark mode: blue-purple, Light mode: light blue-gray
          wallMat.diffuseColor = darkMode ? new Color3(0.2, 0.2, 0.3) : new Color3(0.6, 0.65, 0.7)
          wallMat.emissiveColor = darkMode ? new Color3(0.1, 0.1, 0.2) : new Color3(0.3, 0.35, 0.4)
          wallMat.alpha = 0.5 // Semi-transparent walls
          wall.material = wallMat

          edgesRef.current.push(wall)
        }
      }
    }

    // 2. Update Paddles
    const activePaddleIds = new Set<number>()
    gameState.paddles.forEach((p) => {
      // Defensive handling: incoming payloads may rename fields or include null entries.
      const paddleId = (p as any).paddle_id ?? (p as any).id ?? (p as any).paddleId
      if (paddleId === undefined || paddleId === null) {
        console.warn("[BabylonPongRenderer] Skipping paddle with missing id:", p)
        return
      }

      activePaddleIds.add(paddleId)
      let mesh = paddlesRef.current.get(paddleId)
      const isNewPaddle = !mesh

      // Support multiple possible property names and provide sensible defaults
      const rawW = (p as any).w ?? (p as any).width ?? 10
      const rawL = (p as any).l ?? (p as any).length ?? 50
      const posX = (p as any).x ?? (p as any).posX ?? (p as any).px
      const posY = (p as any).y ?? (p as any).posY ?? (p as any).py
      const rot = (p as any).r ?? (p as any).rotation ?? 0
      const ownerId = (p as any).owner_id ?? (p as any).ownerId ?? paddleId

      if (!mesh) {
        const width = rawW * SCALE_FACTOR
        const length = rawL * SCALE_FACTOR
        mesh = MeshBuilder.CreateBox(
          `paddle_${paddleId}`,
          {
            width: length, // Length along the edge
            height: 0.5,
            depth: width, // Thickness
          },
          scene,
        )

        const mat = new StandardMaterial("paddleMat", scene)
        // Assign color based on owner_id so it matches username color everywhere
        const baseColor = getUserColorBabylon(ownerId)
        // Dark mode: full brightness, Light mode: darker version
        mat.diffuseColor = darkMode ? baseColor : baseColor.scale(0.6)
        mat.emissiveColor = darkMode ? baseColor.scale(0.4) : baseColor.scale(0.2)
        mesh.material = mat

        if (shadowGenerator) shadowGenerator.addShadowCaster(mesh)
        paddlesRef.current.set(paddleId, mesh)
      }

      // Position - if x/y missing skip positioning and warn
      if (typeof posX !== "number" || typeof posY !== "number") {
        console.warn("[BabylonPongRenderer] Paddle missing x/y, skipping position:", paddleId, p)
      } else {
        const pos = toWorld(posX, posY, 0.25)
        // Set target for lerp-based smoothing (render loop will interpolate)
        paddleTargetsRef.current.set(paddleId, pos)
        // If paddle is new, snap to position immediately
        if (isNewPaddle) {
          mesh.position = pos
        }
      }

      // Rotation
      // p.r is the angle of the paddle's normal (facing center)
      // The paddle mesh length is along X. We want X to be perpendicular to normal.
      // Use a configurable offset to handle backend/frontend convention mismatches.
      mesh.rotation.y = -rot + (paddleRotationOffset ?? PADDLE_ROTATION_OFFSET)
    })

    // Cleanup missing paddles
    for (const [id, mesh] of paddlesRef.current) {
      if (!activePaddleIds.has(id)) {
        mesh.dispose()
        paddlesRef.current.delete(id)
        paddleTargetsRef.current.delete(id)
      }
    }

    // 3. Update Balls
    const activeBallIds = new Set<number>()
    gameState.balls.forEach((b) => {
      activeBallIds.add(b.id)
      let mesh = ballsRef.current.get(b.id)
      const isNewBall = !mesh

      if (!mesh) {
        // Create sphere with more segments for smoother texture mapping
        // Use backend radius (in backend units) mapped to world units via SCALE_FACTOR
        const backendRadius = Number(b.radius || 10)
        const worldRadius = Math.max(0.05, backendRadius * SCALE_FACTOR)
        const diameter = Math.max(0.05, worldRadius * 2)
        mesh = MeshBuilder.CreateSphere(`ball_${b.id}`, { diameter: diameter, segments: 32 }, scene)
        const mat = new StandardMaterial("ballMat", scene)

        // Create beach ball texture if not already created
        if (!beachBallTextureRef.current) {
          beachBallTextureRef.current = createBeachBallTexture(scene)
        }

        // Apply beach ball texture
        mat.diffuseTexture = beachBallTextureRef.current
        // Add slight emissive glow to make it visible in darker scenes
        mat.emissiveColor = darkMode ? new Color3(0.15, 0.15, 0.15) : new Color3(0.1, 0.1, 0.1)
        mat.specularColor = new Color3(0.3, 0.3, 0.3) // Slight shine like a real beach ball
        mesh.material = mat

        // Initialize rotation tracking for this ball using quaternion
        mesh.rotationQuaternion = Quaternion.Identity()
        ballRotationsRef.current.set(b.id, Quaternion.Identity())

        if (shadowGenerator) shadowGenerator.addShadowCaster(mesh)

        // Light
        const light = new PointLight(`ballLight_${b.id}`, new Vector3(0, 0, 0), scene)
        light.parent = mesh
        light.intensity = 0.5
        light.diffuse = new Color3(1, 0, 0)
        ballLightsRef.current.set(b.id, light)

        // store base diameter so we can scale reliably if backend radius changes later
        ;(mesh as any).metadata = { baseDiameter: diameter }
        ballsRef.current.set(b.id, mesh)

        console.log("[Pong Sound] New ball created:", b.id, "with direction:", b.dx, b.dy)
      }

      // Calculate distance moved since last update for rotation
      // const prevVelData = previousBallVelocitiesRef.current.get(b.id)
      const newPos = toWorld(b.x, b.y, 0.2)
      const oldPos = mesh.position.clone()

      // Update mesh scale if backend radius changed, and adjust Y position to keep ball on floor
      let adjustedYPos = newPos.y
      let actualVisualRadius = 0.2 // default fallback
      try {
        const backendRadius = Number(b.radius || 10)
        const worldRadius = Math.max(0.05, backendRadius * SCALE_FACTOR)
        const desiredDiameter = Math.max(0.05, worldRadius * 2)
        const baseDiameter = (mesh as any).metadata?.baseDiameter || desiredDiameter
        const baseScale = desiredDiameter / baseDiameter
        
        // Apply squash and stretch animation
        let scaleX = baseScale
        let scaleY = baseScale
        let scaleZ = baseScale
        
        const squashState = ballSquashRef.current.get(b.id)
        if (squashState?.active) {
          const elapsed = performance.now() - squashState.startTime
          const SQUASH_DURATION = 150 // ms for full squash/stretch cycle
          
          if (elapsed < SQUASH_DURATION) {
            // Animation progress (0 to 1)
            const t = elapsed / SQUASH_DURATION
            
            // Scale squash intensity based on impact speed
            const MIN_SPEED = 200
            const MAX_SPEED = 1000
            const MIN_INTENSITY = 0.12
            const MAX_INTENSITY = 0.35
            const speedNorm = Math.min(1, Math.max(0, (squashState.impactSpeed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)))
            const maxSquash = MIN_INTENSITY + speedNorm * (MAX_INTENSITY - MIN_INTENSITY)
            
            // Use a simple damped sine wave for natural bounce feel
            // Starts at 1, dips down (squash), overshoots up (stretch), settles to 1
            // Formula: 1 + amplitude * sin(phase) * decay
            const frequency = 2.5 // Number of oscillations
            const decay = Math.exp(-4 * t) // Exponential decay
            const phase = t * frequency * Math.PI * 2
            
            // Primary deformation along impact direction
            const deformation = maxSquash * Math.sin(phase) * decay
            
            // Get normalized impact direction in world XZ plane
            // impactAngle is in 2D game space, map to 3D: game X -> world X, game Y -> world Z
            const impactDirX = Math.cos(squashState.impactAngle)
            const impactDirZ = Math.sin(squashState.impactAngle)
            
            // Squash along impact direction, stretch perpendicular (volume preservation)
            // When deformation > 0: stretch along impact, squash perpendicular (ball elongating after bounce)
            // When deformation < 0: squash along impact, stretch perpendicular (ball compressing on impact)
            const alongImpact = 1 + deformation
            const perpendicular = 1 / Math.sqrt(alongImpact) // Volume preservation: V = x * y * z
            
            // Blend X and Z based on how aligned they are with impact direction
            const xAlignment = Math.abs(impactDirX)
            const zAlignment = Math.abs(impactDirZ)
            
            // X gets more "along impact" scaling when impact is horizontal (X-aligned)
            // Z gets more "along impact" scaling when impact is vertical (Z-aligned)
            scaleX = baseScale * (alongImpact * xAlignment + perpendicular * zAlignment)
            scaleZ = baseScale * (alongImpact * zAlignment + perpendicular * xAlignment)
            
            // Y (height) bulges out when ball is squashed horizontally - inverse of horizontal compression
            // This creates the "pancake then tall" effect
            scaleY = baseScale * perpendicular
          } else {
            // Animation complete
            ballSquashRef.current.set(b.id, { ...squashState, active: false })
          }
        }
        
        // The actual visual radius after scaling (use average for Y positioning)
        actualVisualRadius = (baseDiameter / 2) * baseScale
        
        // Adjust Y position so ball stays on the floor (scale from bottom, not center)
        // Floor is at y = -0.1, so ball center should be at -0.1 + radius
        const FLOOR_Y = -0.1
        adjustedYPos = FLOOR_Y + actualVisualRadius
        
        // Convert backend velocity to world units per second
        // Backend velocity is in backend units per second, scale to world units
        const worldVelocityX = (b.dx || 0) * SCALE_FACTOR
        const worldVelocityZ = (b.dy || 0) * SCALE_FACTOR
        
        // Set target for lerp-based smoothing with velocity extrapolation
        const targetPos = new Vector3(newPos.x, adjustedYPos, newPos.z)
        ballTargetsRef.current.set(b.id, {
          targetPos,
          targetScaleX: scaleX,
          targetScaleY: scaleY,
          targetScaleZ: scaleZ,
          velocityX: worldVelocityX,
          velocityZ: worldVelocityZ,
          lastUpdateTime: performance.now(),
          visualRadius: actualVisualRadius
        })
        
        // If ball is new, snap to position immediately
        if (isNewBall) {
          mesh.position = targetPos
          mesh.scaling = new Vector3(scaleX, scaleY, scaleZ)
        }
      } catch (e) {
        // ignore scaling errors
      }

      // Note: Rolling rotation is now handled in onBeforeRenderObservable for smoother animation
      // The rotation is calculated based on actual frame-by-frame movement there

      // Detect bounces by checking if velocity direction changed
      const prevVel = previousBallVelocitiesRef.current.get(b.id)
      if (prevVel) {
        // Check if direction has changed significantly (sign flip or major change)
        // Use a larger threshold to avoid false positives from client-side prediction jitter
        const velocityThreshold = 10 // Require significant velocity change to trigger sound
        const dxChanged = Math.abs(b.dx - prevVel.dx) > velocityThreshold
        const dyChanged = Math.abs(b.dy - prevVel.dy) > velocityThreshold
        
        // Also check if velocity actually flipped direction (more reliable bounce detection)
        const dxFlipped = (b.dx * prevVel.dx < 0) && Math.abs(b.dx) > 1 && Math.abs(prevVel.dx) > 1
        const dyFlipped = (b.dy * prevVel.dy < 0) && Math.abs(b.dy) > 1 && Math.abs(prevVel.dy) > 1

        if ((dxChanged || dyChanged) && (dxFlipped || dyFlipped)) {
          // Direction changed - find closest paddle and play its sound
          let closestPaddleIndex = 0
          let minDist = Infinity

          gameState.paddles.forEach((paddle, index) => {
            const dist = Math.sqrt(
              Math.pow(b.x - paddle.x, 2) + Math.pow(b.y - paddle.y, 2)
            )
            if (dist < minDist) {
              minDist = dist
              closestPaddleIndex = index
            }
          })

          const sound = paddleSoundsRef.current.get(closestPaddleIndex)
          if (sound) {
            try {
              sound.play()
            } catch (error) {
              console.warn("[Pong Sound] Failed to play:", error)
            }
          }
          
          // Trigger squash animation on bounce
          // Calculate impact angle from velocity change direction
          const impactAngle = Math.atan2(
            prevVel.dy - b.dy,  // Change in dy
            prevVel.dx - b.dx   // Change in dx
          )
          // Calculate impact speed (magnitude of velocity change)
          const impactSpeed = Math.sqrt(
            Math.pow(b.dx - prevVel.dx, 2) + Math.pow(b.dy - prevVel.dy, 2)
          )
          ballSquashRef.current.set(b.id, {
            active: true,
            startTime: performance.now(),
            impactAngle: impactAngle,
            impactSpeed: impactSpeed
          })
        }
      }

      // Store current velocity for next frame
      previousBallVelocitiesRef.current.set(b.id, { dx: b.dx, dy: b.dy })
    })

    // Cleanup missing balls
    // --- Powerups: create/update rotating shape meshes ---
    // gameState.powerups entries are arrays: [x, y, vx, vy, radius, spawnTime, type, duration, activationStart]
    if (gameState.powerups && Array.isArray(gameState.powerups)) {
      console.debug("[BabylonPongRenderer] Received powerups:", gameState.powerups)
      const activePowerupKeys = new Set<string>()
      gameState.powerups.forEach((p: any, pidx: number) => {
        try {
          const isArray = Array.isArray(p)
          const x = Number(isArray ? p[0] : p.x) || 0
          const y = Number(isArray ? p[1] : p.y) || 0
          const radius = Number(isArray ? p[4] : p.radius) || 10
          const spawnTime = String(isArray ? p[5] ?? pidx : (p.spawnTime ?? pidx))
          const rawType = isArray ? p[6] : p.type
          const typeIndex = Number(rawType)
          if (isNaN(typeIndex)) {
            console.warn("[BabylonPongRenderer] powerup type is not a number, raw:", rawType)
          }
          const key = `${spawnTime}_${pidx}`
          console.debug(`[BabylonPongRenderer] Powerup parsed: key=${key}, x=${x}, y=${y}, radius=${radius}, type=${typeIndex}`)
          activePowerupKeys.add(key)

          let mesh = powerupsRef.current.get(key)
          const size = Math.max(0.1, radius * SCALE_FACTOR)

          if (!mesh) {
            const name = `powerup_${key}`
            let created: Mesh | null = null
            const color = (() => {
              switch (typeIndex) {
                case 0: return new Color3(0.9, 0.6, 0.1) // ADD_BALL -> orange cube
                case 1: return new Color3(0.9, 0.2, 0.2) // INCREASE_PADDLE_SPEED -> red pyramid
                case 2: return new Color3(0.2, 0.6, 0.9) // DECREASE_PADDLE_SPEED -> blue pyramid
                case 3: return new Color3(0.8, 0.3, 0.9) // SUPER_SPEED -> purple octa
                case 4: return new Color3(0.2, 0.9, 0.3) // INCREASE_BALL_SIZE -> green dodeca
                case 5: return new Color3(0.9, 0.9, 0.2) // DECREASE_BALL_SIZE -> yellow rect prism
                case 6: return new Color3(0.9, 0.4, 0.7) // REVERSE_CONTROLS -> pink icosa
                default: return new Color3(0.8, 0.8, 0.8)
              }
            })()

            // Create shape depending on type
            switch (typeIndex) {
              case 1:
                // square pyramid
                created = MeshBuilder.CreateCylinder(name, { diameterTop: 0, diameterBottom: size * 2.0, height: size * 2.0, tessellation: 4 }, scene)
                break
              case 2:
                // hexagonal pyramid
                created = MeshBuilder.CreateCylinder(name, { diameterTop: 0, diameterBottom: size * 2.0, height: size * 2.2, tessellation: 6 }, scene)
                break
              case 3:
                // octahedron (polyhedron type 2)
                try {
                  created = MeshBuilder.CreatePolyhedron(name, { type: 2, size: size }, scene)
                } catch (e) {
                  created = MeshBuilder.CreateSphere(name, { diameter: size * 1.6, segments: 8 }, scene)
                }
                break
              case 4:
                // dodecahedron (polyhedron type 3)
                try {
                  created = MeshBuilder.CreatePolyhedron(name, { type: 3, size: size }, scene)
                } catch (e) {
                  created = MeshBuilder.CreateSphere(name, { diameter: size * 1.8, segments: 10 }, scene)
                }
                break
              case 5:
                // rectangular prism
                created = MeshBuilder.CreateBox(name, { width: size * 2.5, height: size * 1.2, depth: size * 1.4 }, scene)
                break
              case 6:
                // icosahedron (polyhedron type 4)
                try {
                  created = MeshBuilder.CreatePolyhedron(name, { type: 4, size: size }, scene)
                } catch (e) {
                  created = MeshBuilder.CreateSphere(name, { diameter: size * 1.6, segments: 8 }, scene)
                }
                break
              case 0:
              default:
                // cube for ADD_BALL and default
                created = MeshBuilder.CreateBox(name, { size: size * 1.6 }, scene)
                break
            }

            if (created) {
              mesh = created
              const mat = new StandardMaterial(name + "_mat", scene)
              mat.diffuseColor = color
              mat.emissiveColor = color.scale(0.25)
              mat.specularColor = new Color3(0.2, 0.2, 0.2)
              mesh.material = mat
              // Render powerups slightly lower than balls so they appear beneath them
              mesh.position = toWorld(x, y, 0.15)
              console.debug(`[BabylonPongRenderer] Created powerup mesh ${name} for type ${typeIndex}`)
              powerupsRef.current.set(key, mesh)
            }
          } else {
            // update position (keep powerups below balls)
            mesh.position = toWorld(x, y, 0.15)
            // Small debug to ensure updates are occurring
            // console.debug(`[BabylonPongRenderer] Updated powerup ${key} position to (${x},${y})`)
          }
        } catch (e) {
          console.warn("Failed to create/update powerup mesh", e)
        }
      })

      // Remove powerups that no longer exist in game state
      for (const [k, m] of powerupsRef.current) {
        if (!activePowerupKeys.has(k)) {
          try { m.dispose() } catch (e) { /* ignore */ }
          powerupsRef.current.delete(k)
        }
      }

      // Register a simple rotation if not already registered
      if (!scene.onBeforeRenderObservable.hasObservers()) {
        // If there are other before-render observers we don't want to clobber them; add our own observer anyway.
      }
      // Add a dedicated rotation observer (idempotent by checking custom flag)
      if (!(scene as any).__powerupRotationRegistered) {
        (scene as any).__powerupRotationRegistered = true
        scene.onBeforeRenderObservable.add(() => {
          const dt = scene.getEngine().getDeltaTime() / 1000 // seconds
          const rotSpeed = 0.9 // radians per second
          for (const mesh of powerupsRef.current.values()) {
            mesh.rotation.y += rotSpeed * dt
            mesh.rotation.x += (rotSpeed * 0.25) * dt
          }
        })
      }
    }
    for (const [id, mesh] of ballsRef.current) {
      if (!activeBallIds.has(id)) {
        const light = ballLightsRef.current.get(id)
        if (light) {
          light.dispose()
          ballLightsRef.current.delete(id)
        }
        mesh.dispose()
        ballsRef.current.delete(id)
        previousBallVelocitiesRef.current.delete(id)
        ballRotationsRef.current.delete(id)
        ballTargetsRef.current.delete(id)
        ballSquashRef.current.delete(id)
        smoothedVelocitiesRef.current.delete(id)
      }
    }
  }, [gameState, darkMode, paddleRotationOffset])

  // Expose imperative API to parent for screenshots
  useImperativeHandle(ref, () => ({
    takeScreenshot: () => {
      try {
        if (!canvasRef.current) return null
        return canvasRef.current.toDataURL("image/png")
      } catch (e) {
        console.warn("[BabylonPongRenderer] Screenshot failed:", e)
        return null
      }
    }
  }))

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        outline: "none"
      }}
    />
  )
})

export default BabylonPongRenderer
