"use client"

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react"
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

  // Track ball rotation for realistic rolling effect (using quaternions)
  const ballRotationsRef = useRef<Map<number, Quaternion>>(new Map())
  
  // Track last velocity and smoothing state for bounce handling
  interface BallSmoothingState {
    vx: number
    vz: number
    // For adaptive smoothing during bounces
    lerpFactor: number
    lastServerX: number
    lastServerZ: number
    lastUpdateTime: number
  }
  const ballSmoothingRef = useRef<Map<number, BallSmoothingState>>(new Map())

  // Powerups: stable meshes keyed by spawnTime (string) + index fallback
  const powerupsRef = useRef<Map<string, Mesh>>(new Map())

  // Store beach ball texture reference
  const beachBallTextureRef = useRef<DynamicTexture | null>(null)

  // Store latest game state in a ref to bypass React for render loop reads
  const gameStateRef = useRef<TypeGameStateSchema | null>(null)
  gameStateRef.current = gameState // Always keep ref in sync

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
  
  // Track collected powerup keys to ensure they stay hidden
  const collectedPowerupsRef = useRef<Set<string>>(new Set())

  // Compute a key that only changes when entity counts change (for slow path useEffect)
  // NOTE: Powerups are now fully handled in render loop, no React dependency needed
  const entityKey = gameState 
    ? `${gameState.balls.length}_${gameState.paddles.length}_${gameState.edges?.length ?? 0}`
    : 'none'

  // Favicon animation during gameplay
  // NOTE: This effect only runs once (empty deps), reads gameState from ref
  useEffect(() => {
    // Debug logging disabled for performance
    // console.log('[BabylonPongRenderer] Starting favicon animation');
    
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
    const updateInterval = 1000; // 1 FPS - minimize favicon overhead
    let pendingFrame = false;
    
    const drawFrame = () => {
      pendingFrame = false;
      const gs = gameStateRef.current; // Read from ref, not prop
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
      if (gs?.paddles?.length) {
        gs.paddles.forEach((paddle, idx) => {
          if (!paddle) return;
          // Map paddle position to favicon coordinates (with Y flip)
          const px = (paddle.x / BACKEND_WIDTH) * w;
          const py = flipY((paddle.y / BACKEND_HEIGHT) * h);
          // Clamp to bounds
          const clampedX = Math.max(4, Math.min(w - 4, px));
          const clampedY = Math.max(4, Math.min(h - 4, py));
          // Use owner_id to get consistent color with the 3D game
          const ownerId = (paddle as any).owner_id ?? (paddle as any).ownerId ?? idx;
          ctx.fillStyle = getUserColorCSS(ownerId, true) ?? fallbackPaddleColors[idx % fallbackPaddleColors.length] ?? '#22d3ee';
          
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
      const balls = gs?.balls || [];
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
          
          // Draw ball without expensive shadow effects
          const color = ballColors[idx % ballColors.length] ?? '#fbbf24';
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(ballX, ballY, scaledRadius, 0, Math.PI * 2);
          ctx.fill();
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
        
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(sim.x, flipY(sim.y), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Skip powerups for performance (they're small anyway)
    };
    
    const animate = (timestamp: number) => {
      if (timestamp - lastUpdate >= updateInterval && !pendingFrame) {
        pendingFrame = true;
        // Use requestIdleCallback to avoid blocking render loop
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(() => {
            drawFrame();
            link!.href = canvas.toDataURL('image/x-icon');
          }, { timeout: 500 });
        } else {
          // Fallback: use setTimeout with 0 to defer to next event loop
          setTimeout(() => {
            drawFrame();
            link!.href = canvas.toDataURL('image/x-icon');
          }, 0);
        }
        lastUpdate = timestamp;
      }
      faviconAnimationRef.current = requestAnimationFrame(animate);
    };
    
    faviconAnimationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (faviconAnimationRef.current) {
        cancelAnimationFrame(faviconAnimationRef.current);
      }
    };
  }, []); // Empty deps - runs once, reads from gameStateRef

  // Initialize Babylon scene
  useEffect(() => {
    if (!canvasRef.current) return

    // Detect Safari for WebGL compatibility workarounds
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    // Safari/iOS-specific WebGL options for better compatibility
    // - useHighPrecisionFloats: Safari has issues with highp in some shaders
    // - disableWebGL2Support: Some Safari versions have buggy WebGL2 implementations
    // - powerPreference: "high-performance" helps on MacBooks with discrete GPUs
    const engineOptions: any = {
      preserveDrawingBuffer: true,
      stencil: true,
      // Safari on older iOS may have WebGL2 issues
      disableWebGL2Support: isIOS && !('gpu' in navigator),
      // Use high precision floats only on capable devices
      useHighPrecisionFloats: !isSafari,
      // Request high performance GPU on devices with multiple GPUs
      powerPreference: "high-performance",
      // Prevent context loss on iOS Safari background/foreground transitions
      failIfMajorPerformanceCaveat: false,
      // Alpha blending for transparent canvas (needed on some Safari versions)
      alpha: true,
      // Antialias with fallback for lower-end devices
      antialias: !(isIOS && window.devicePixelRatio > 2),
    }

    if (isSafari || isIOS) {
      console.log('[BabylonPongRenderer] Safari/iOS detected - using WebGL compatibility mode')
    }

    const engine = new Engine(canvasRef.current, true, engineOptions)
    engineRef.current = engine

    // Handle WebGL context loss/restore (common on iOS Safari)
    canvasRef.current.addEventListener('webglcontextlost', (e) => {
      console.warn('[BabylonPongRenderer] WebGL context lost - preventing default')
      e.preventDefault()
    })

    canvasRef.current.addEventListener('webglcontextrestored', () => {
      console.log('[BabylonPongRenderer] WebGL context restored - reinitializing engine')
      // Force scene to re-render on context restore
      engine.resize()
    })

    const scene = new Scene(engine)
    // Dark mode: deep blue-ish background, Light mode: light gray-white
    const bgColor = darkMode ? new Color3(0.05, 0.05, 0.1) : new Color3(0.9, 0.92, 0.95)
    scene.clearColor = bgColor.toColor4()
    sceneRef.current = scene

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

    // Simple ball/paddle movement - lerp toward server position with bounce smoothing
    const rotAxis = new Vector3(0, 0, 0)
    const rotQuat = Quaternion.Identity()
    
    // Ball rendering: constant velocity between bounces
    
    scene.onBeforeRenderObservable.add(() => {
      const gs = gameStateRef.current
      if (!gs) return
      const deltaTime = sceneRef.current?.getEngine().getDeltaTime() ?? 16.67
      const dtSeconds = deltaTime / 1000.0
      
      // Update balls
      for (let i = 0; i < gs.balls.length; i++) {
        const b = gs.balls[i]!
        const mesh = ballsRef.current.get(b.id)
        if (!mesh) continue
        
        // Server position and velocity (converted to world units)
        const serverX = (b.x - 500) * 0.02
        const serverZ = (b.y - 500) * 0.02
        const serverVelX = (b.dx || 0) * 0.02
        const serverVelZ = (b.dy || 0) * 0.02
        
        // Get or create tracking state
        let target = ballTargetsRef.current.get(b.id)
        if (!target) {
          target = {
            targetPos: new Vector3(serverX, mesh.position.y, serverZ),
            targetScaleX: 1, targetScaleY: 1, targetScaleZ: 1,
            velocityX: serverVelX,
            velocityZ: serverVelZ,
            lastUpdateTime: 0,
            visualRadius: 0.2
          }
          ballTargetsRef.current.set(b.id, target)
          mesh.position.x = serverX
          mesh.position.z = serverZ
          continue
        }
        
        // Store previous position for rotation calculation
        const prevX = mesh.position.x
        const prevZ = mesh.position.z
        
        // Check for large position difference (teleport/respawn) - always snap immediately
        const posDistSq = (serverX - mesh.position.x) ** 2 + (serverZ - mesh.position.z) ** 2
        const posDist = Math.sqrt(posDistSq)
        
        if (posDist > 1.0) {
          // Large teleport (respawn after goal) - snap immediately
          mesh.position.x = serverX
          mesh.position.z = serverZ
          target.velocityX = serverVelX
          target.velocityZ = serverVelZ
        } else {
          // Normal movement: move at server velocity + gentle position correction
          // This eliminates all snapping/teleporting while keeping positions accurate
          
          // Move at server velocity
          mesh.position.x += serverVelX * dtSeconds
          mesh.position.z += serverVelZ * dtSeconds
          
          // Gentle continuous correction toward server position
          // This is smooth and imperceptible but prevents drift accumulation
          const errorX = serverX - mesh.position.x
          const errorZ = serverZ - mesh.position.z
          
          // Correction strength: blend 5% toward server position each frame
          // At 60fps this corrects ~95% of error per second
          const correction = 0.05
          mesh.position.x += errorX * correction
          mesh.position.z += errorZ * correction
          
          // Always keep velocity in sync
          target.velocityX = serverVelX
          target.velocityZ = serverVelZ
        }
        
        // Rolling rotation based on actual movement
        if (mesh.rotationQuaternion) {
          const movedX = mesh.position.x - prevX
          const movedZ = mesh.position.z - prevZ
          const moveDist = Math.sqrt(movedX * movedX + movedZ * movedZ)
            
          if (moveDist > 0.0001) {
            const radius = target.visualRadius || 0.2
            
            rotAxis.x = -movedZ / moveDist
            rotAxis.y = 0
            rotAxis.z = movedX / moveDist
            
            let rot = ballRotationsRef.current.get(b.id)
            if (!rot) {
              rot = Quaternion.Identity()
              ballRotationsRef.current.set(b.id, rot)
            }
            
            Quaternion.RotationAxisToRef(rotAxis, -moveDist / radius, rotQuat)
            rotQuat.multiplyToRef(rot, rot)
            mesh.rotationQuaternion.copyFrom(rot)
          }
        }
      }
      
      // Update paddles - smooth lerp
      for (let i = 0; i < gs.paddles.length; i++) {
        const p = gs.paddles[i] as any
        const id = p.paddle_id ?? p.id
        if (id == null) continue
        
        const mesh = paddlesRef.current.get(id)
        const target = paddleTargetsRef.current.get(id)
        if (!mesh || !target) continue
        
        target.x = (p.x - 500) * 0.02
        target.z = (p.y - 500) * 0.02
        mesh.position.x += (target.x - mesh.position.x) * 0.3
        mesh.position.z += (target.z - mesh.position.z) * 0.3
      }
      
      // Update powerups - full handling in render loop (no React dependency)
      if (gs.powerups && Array.isArray(gs.powerups)) {
        const activePowerupKeys = new Set<string>()
        
        for (let pidx = 0; pidx < gs.powerups.length; pidx++) {
          const p = gs.powerups[pidx] as any
          const isArray = Array.isArray(p)
          const x = Number(isArray ? p[0] : p.x) || 0
          const y = Number(isArray ? p[1] : p.y) || 0
          const radius = Number(isArray ? p[4] : p.radius) || 10
          const spawnTime = String(isArray ? p[5] ?? pidx : (p.spawnTime ?? pidx))
          const rawType = isArray ? p[6] : p.type
          const typeIndex = Number(rawType) || 0
          const activationTick = isArray ? p[8] : p.activationTick
          const isCollected = activationTick !== null && activationTick !== undefined
          const key = `${spawnTime}`
          
          // Track collected powerups
          if (isCollected) {
            collectedPowerupsRef.current.add(key)
          }
          
          // Skip if collected
          if (collectedPowerupsRef.current.has(key)) {
            const existingMesh = powerupsRef.current.get(key)
            if (existingMesh) {
              existingMesh.position.y = -9999
              existingMesh.dispose()
              powerupsRef.current.delete(key)
            }
            continue
          }
          
          activePowerupKeys.add(key)
          
          let mesh = powerupsRef.current.get(key)
          const targetX = (x - 500) * 0.02
          const targetZ = (y - 500) * 0.02
          
          if (!mesh) {
            // Lazy create powerup mesh in render loop
            const size = Math.max(0.1, radius * 0.02)
            const name = `powerup_${key}`
            const colors = [
              new Color3(0.9, 0.6, 0.1), // ADD_BALL
              new Color3(0.9, 0.2, 0.2), // INCREASE_PADDLE_SPEED
              new Color3(0.2, 0.6, 0.9), // DECREASE_PADDLE_SPEED
              new Color3(0.8, 0.3, 0.9), // SUPER_SPEED
              new Color3(0.2, 0.9, 0.3), // INCREASE_BALL_SIZE
              new Color3(0.9, 0.9, 0.2), // DECREASE_BALL_SIZE
              new Color3(0.9, 0.4, 0.7), // REVERSE_CONTROLS
            ]
            const color = colors[typeIndex] || new Color3(0.8, 0.8, 0.8)
            
            mesh = MeshBuilder.CreateCylinder(name, { 
              diameterTop: size * 2.0, 
              diameterBottom: size * 2.0, 
              height: size * 0.25, 
              tessellation: 24 // Reduced from 32 for perf
            }, scene)
            
            const mat = new StandardMaterial(name + "_mat", scene)
            mat.diffuseColor = color
            mat.emissiveColor = color.scale(0.25)
            mat.specularColor = new Color3(0.4, 0.4, 0.4)
            mesh.material = mat
            mesh.rotation.x = Math.PI / 2
            mesh.position.set(targetX, 0.35, targetZ)
            powerupsRef.current.set(key, mesh)
          } else {
            // Smooth position update
            mesh.position.x += (targetX - mesh.position.x) * 0.3
            mesh.position.z += (targetZ - mesh.position.z) * 0.3
            // Spin animation
            mesh.rotation.y += 0.05
          }
        }
        
        // Remove stale powerups
        for (const [k, m] of powerupsRef.current) {
          if (!activePowerupKeys.has(k)) {
            m.dispose()
            powerupsRef.current.delete(k)
          }
        }
      }
      
      // Powerup rotation (consolidated here instead of separate observer)
      const rotSpeed = 2.5 // radians per second
      for (const mesh of powerupsRef.current.values()) {
        mesh.rotation.x = Math.PI / 2
        mesh.rotation.y += rotSpeed * dtSeconds
      }
    })

    // Render loop with deterministic timing
    let lastRenderTime = performance.now()
    engine.runRenderLoop(() => {
      const now = performance.now()
      const elapsed = now - lastRenderTime
      
      // Skip frame if running too fast (cap at ~144 FPS to reduce CPU churn)
      if (elapsed < 6.9) return
      
      lastRenderTime = now
      scene.render()
    })

    // Handle resize and orientation changes (important for mobile Safari)
    const handleResize = () => {
      engine.resize()
      // On iOS, also update canvas dimensions to match device pixels
      if (canvasRef.current) {
        const dpr = Math.min(window.devicePixelRatio, 2) // Cap at 2x for performance
        const displayWidth = canvasRef.current.clientWidth
        const displayHeight = canvasRef.current.clientHeight
        if (canvasRef.current.width !== displayWidth * dpr || 
            canvasRef.current.height !== displayHeight * dpr) {
          engine.resize()
        }
      }
    }
    window.addEventListener("resize", handleResize)
    
    // Handle orientation change specifically (iOS Safari sometimes misses resize)
    window.addEventListener("orientationchange", () => {
      // Delay resize to ensure new dimensions are available
      setTimeout(handleResize, 100)
    })

    // Handle page visibility (pause rendering when tab is hidden - saves battery on mobile)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        engine.stopRenderLoop()
      } else {
        // Restore the frame-capped render loop
        lastRenderTime = performance.now()
        engine.runRenderLoop(() => {
          const now = performance.now()
          const elapsed = now - lastRenderTime
          if (elapsed < 6.9) return // Cap at ~144 FPS
          lastRenderTime = now
          scene.render()
        })
        // Force resize in case viewport changed while hidden
        handleResize()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("resize", handleResize)
      window.removeEventListener("orientationchange", handleResize)
      document.removeEventListener("visibilitychange", handleVisibilityChange)

      // Clear all mesh references
      paddlesRef.current.clear()
      ballsRef.current.clear()
      ballLightsRef.current.clear()
      edgesRef.current = []
      floorRef.current = null
      ballSmoothingRef.current.clear()
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

  // NOTE: Position updates now happen directly in the render loop (reads gameStateRef)
  // No useEffect needed for fast position updates - this bypasses React entirely

  // SLOW PATH: Setup/teardown meshes when entities change
  // This runs less frequently (only when balls/paddles are added/removed)
  useEffect(() => {
    // Debug logging disabled for performance
    // console.log("[BabylonPongRenderer] Updating game state:", gameState)
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

          // Rotation: align local X with direction
          // atan2(z, x) gives angle in XZ plane
          const angle = Math.atan2(dir.z, dir.x)
          wall.rotation.y = -angle // Babylon rotation might need negation depending on coord system

          // Calculate the outward normal to offset wall so inner face aligns with collision line
          // The normal is perpendicular to the wall direction, pointing outward (away from center)
          const perp = new Vector3(-dir.z, 0, dir.x) // perpendicular in XZ plane
          // Determine which direction is "outward" by checking against center of arena
          const toCenter = Vector3.Zero().subtract(center)
          const outward = perp.dot(toCenter) < 0 ? perp : perp.scale(-1)
          
          // Offset wall position outward by half thickness so inner face is at collision line
          wall.position = center.add(outward.scale(wallThickness / 2))
          wall.position.y = wallHeight / 2 - 0.1 // Sunk slightly

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

        // Debug logging disabled for performance
        // console.log("[Pong Sound] New ball created:", b.id, "with direction:", b.dx, b.dy)
      }

      // Calculate distance moved since last update for rotation
      const newPosX = (b.x - BACKEND_WIDTH / 2) * SCALE_FACTOR
      const newPosZ = (b.y - BACKEND_HEIGHT / 2) * SCALE_FACTOR

      // Update mesh scale if backend radius changed, and adjust Y position to keep ball on floor
      let actualVisualRadius = 0.2 // default fallback
      try {
        const backendRadius = Number(b.radius || 10)
        const worldRadius = Math.max(0.05, backendRadius * SCALE_FACTOR)
        const desiredDiameter = Math.max(0.05, worldRadius * 2)
        const baseDiameter = (mesh as any).metadata?.baseDiameter || desiredDiameter
        const scale = desiredDiameter / baseDiameter
        
        actualVisualRadius = (baseDiameter / 2) * scale
        
        // Adjust Y position so ball stays on the floor
        const FLOOR_Y = -0.1
        const adjustedYPos = FLOOR_Y + actualVisualRadius
        
        // Store visual radius for rotation calculation
        let existingTarget = ballTargetsRef.current.get(b.id)
        if (!existingTarget) {
          existingTarget = {
            targetPos: new Vector3(newPosX, adjustedYPos, newPosZ),
            targetScaleX: scale,
            targetScaleY: scale,
            targetScaleZ: scale,
            velocityX: 0,
            velocityZ: 0,
            lastUpdateTime: performance.now(),
            visualRadius: actualVisualRadius
          }
          ballTargetsRef.current.set(b.id, existingTarget)
        } else {
          existingTarget.visualRadius = actualVisualRadius
        }
        
        // Set Y position and scale (always update these, not just for new balls)
        mesh.position.y = adjustedYPos
        mesh.scaling.set(scale, scale, scale)
        
        if (isNewBall) {
          mesh.position.x = newPosX
          mesh.position.z = newPosZ
        }
      } catch (e) {
        // ignore scaling errors
      }
    })

    // Cleanup missing balls
    // --- Powerups: create/update rotating shape meshes ---
    // gameState.powerups entries are arrays: [x, y, vx, vy, radius, spawnTime, type, duration, activationStart]
    if (gameState.powerups && Array.isArray(gameState.powerups)) {
      // Debug logging disabled for performance
      // console.debug("[BabylonPongRenderer] Received powerups:", gameState.powerups)
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
          // Check if powerup has been collected (activationTick at index 8 is not null)
          const activationTick = isArray ? p[8] : p.activationTick
          const isCollected = activationTick !== null && activationTick !== undefined
          
          if (isNaN(typeIndex)) {
            console.warn("[BabylonPongRenderer] powerup type is not a number, raw:", rawType)
          }
          // Use only spawnTime as key since pidx can change when powerups are removed
          const key = `${spawnTime}`
          
          // Skip rendering collected powerups - they've already been picked up
          if (isCollected) {
            // Add to collected set so we never show it again
            collectedPowerupsRef.current.add(key)
          }
          
          // Skip if this powerup was ever collected
          if (collectedPowerupsRef.current.has(key)) {
            // Force hide by moving mesh to oblivion - dispose doesn't seem to work
            const meshName = `powerup_${key}`
            const sceneMesh = scene.getMeshByName(meshName)
            if (sceneMesh) {
              sceneMesh.position.set(0, -9999, 0)
              sceneMesh.scaling.set(0.001, 0.001, 0.001)
            }
            // Also try from our ref
            const refMesh = powerupsRef.current.get(key)
            if (refMesh) {
              refMesh.position.set(0, -9999, 0)
              refMesh.scaling.set(0.001, 0.001, 0.001)
              powerupsRef.current.delete(key)
            }
            return
          }
          
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

            // Create shape depending on type - ALL use flat disc for consistent hitbox visualization
            const visualSize = size
            // Use flat disc for ALL powerup types - diameter matches hitbox
            // Create as a coin standing up (rotated to stand on edge)
            created = MeshBuilder.CreateCylinder(name, { 
              diameterTop: visualSize * 2.0, 
              diameterBottom: visualSize * 2.0, 
              height: visualSize * 0.25, 
              tessellation: 32 
            }, scene)

            if (created) {
              mesh = created
              const mat = new StandardMaterial(name + "_mat", scene)
              mat.diffuseColor = color
              mat.emissiveColor = color.scale(0.25)
              mat.specularColor = new Color3(0.4, 0.4, 0.4)
              mesh.material = mat
              // Stand the coin up on its edge (rotate 90 degrees on X axis)
              mesh.rotation.x = Math.PI / 2
              // Render powerups slightly above the board so they're visible
              mesh.position = toWorld(x, y, 0.35)
              powerupsRef.current.set(key, mesh)
            }
          } else {
            // update position (keep powerups at standing coin height)
            mesh.position = toWorld(x, y, 0.35)
            // Small debug to ensure updates are occurring
            // console.debug(`[BabylonPongRenderer] Updated powerup ${key} position to (${x},${y})`)
          }
        } catch (e) {
          console.warn("Failed to create/update powerup mesh", e)
        }
      })

      // Remove powerups that no longer exist in game state (or are collected)
      for (const [k, m] of powerupsRef.current) {
        if (!activePowerupKeys.has(k)) {
          try { 
            m.position.set(0, -9999, 0)
            m.scaling.set(0.001, 0.001, 0.001)
            m.dispose() 
          } catch (e) { /* ignore */ }
          powerupsRef.current.delete(k)
        }
      }

      // Powerup rotation is now handled in the main render observer (consolidated for performance)
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
        ballRotationsRef.current.delete(id)
        ballTargetsRef.current.delete(id)
        ballSmoothingRef.current.delete(id)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKey, darkMode, paddleRotationOffset])

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
