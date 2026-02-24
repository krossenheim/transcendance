"use client"

import { useEffect, useRef } from "react"
import type { TypeGameStateSchema } from "./types/pong-interfaces"
import { getUserColorCSS } from "@utils/users"

const BACKEND_WIDTH = 1000
const BACKEND_HEIGHT = 1000

interface MiniPongCanvasProps {
  /** Stable callback that returns the latest game state for a given gameId */
  getGameState: (gameId: number) => TypeGameStateSchema | null
  gameId: number
  width?: number
  height?: number
  onClick?: () => void
}

/**
 * A lightweight 2D canvas that renders a top-down mini-preview of a pong game.
 * Reads game state from a ref-backed getter at ~30fps to avoid React re-renders.
 */
export default function MiniPongCanvas({
  getGameState,
  gameId,
  width = 200,
  height = 180,
  onClick,
}: MiniPongCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const lastDrawRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const DRAW_INTERVAL = 1000 / 30 // ~30 fps for mini-preview
    const scaleX = width / BACKEND_WIDTH
    const scaleY = height / BACKEND_HEIGHT

    function draw(timestamp: number) {
      animFrameRef.current = requestAnimationFrame(draw)

      // Throttle to ~30fps
      if (timestamp - lastDrawRef.current < DRAW_INTERVAL) return
      lastDrawRef.current = timestamp

      const gs = getGameState(gameId)
      if (!gs || !ctx) return

      // Clear
      ctx.clearRect(0, 0, width, height)

      // Background
      ctx.fillStyle = "#0a0a1e"
      ctx.fillRect(0, 0, width, height)

      // Draw edges (field boundary polygon)
      if (gs.edges && gs.edges.length > 1) {
        ctx.beginPath()
        ctx.moveTo(gs.edges[0]!.x * scaleX, gs.edges[0]!.y * scaleY)
        for (let i = 1; i < gs.edges.length; i++) {
          ctx.lineTo(gs.edges[i]!.x * scaleX, gs.edges[i]!.y * scaleY)
        }
        ctx.closePath()
        ctx.strokeStyle = "rgba(100, 200, 255, 0.3)"
        ctx.lineWidth = 1
        ctx.stroke()

        // Draw goal segments (where playerId is set) in player colors
        for (let i = 0; i < gs.edges.length; i++) {
          const edge = gs.edges[i]!
          const nextEdge = gs.edges[(i + 1) % gs.edges.length]!
          if (edge.playerId != null) {
            ctx.beginPath()
            ctx.moveTo(edge.x * scaleX, edge.y * scaleY)
            ctx.lineTo(nextEdge.x * scaleX, nextEdge.y * scaleY)
            ctx.strokeStyle = getUserColorCSS(edge.playerId, true)
            ctx.lineWidth = 2
            ctx.stroke()
          }
        }
      }

      // Draw paddles
      for (const paddle of gs.paddles) {
        const px = paddle.x * scaleX
        const py = paddle.y * scaleY
        const pLen = paddle.l * scaleX * 0.5
        const pWidth = Math.max(paddle.w * scaleY * 0.5, 2)

        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(paddle.r)

        // Paddle color based on owner
        ctx.fillStyle = getUserColorCSS(paddle.owner_id, true)
        ctx.fillRect(-pLen, -pWidth, pLen * 2, pWidth * 2)

        ctx.restore()
      }

      // Draw balls
      for (const ball of gs.balls) {
        const bx = ball.x * scaleX
        const by = ball.y * scaleY
        const br = Math.max((ball.radius ?? 10) * Math.min(scaleX, scaleY), 2)

        ctx.beginPath()
        ctx.arc(bx, by, br, 0, Math.PI * 2)
        ctx.fillStyle = "#ffffff"
        ctx.fill()

        // Subtle glow
        ctx.beginPath()
        ctx.arc(bx, by, br + 1, 0, Math.PI * 2)
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)"
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Draw powerups
      if (gs.powerups) {
        for (const pu of gs.powerups) {
          const px = pu.x * scaleX
          const py = pu.y * scaleY
          ctx.beginPath()
          ctx.arc(px, py, 3, 0, Math.PI * 2)
          ctx.fillStyle = "#ffdd00"
          ctx.fill()
        }
      }

      // Score overlay (top-left)
      if (gs.score) {
        ctx.font = "bold 9px monospace"
        ctx.fillStyle = "rgba(255,255,255,0.7)"
        let y = 12
        for (const [playerId, score] of Object.entries(gs.score)) {
          const pid = Number(playerId)
          ctx.fillStyle = getUserColorCSS(pid, true)
          ctx.fillText(`${score}`, 4, y)
          y += 11
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(draw)

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [getGameState, gameId, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={onClick}
      className="rounded cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all"
      style={{ imageRendering: "pixelated" }}
      title="Click to spectate"
    />
  )
}
