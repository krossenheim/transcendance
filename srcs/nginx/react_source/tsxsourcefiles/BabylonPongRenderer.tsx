"use client"

import { useEffect, useRef } from "react"
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
} from "@babylonjs/core"
import earcut from "earcut"
import type { TypeGameStateSchema } from "@/types/pong-interfaces"

const BACKEND_WIDTH = 1000
const BACKEND_HEIGHT = 1000
const SCALE_FACTOR = 0.02 // Scale down the world

interface BabylonPongRendererProps {
  gameState: TypeGameStateSchema | null
}

export default function BabylonPongRenderer({ gameState }: BabylonPongRendererProps) {
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

  // Initialize Babylon scene
  useEffect(() => {
    if (!canvasRef.current) return

    const engine = new Engine(canvasRef.current, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    })
    engineRef.current = engine

    const scene = new Scene(engine)
    scene.clearColor = new Color3(0.05, 0.05, 0.1).toColor4()
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

    // Render loop
    engine.runRenderLoop(() => {
      scene.render()
    })

    const handleResize = () => engine.resize()
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      scene.dispose()
      engine.dispose()
    }
  }, [])

  // Update game state
  useEffect(() => {
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
        floorMat.diffuseColor = new Color3(0.1, 0.1, 0.15)
        floorMat.specularColor = new Color3(0.1, 0.1, 0.1)
        floor.material = floorMat
        floor.receiveShadows = true
        floorRef.current = floor

        // Build Walls
        const wallHeight = 0.5
        const wallThickness = 0.2

        for (let i = 0; i < gameState.edges.length; i++) {
          const p1 = gameState.edges[i]
          const p2 = gameState.edges[(i + 1) % gameState.edges.length]

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
          wallMat.diffuseColor = new Color3(0.2, 0.2, 0.3)
          wallMat.emissiveColor = new Color3(0.1, 0.1, 0.2)
          wallMat.alpha = 0.5 // Semi-transparent walls
          wall.material = wallMat

          edgesRef.current.push(wall)
        }
      }
    }

    // 2. Update Paddles
    const activePaddleIds = new Set<number>()
    gameState.paddles.forEach((p) => {
      activePaddleIds.add(p.paddle_id)
      let mesh = paddlesRef.current.get(p.paddle_id)

      if (!mesh) {
        const width = p.w * SCALE_FACTOR
        const length = p.l * SCALE_FACTOR
        mesh = MeshBuilder.CreateBox(
          `paddle_${p.paddle_id}`,
          {
            width: length, // Length along the edge
            height: 0.5,
            depth: width, // Thickness
          },
          scene,
        )

        const mat = new StandardMaterial("paddleMat", scene)
        mat.diffuseColor = new Color3(0, 1, 0)
        mat.emissiveColor = new Color3(0, 0.4, 0)
        mesh.material = mat

        if (shadowGenerator) shadowGenerator.addShadowCaster(mesh)
        paddlesRef.current.set(p.paddle_id, mesh)
      }

      // Position
      const pos = toWorld(p.x, p.y, 0.25)
      mesh.position = pos

      // Rotation
      // p.r is the angle of the paddle's normal (facing center)
      // The paddle mesh length is along X. We want X to be perpendicular to normal.
      // So rotate by p.r + 90 deg
      mesh.rotation.y = -p.r + Math.PI / 2
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
        mesh = MeshBuilder.CreateSphere(`ball_${b.id}`, { diameter: 0.4 }, scene)
        const mat = new StandardMaterial("ballMat", scene)
        mat.diffuseColor = new Color3(1, 0, 0)
        mat.emissiveColor = new Color3(0.5, 0, 0)
        mesh.material = mat

        if (shadowGenerator) shadowGenerator.addShadowCaster(mesh)

        // Light
        const light = new PointLight(`ballLight_${b.id}`, new Vector3(0, 0, 0), scene)
        light.parent = mesh
        light.intensity = 0.5
        light.diffuse = new Color3(1, 0, 0)
        ballLightsRef.current.set(b.id, light)

        ballsRef.current.set(b.id, mesh)
      }

      mesh.position = toWorld(b.x, b.y, 0.2)
    })

    // Cleanup missing balls
    for (const [id, mesh] of ballsRef.current) {
      if (!activeBallIds.has(id)) {
        const light = ballLightsRef.current.get(id)
        if (light) {
          light.dispose()
          ballLightsRef.current.delete(id)
        }
        mesh.dispose()
        ballsRef.current.delete(id)
      }
    }
  }, [gameState])

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
}
