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
import { getUserColorBabylon, getUserColorCSS } from "@utils/users"
import { SpatialBounceSound } from "@utils/SpatialBounceSound"
import { SpatialPowerupSound } from "@utils/SpatialPowerupSound"

const BACKEND_WIDTH = 1000
const BACKEND_HEIGHT = 1000
const SCALE_FACTOR = 0.02
const PADDLE_ROTATION_OFFSET = 0

function createBeachBallTexture(scene: Scene): DynamicTexture {
  const textureSize = 512
  const texture = new DynamicTexture("beachBallTexture", textureSize, scene, true)
  const ctx = texture.getContext()

  const panelColors = ["#FF2222", "#FFDD00", "#2266FF", "#22CC22", "#FF6600", "#CC22CC"]
  const numPanels = 6
  const stripeWidth = textureSize / numPanels

  ctx.fillStyle = "#FFFFFF"
  ctx.fillRect(0, 0, textureSize, textureSize)

  for (let i = 0; i < numPanels; i++) {
    ctx.fillStyle = panelColors[i]!
    const stripeStart = i * stripeWidth + stripeWidth * 0.1
    const stripeW = stripeWidth * 0.8
    ctx.fillRect(stripeStart, 0, stripeW, textureSize)
  }

  ctx.strokeStyle = "rgba(0, 0, 0, 0.15)"
  ctx.lineWidth = 2
  for (let i = 0; i <= numPanels; i++) {
    ctx.beginPath()
    ctx.moveTo(i * stripeWidth, 0)
    ctx.lineTo(i * stripeWidth, textureSize)
    ctx.stroke()
  }

  const capRadius = textureSize * 0.08
  ctx.fillStyle = "#FFFFFF"
  ctx.beginPath()
  ctx.arc(textureSize / 2, capRadius, capRadius, 0, 2 * Math.PI)
  ctx.fill()
  ctx.strokeStyle = "rgba(0, 0, 0, 0.2)"
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = "#FFFFFF"
  ctx.beginPath()
  ctx.arc(textureSize / 2, textureSize - capRadius, capRadius, 0, 2 * Math.PI)
  ctx.fill()
  ctx.stroke()

  texture.update()
  return texture
}

export function getPaddleColorCSS(paddleId: number): string {
  return getUserColorCSS(paddleId)
}

interface BabylonPongRendererProps {
  gameState: TypeGameStateSchema | null
  gameMode?: string | null
}

