"use client"

import { useEffect, useState, useRef } from "react"
import type { TypeActiveEffect, TypeRecentEvent } from "./types/pong-interfaces"
import { PowerupType } from "./types/pong-interfaces"

// Icon and color configurations for each powerup type
const POWERUP_CONFIG: Record<number, { icon: string; label: string; color: string; bgColor: string }> = {
  [PowerupType.ADD_BALL]: {
    icon: "⚽",
    label: "Ball Added",
    color: "#f59e0b",
    bgColor: "rgba(245, 158, 11, 0.2)",
  },
  [PowerupType.INCREASE_PADDLE_SPEED]: {
    icon: "⚡",
    label: "Fast Paddles",
    color: "#ef4444",
    bgColor: "rgba(239, 68, 68, 0.2)",
  },
  [PowerupType.DECREASE_PADDLE_SPEED]: {
    icon: "🐢",
    label: "Slow Paddles",
    color: "#3b82f6",
    bgColor: "rgba(59, 130, 246, 0.2)",
  },
  [PowerupType.SUPER_SPEED]: {
    icon: "🚀",
    label: "Super Speed",
    color: "#a855f7",
    bgColor: "rgba(168, 85, 247, 0.2)",
  },
  [PowerupType.INCREASE_BALL_SIZE]: {
    icon: "🔴",
    label: "Bigger Ball",
    color: "#22c55e",
    bgColor: "rgba(34, 197, 94, 0.2)",
  },
  [PowerupType.DECREASE_BALL_SIZE]: {
    icon: "⚫",
    label: "Smaller Ball",
    color: "#eab308",
    bgColor: "rgba(234, 179, 8, 0.2)",
  },
  [PowerupType.REVERSE_CONTROLS]: {
    icon: "🔄",
    label: "Reversed!",
    color: "#ec4899",
    bgColor: "rgba(236, 72, 153, 0.2)",
  },
}

interface PowerupDisplayProps {
  activeEffects: TypeActiveEffect[]
  recentEvents: TypeRecentEvent[]
}

export default function PowerupDisplay({ activeEffects, recentEvents }: PowerupDisplayProps) {
  // Track which event types we've recently shown (by type, reset after 3s)
  const lastShownTimeRef = useRef<Map<number, number>>(new Map())
  const [notifications, setNotifications] = useState<Array<{ id: string; type: number; timestamp: number }>>([])

  // Process new recent events and create notifications
  useEffect(() => {
    const now = Date.now()
    const newNotifications: Array<{ id: string; type: number; timestamp: number }> = []
    
    for (const event of recentEvents) {
      // Only process very recent events (just collected)
      if (event.ageSeconds > 0.3) continue
      
      // Check if we've shown this powerup type recently (within 2 seconds)
      const lastShownTime = lastShownTimeRef.current.get(event.type) || 0
      if (now - lastShownTime < 2000) continue
      
      // Create notification and mark as shown
      const notificationId = `${event.type}-${now}`
      newNotifications.push({
        id: notificationId,
        type: event.type,
        timestamp: now,
      })
      lastShownTimeRef.current.set(event.type, now)
    }
    
    if (newNotifications.length > 0) {
      setNotifications(prev => [...prev, ...newNotifications])
    }
    
    // Clean up old notifications (older than 3 seconds)
    const cutoff = now - 3000
    setNotifications(prev => prev.filter(n => n.timestamp > cutoff))
  }, [recentEvents])

  // Clean up old shown times periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      for (const [type, time] of lastShownTimeRef.current.entries()) {
        if (now - time > 5000) {
          lastShownTimeRef.current.delete(type)
        }
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const hasContent = activeEffects.length > 0 || notifications.length > 0

  if (!hasContent) {
    return null
  }

  return (
    <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-none z-50">
      {/* Active time-based effects */}
      {activeEffects.map((effect, index) => {
        const config = POWERUP_CONFIG[effect.type] || {
          icon: "❓",
          label: effect.typeName,
          color: "#888",
          bgColor: "rgba(136, 136, 136, 0.2)",
        }
        const progress = Math.min(100, (effect.remainingSeconds / 10) * 100) // Assuming 10s max duration
        
        return (
          <div
            key={`active-${effect.type}-${index}`}
            className="flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-sm border transition-all duration-300"
            style={{
              backgroundColor: config.bgColor,
              borderColor: config.color,
              boxShadow: `0 0 10px ${config.color}40`,
            }}
          >
            <span className="text-2xl">{config.icon}</span>
            <div className="flex flex-col min-w-[100px]">
              <span className="text-sm font-semibold text-white drop-shadow-lg">
                {config.label}
              </span>
              <div className="w-full h-1.5 bg-black/30 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-100"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: config.color,
                  }}
                />
              </div>
              <span className="text-xs text-white/70 mt-0.5">
                {effect.remainingSeconds.toFixed(1)}s
              </span>
            </div>
          </div>
        )
      })}

      {/* Recent event notifications (instant powerups) */}
      {notifications.map((notification) => {
        const config = POWERUP_CONFIG[notification.type] || {
          icon: "❓",
          label: "Unknown",
          color: "#888",
          bgColor: "rgba(136, 136, 136, 0.2)",
        }
        const age = (Date.now() - notification.timestamp) / 1000
        const opacity = Math.max(0, 1 - age / 3) // Fade out over 3 seconds
        
        return (
          <div
            key={notification.id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-sm border animate-slide-in"
            style={{
              backgroundColor: config.bgColor,
              borderColor: config.color,
              boxShadow: `0 0 15px ${config.color}60`,
              opacity,
              transform: `translateX(${(1 - opacity) * -20}px)`,
              transition: "opacity 0.3s ease-out, transform 0.3s ease-out",
            }}
          >
            <span className="text-2xl animate-bounce">{config.icon}</span>
            <span className="text-sm font-bold text-white drop-shadow-lg">
              {config.label}!
            </span>
          </div>
        )
      })}
    </div>
  )
}
