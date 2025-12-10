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

  // Powerups: stable meshes keyed by spawnTime (string) + index fallback
  const powerupsRef = useRef<Map<string, Mesh>>(new Map())

  // Store beach ball texture reference
  const beachBallTextureRef = useRef<DynamicTexture | null>(null)

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

    // Render loop
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

    // Helper to map backend coords to 3D as numeric components to avoid allocating Vector3
    const toWorldNumeric = (x: number, y: number, yPos = 0) => {
      return {
        wx: (x - BACKEND_WIDTH / 2) * SCALE_FACTOR,
        wy: yPos,
        wz: (y - BACKEND_HEIGHT / 2) * SCALE_FACTOR,
      }
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

          const { wx: v1x, wy: v1y, wz: v1z } = toWorldNumeric(p1.x, p1.y, 0)
          const { wx: v2x, wy: v2y, wz: v2z } = toWorldNumeric(p2.x, p2.y, 0)
          const v1 = new Vector3(v1x, v1y, v1z)
          const v2 = new Vector3(v2x, v2y, v2z)

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
        const { wx, wy, wz } = toWorldNumeric(posX, posY, 0.25)
        mesh.position.x = wx
        mesh.position.y = wy
        mesh.position.z = wz
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
      }
    }

    // 3. Update Balls
    const activeBallIds = new Set<number>()
    gameState.balls.forEach((b) => {
      activeBallIds.add(b.id)
      let mesh = ballsRef.current.get(b.id)

      if (!mesh) {
        // Create sphere with more segments for smoother texture mapping
        // Use backend radius (in backend units) mapped to world units via SCALE_FACTOR
        const backendRadius = Number((b as any).radius || 10)
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

      // Calculate distance moved since last update for rotation (use numeric ops)
      // Map backend X/Z into world; compute Y based on floor + object half-height so
      // balls sit on the floor instead of floating.
      const { wx: newWx, wz: newWz } = toWorldNumeric(b.x, b.y)
      const backendRadius = Number((b as any).radius || 10)
      const worldRadius = Math.max(0.05, backendRadius * SCALE_FACTOR)
      const floorY = floorRef.current?.position.y ?? -0.1
      const dxWorld = mesh.position.x - newWx
      const dzWorld = mesh.position.z - newWz
      const distanceMoved = Math.hypot(dxWorld, dzWorld)

      // Update position in-place: center Y = floorY + worldRadius
      mesh.position.x = newWx
      mesh.position.y = floorY + worldRadius
      mesh.position.z = newWz

      // Update mesh scale if backend radius changed and keep it anchored on the floor
      try {
        const desiredRadius = worldRadius
        const desiredDiameter = Math.max(0.05, desiredRadius * 2)
        const baseDiameter = (mesh as any).metadata?.baseDiameter || desiredDiameter
        const scale = desiredDiameter / baseDiameter
        mesh.scaling = new Vector3(scale, scale, scale)
        // After scaling, ensure the bottom sits on the floor by repositioning Y
        mesh.position.y = floorY + (desiredDiameter / 2)
      } catch (e) {
        // ignore scaling errors
      }

      // Calculate rolling rotation based on actual distance traveled
      // The ball should rotate around an axis perpendicular to its movement direction
      const speed = Math.sqrt(b.dx * b.dx + b.dy * b.dy)

      if (distanceMoved > 0.001 && speed > 0.001 && mesh.rotationQuaternion) {
        // Calculate rotation amount: angle = arc_length / radius (in radians)
        // Map backend radius to world radius and use it for rotation
        const backendRadius = Number((b as any).radius || 10)
        const worldBallRadius = Math.max(0.05, backendRadius * SCALE_FACTOR)
        const rotationAmount = distanceMoved / worldBallRadius

        // Get current rotation quaternion
        const currentRotation = ballRotationsRef.current.get(b.id) || Quaternion.Identity()

        // Movement direction in world space (XZ plane, Y is up)
        // b.dx maps to world X, b.dy maps to world Z
        // Normalize the direction
        const dirX = b.dx / speed
        const dirZ = b.dy / speed

        // Rotation axis is perpendicular to movement direction and lies in the XZ plane
        // For a ball rolling on the floor: axis = cross(up, moveDir) = (-dirZ, 0, dirX)
        // This makes the ball roll forward in the direction of movement
        const axisX = -dirZ
        const axisZ = dirX

        // Create incremental rotation quaternion around this axis
        const incrementalRotation = Quaternion.RotationAxis(
          new Vector3(axisX, 0, axisZ),
          rotationAmount
        )

        // Multiply current rotation by incremental rotation
        const newRotation = incrementalRotation.multiply(currentRotation)

        ballRotationsRef.current.set(b.id, newRotation)
        mesh.rotationQuaternion = newRotation
      }

      // Detect bounces by checking if velocity direction changed
      const prevVel = previousBallVelocitiesRef.current.get(b.id)
      if (prevVel) {
        // Check if direction has changed (any component flipped sign or changed significantly)
        const dxChanged = Math.abs(b.dx - prevVel.dx) > 0.01
        const dyChanged = Math.abs(b.dy - prevVel.dy) > 0.01

        if (dxChanged || dyChanged) {
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
        }
      }

      // Store current velocity for next frame
      previousBallVelocitiesRef.current.set(b.id, { dx: b.dx, dy: b.dy })
    })

    // Cleanup missing balls
    // --- Powerups: create/update rotating shape meshes ---
    // gameState.powerups entries are arrays: [x, y, vx, vy, radius, spawnTime, type, duration, activationStart]
    if ((gameState as any).powerups && Array.isArray((gameState as any).powerups)) {
      console.debug("[BabylonPongRenderer] Received powerups:", (gameState as any).powerups)
      const activePowerupKeys = new Set<string>()
      ;(gameState as any).powerups.forEach((p: any, pidx: number) => {
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
              // Position powerup so it sits on the floor. Compute half-height from
              // the mesh bounding box (fallback to `size` when not available).
              const { wx: pwx, wz: pwz } = toWorldNumeric(x, y)
              mesh.position.x = pwx
              const floorY2 = floorRef.current?.position.y ?? -0.1
              const halfHeight = mesh.getBoundingInfo?.()?.boundingBox?.extendSize?.y ?? (size * 0.5)
              mesh.position.y = floorY2 + halfHeight
              mesh.position.z = pwz
              // Ensure powerups cast shadows onto the floor
              if (shadowGenerator) shadowGenerator.addShadowCaster(mesh)
              console.debug(`[BabylonPongRenderer] Created powerup mesh ${name} for type ${typeIndex}`)
              powerupsRef.current.set(key, mesh)
            }
          } else {
            // update position (keep powerups below balls)
            const { wx: upx, wz: upz } = toWorldNumeric(x, y)
            mesh.position.x = upx
            const floorY3 = floorRef.current?.position.y ?? -0.1
            const halfH = mesh.getBoundingInfo?.()?.boundingBox?.extendSize?.y ?? (size * 0.5)
            mesh.position.y = floorY3 + halfH
            mesh.position.z = upz
            // Re-add as shadow caster if necessary (idempotent)
            if (shadowGenerator) shadowGenerator.addShadowCaster(mesh)
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