const BabylonPongRenderer = forwardRef(function BabylonPongRenderer(
  { gameState, gameMode = null, paddleRotationOffset = PADDLE_ROTATION_OFFSET }: BabylonPongRendererProps & { paddleRotationOffset?: number },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<Scene | null>(null)
  const engineRef = useRef<Engine | null>(null)

  const paddlesRef = useRef<Map<number, Mesh>>(new Map())
  const ballsRef = useRef<Map<number, Mesh>>(new Map())
  const ballLightsRef = useRef<Map<number, PointLight>>(new Map())
  const edgesRef = useRef<Mesh[]>([])
  const floorRef = useRef<Mesh | null>(null)
  const shadowGeneratorRef = useRef<ShadowGenerator | null>(null)

  const ballRotationsRef = useRef<Map<number, Quaternion>>(new Map())

  interface BallSmoothingState {
    vx: number
    vz: number
    lerpFactor: number
    lastServerX: number
    lastServerZ: number
    lastUpdateTime: number
  }
  const ballSmoothingRef = useRef<Map<number, BallSmoothingState>>(new Map())

  const powerupsRef = useRef<Map<string, Mesh>>(new Map())
  const powerupMetaRef = useRef<Map<string, { x: number; y: number; type: number }>>(new Map())

  const beachBallTextureRef = useRef<DynamicTexture | null>(null)

  const gameStateRef = useRef<TypeGameStateSchema | null>(null)
  gameStateRef.current = gameState

  interface LerpTarget {
    targetPos: Vector3
    targetScaleX: number
    targetScaleY: number
    targetScaleZ: number
    velocityX: number
    velocityZ: number
    lastUpdateTime: number
    visualRadius: number
  }
  const ballTargetsRef = useRef<Map<number, LerpTarget>>(new Map())
  const paddleTargetsRef = useRef<Map<number, Vector3>>(new Map())

  const collectedPowerupsRef = useRef<Set<string>>(new Set())

  const bounceSoundRef = useRef<SpatialBounceSound | null>(null)
  useEffect(() => {
    const snd = new SpatialBounceSound()
    snd.load()
    bounceSoundRef.current = snd
    return () => { snd.dispose() }
  }, [])

  const powerupSoundRef = useRef<SpatialPowerupSound | null>(null)
  useEffect(() => {
    const snd = new SpatialPowerupSound()
    snd.load()
    powerupSoundRef.current = snd
    return () => { snd.dispose() }
  }, [])

  const entityKey = gameState
    ? `${gameState.balls.length}_${gameState.paddles.length}_${gameState.edges?.length ?? 0}`
    : 'none'

  useEffect(() => {
    if (!canvasRef.current) return

    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    const engineOptions: any = {
      preserveDrawingBuffer: true,
      stencil: true,
      disableWebGL2Support: isIOS && !('gpu' in navigator),
      useHighPrecisionFloats: !isSafari,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
      alpha: true,
      antialias: !(isIOS && window.devicePixelRatio > 2),
    }

    if (isSafari || isIOS) {
      console.log('[BabylonPongRenderer] Safari/iOS detected - using WebGL compatibility mode')
    }

    const engine = new Engine(canvasRef.current, true, engineOptions)
    engineRef.current = engine

    canvasRef.current.addEventListener('webglcontextlost', (e) => {
      console.warn('[BabylonPongRenderer] WebGL context lost - preventing default')
      e.preventDefault()
    })

    canvasRef.current.addEventListener('webglcontextrestored', () => {
      console.log('[BabylonPongRenderer] WebGL context restored - reinitializing engine')
      engine.resize()
    })

    const scene = new Scene(engine)
    const bgColor = new Color3(0.05, 0.05, 0.1)
    scene.clearColor = bgColor.toColor4()
    sceneRef.current = scene

    const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 25, Vector3.Zero(), scene)
    camera.attachControl(canvasRef.current, true)
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput")
    camera.lowerRadiusLimit = 10
    camera.upperRadiusLimit = 50

    const hemiLight = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene)
    hemiLight.intensity = 0.3

    const dirLight = new DirectionalLight("dir", new Vector3(-1, -2, -1), scene)
    dirLight.position = new Vector3(20, 40, 20)
    dirLight.intensity = 0.8
    dirLight.autoCalcShadowZBounds = true
    dirLight.shadowMinZ = 1
    dirLight.shadowMaxZ = 100

    const shadowGenerator = new ShadowGenerator(2048, dirLight)
    shadowGenerator.useBlurExponentialShadowMap = true
    shadowGenerator.blurKernel = 32
    shadowGeneratorRef.current = shadowGenerator

    const rotAxis = new Vector3(0, 0, 0)
    const rotQuat = Quaternion.Identity()

    let lastFrameTime = performance.now()

    scene.onBeforeRenderObservable.add(() => {
      const gs = gameStateRef.current
      if (!gs) return

      const now = performance.now()
      const rawDeltaTime = now - lastFrameTime
      lastFrameTime = now

      const deltaTime = Math.min(rawDeltaTime, 33)
      const dtSeconds = deltaTime / 1000.0

      const timeScale = (gs.metadata as any)?.timeScale ?? 1.0

      for (let i = 0; i < gs.balls.length; i++) {
        const b = gs.balls[i]!
        const mesh = ballsRef.current.get(b.id)
        if (!mesh) continue

        const serverX = (b.x - 500) * 0.02
        const serverZ = (b.y - 500) * 0.02
        const serverVelX = (b.dx || 0) * 0.02
        const serverVelZ = (b.dy || 0) * 0.02

        const backendRadius = Number(b.radius || 10)
        const worldRadius = Math.max(0.05, backendRadius * 0.02)
        const desiredDiameter = Math.max(0.05, worldRadius * 2)
        const baseDiameter = (mesh as any).metadata?.baseDiameter || desiredDiameter
        const scale = desiredDiameter / baseDiameter
        const actualVisualRadius = (baseDiameter / 2) * scale

        if (Math.abs(mesh.scaling.x - scale) > 0.001) {
          mesh.scaling.set(scale, scale, scale)
          const FLOOR_Y = -0.1
          mesh.position.y = FLOOR_Y + actualVisualRadius
        }

        let target = ballTargetsRef.current.get(b.id)
        if (!target) {
          target = {
            targetPos: new Vector3(serverX, mesh.position.y, serverZ),
            targetScaleX: scale, targetScaleY: scale, targetScaleZ: scale,
            velocityX: serverVelX,
            velocityZ: serverVelZ,
            lastUpdateTime: 0,
            visualRadius: actualVisualRadius
          }
          ballTargetsRef.current.set(b.id, target)
          mesh.position.x = serverX
          mesh.position.z = serverZ
          continue
        }

        target.visualRadius = actualVisualRadius

        const prevX = mesh.position.x
        const prevZ = mesh.position.z

        const serverPosChanged = Math.abs(serverX - target.targetPos.x) > 0.0001 ||
                                 Math.abs(serverZ - target.targetPos.z) > 0.0001

        const bounceX = serverPosChanged && target.velocityX !== 0 && serverVelX !== 0 &&
                        Math.sign(target.velocityX) !== Math.sign(serverVelX)
        const bounceZ = serverPosChanged && target.velocityZ !== 0 && serverVelZ !== 0 &&
                        Math.sign(target.velocityZ) !== Math.sign(serverVelZ)
        const bounced = bounceX || bounceZ

        if (bounced && bounceSoundRef.current) {
          bounceSoundRef.current.play(b.x, b.y, b.radius ?? 10)
        }

        const dist = Math.sqrt((serverX - mesh.position.x) ** 2 + (serverZ - mesh.position.z) ** 2)

        if (dist > 1.0 || bounced) {
          mesh.position.x = serverX
          mesh.position.z = serverZ
        } else {
          mesh.position.x += target.velocityX * dtSeconds * timeScale
          mesh.position.z += target.velocityZ * dtSeconds * timeScale
        }

        if (serverPosChanged) {
          target.targetPos.x = serverX
          target.targetPos.z = serverZ
          target.velocityX = serverVelX
          target.velocityZ = serverVelZ
        }

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

          if (isCollected) {
            collectedPowerupsRef.current.add(key)
          }

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

          powerupMetaRef.current.set(key, { x, y, type: typeIndex })

          let mesh = powerupsRef.current.get(key)
          const targetX = (x - 500) * 0.02
          const targetZ = (y - 500) * 0.02

          if (!mesh) {
            const size = Math.max(0.1, radius * 0.02)
            const name = `powerup_${key}`
            const colors = [
              new Color3(0.9, 0.6, 0.1),
              new Color3(0.9, 0.2, 0.2),
              new Color3(0.2, 0.6, 0.9),
              new Color3(0.8, 0.3, 0.9),
              new Color3(0.2, 0.9, 0.3),
              new Color3(0.9, 0.9, 0.2),
              new Color3(0.9, 0.4, 0.7),
            ]
            const color = colors[typeIndex] || new Color3(0.8, 0.8, 0.8)

            mesh = MeshBuilder.CreateCylinder(name, {
              diameterTop: size * 2.0,
              diameterBottom: size * 2.0,
              height: size * 0.25,
              tessellation: 24
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
            mesh.position.x += (targetX - mesh.position.x) * 0.3
            mesh.position.z += (targetZ - mesh.position.z) * 0.3
            mesh.rotation.y += 0.05
          }
        }

        for (const [k, m] of powerupsRef.current) {
          if (!activePowerupKeys.has(k)) {
            const meta = powerupMetaRef.current.get(k)
            if (meta && powerupSoundRef.current) {
              powerupSoundRef.current.play(meta.x, meta.y, meta.type)
            }
            powerupMetaRef.current.delete(k)
            m.dispose()
            powerupsRef.current.delete(k)
          }
        }
      }

      const rotSpeed = 2.5
      for (const mesh of powerupsRef.current.values()) {
        mesh.rotation.x = Math.PI / 2
        mesh.rotation.y += rotSpeed * dtSeconds
      }
    })

    let lastRenderTime = performance.now()
    engine.runRenderLoop(() => {
      const now = performance.now()
      const elapsed = now - lastRenderTime

      if (elapsed < 6.9) return

      lastRenderTime = now
      scene.render()
    })

    const handleResize = () => {
      engine.resize()
      if (canvasRef.current) {
        const dpr = Math.min(window.devicePixelRatio, 2)
        const displayWidth = canvasRef.current.clientWidth
        const displayHeight = canvasRef.current.clientHeight
        if (canvasRef.current.width !== displayWidth * dpr ||
            canvasRef.current.height !== displayHeight * dpr) {
          engine.resize()
        }
      }
    }
    window.addEventListener("resize", handleResize)

    window.addEventListener("orientationchange", () => {
      setTimeout(handleResize, 100)
    })

    const handleVisibilityChange = () => {
      if (document.hidden) {
        engine.stopRenderLoop()
      } else {
        lastRenderTime = performance.now()
        engine.runRenderLoop(() => {
          const now = performance.now()
          const elapsed = now - lastRenderTime
          if (elapsed < 6.9) return
          lastRenderTime = now
          scene.render()
        })
        handleResize()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("resize", handleResize)
      window.removeEventListener("orientationchange", handleResize)
      document.removeEventListener("visibilitychange", handleVisibilityChange)

      paddlesRef.current.clear()
      ballsRef.current.clear()
      ballLightsRef.current.clear()
      edgesRef.current = []
      floorRef.current = null
      ballSmoothingRef.current.clear()
      powerupsRef.current.forEach(m => m.dispose())
      powerupsRef.current.clear()

      scene.dispose()
      engine.dispose()
    }
  }, [])

  useEffect(() => {
    if (!gameState || !sceneRef.current) return

    const scene = sceneRef.current
    const shadowGenerator = shadowGeneratorRef.current

    const toWorld = (x: number, y: number, yPos = 0) => {
      return new Vector3((x - BACKEND_WIDTH / 2) * SCALE_FACTOR, yPos, (y - BACKEND_HEIGHT / 2) * SCALE_FACTOR)
    }

    if (gameState.edges && gameState.edges.length > 0) {

      if (edgesRef.current.length !== gameState.edges.length) {
        edgesRef.current.forEach((m) => m.dispose())
        edgesRef.current = []
        if (floorRef.current) floorRef.current.dispose()

        const floorPoints = gameState.edges.map(
          (e) => new Vector2((e.x - BACKEND_WIDTH / 2) * SCALE_FACTOR, (e.y - BACKEND_HEIGHT / 2) * SCALE_FACTOR),
        )

        const floorBuilder = new PolygonMeshBuilder("floorPoly", floorPoints, scene, earcut as any)
        const floor = floorBuilder.build()
        floor.position.y = -0.1

        const floorMat = new StandardMaterial("floorMat", scene)
        floorMat.diffuseColor = new Color3(0.1, 0.1, 0.15)
        floorMat.specularColor = new Color3(0.1, 0.1, 0.1)
        floor.material = floorMat
        floor.receiveShadows = true
        floorRef.current = floor

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

          const angle = Math.atan2(dir.z, dir.x)
          wall.rotation.y = -angle

          const perp = new Vector3(-dir.z, 0, dir.x)
          const toCenter = Vector3.Zero().subtract(center)
          const outward = perp.dot(toCenter) < 0 ? perp : perp.scale(-1)

          wall.position = center.add(outward.scale(wallThickness / 2))
          wall.position.y = wallHeight / 2 - 0.1

          const wallMat = new StandardMaterial(`wallMat_${i}`, scene)
          const wallPlayerId = p1.playerId
          const activePaddleOwnerIds = new Set(gameState.paddles.map((p: any) => p.owner_id ?? p.ownerId ?? p.playerId))
          const isEliminatedPlayerWall = wallPlayerId != null && typeof wallPlayerId === 'number' && !activePaddleOwnerIds.has(wallPlayerId)
          const effectiveGameMode = gameMode ?? (gameState.metadata as any)?.gameOptions?.gameMode ?? null
          if (effectiveGameMode === 'lastOneStanding' && isEliminatedPlayerWall) {
            const playerColor = getUserColorBabylon(wallPlayerId)
            wallMat.diffuseColor = playerColor
            wallMat.emissiveColor = playerColor.scale(0.4)
          } else {
            wallMat.diffuseColor = new Color3(0.2, 0.2, 0.3)
            wallMat.emissiveColor = new Color3(0.1, 0.1, 0.2)
          }
          wallMat.alpha = 0.5
          wall.material = wallMat
          ;(wall as any).metadata = { ...(wall as any).metadata, wallPlayerId: wallPlayerId ?? null }

          edgesRef.current.push(wall)
        }
      } else {
        const effectiveGameMode = gameMode ?? (gameState.metadata as any)?.gameOptions?.gameMode ?? null
        const currentActivePaddleOwnerIds = new Set(gameState.paddles.map((p: any) => p.owner_id ?? p.ownerId ?? p.playerId))

        edgesRef.current.forEach((wall, i) => {
          const currentEdge = gameState.edges[i]
          const newWallPlayerId = currentEdge?.playerId ?? null
          ;(wall as any).metadata = { ...(wall as any).metadata, wallPlayerId: newWallPlayerId }

          if (wall.material) {
            const wallMat = wall.material as StandardMaterial
            const wallPlayerId = newWallPlayerId

            const isEliminatedPlayerWall = effectiveGameMode === 'lastOneStanding' &&
              wallPlayerId != null && typeof wallPlayerId === 'number' &&
              !currentActivePaddleOwnerIds.has(wallPlayerId)

            if (isEliminatedPlayerWall) {
              const playerColor = getUserColorBabylon(wallPlayerId)
              wallMat.diffuseColor = playerColor
              wallMat.emissiveColor = playerColor.scale(0.4)
              wallMat.alpha = 0.8
            } else {
              wallMat.diffuseColor = new Color3(0.2, 0.2, 0.3)
              wallMat.emissiveColor = new Color3(0.1, 0.1, 0.2)
              wallMat.alpha = 0.5
            }
          }
        })
      }
    }

    const activePaddleIds = new Set<number>()
    gameState.paddles.forEach((p) => {
      const paddleId = (p as any).paddle_id ?? (p as any).id ?? (p as any).paddleId
      if (paddleId === undefined || paddleId === null) {
        console.warn("[BabylonPongRenderer] Skipping paddle with missing id:", p)
        return
      }

      activePaddleIds.add(paddleId)
      let mesh = paddlesRef.current.get(paddleId)
      const isNewPaddle = !mesh

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
            width: length,
            height: 0.5,
            depth: width,
          },
          scene,
        )

        const mat = new StandardMaterial("paddleMat", scene)
        const baseColor = getUserColorBabylon(ownerId)
        mat.diffuseColor = baseColor
        mat.emissiveColor = baseColor.scale(0.4)
        mesh.material = mat

        ;(mesh as any).metadata = { ...(mesh as any).metadata, ownerId }

        if (shadowGenerator) shadowGenerator.addShadowCaster(mesh)
        paddlesRef.current.set(paddleId, mesh)
      } else {
        const mat = mesh.material as StandardMaterial | null
        if (mat) {
          const freshColor = getUserColorBabylon(ownerId)
          if (!mat.diffuseColor.equals(freshColor)) {
            mat.diffuseColor = freshColor
            mat.emissiveColor = freshColor.scale(0.4)
          }
        }
      }

      if (typeof posX !== "number" || typeof posY !== "number") {
        console.warn("[BabylonPongRenderer] Paddle missing x/y, skipping position:", paddleId, p)
      } else {
        const pos = toWorld(posX, posY, 0.25)
        paddleTargetsRef.current.set(paddleId, pos)
        if (isNewPaddle) {
          mesh.position = pos
        }
      }

      mesh.rotation.y = -rot + (paddleRotationOffset ?? PADDLE_ROTATION_OFFSET)
    })

    for (const [id, mesh] of paddlesRef.current) {
      if (!activePaddleIds.has(id)) {
        mesh.dispose()
        paddlesRef.current.delete(id)
        paddleTargetsRef.current.delete(id)
      }
    }

    const activeBallIds = new Set<number>()
    gameState.balls.forEach((b) => {
      activeBallIds.add(b.id)
      let mesh = ballsRef.current.get(b.id)
      const isNewBall = !mesh

      if (!mesh) {
        const backendRadius = Number(b.radius || 10)
        const worldRadius = Math.max(0.05, backendRadius * SCALE_FACTOR)
        const diameter = Math.max(0.05, worldRadius * 2)
        mesh = MeshBuilder.CreateSphere(`ball_${b.id}`, { diameter: diameter, segments: 32 }, scene)
        const mat = new StandardMaterial("ballMat", scene)

        if (!beachBallTextureRef.current) {
          beachBallTextureRef.current = createBeachBallTexture(scene)
        }

        mat.diffuseTexture = beachBallTextureRef.current
        mat.emissiveColor = new Color3(0.15, 0.15, 0.15)
        mat.specularColor = new Color3(0.3, 0.3, 0.3)
        mesh.material = mat

        mesh.rotationQuaternion = Quaternion.Identity()
        ballRotationsRef.current.set(b.id, Quaternion.Identity())

        if (shadowGenerator) shadowGenerator.addShadowCaster(mesh)

        const light = new PointLight(`ballLight_${b.id}`, new Vector3(0, 0, 0), scene)
        light.parent = mesh
        light.intensity = 0.5
        light.diffuse = new Color3(1, 0, 0)
        ballLightsRef.current.set(b.id, light)

        ;(mesh as any).metadata = { baseDiameter: diameter }
        ballsRef.current.set(b.id, mesh)

      }

      const newPosX = (b.x - BACKEND_WIDTH / 2) * SCALE_FACTOR
      const newPosZ = (b.y - BACKEND_HEIGHT / 2) * SCALE_FACTOR

      let actualVisualRadius = 0.2
      try {
        const backendRadius = Number(b.radius || 10)
        const worldRadius = Math.max(0.05, backendRadius * SCALE_FACTOR)
        const desiredDiameter = Math.max(0.05, worldRadius * 2)
        const baseDiameter = (mesh as any).metadata?.baseDiameter || desiredDiameter
        const scale = desiredDiameter / baseDiameter

        actualVisualRadius = (baseDiameter / 2) * scale

        const FLOOR_Y = -0.1
        const adjustedYPos = FLOOR_Y + actualVisualRadius

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

        mesh.position.y = adjustedYPos
        mesh.scaling.set(scale, scale, scale)

        if (isNewBall) {
          mesh.position.x = newPosX
          mesh.position.z = newPosZ
        }
      } catch (e) {
      }
    })

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
  }, [entityKey, paddleRotationOffset])

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
