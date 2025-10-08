"use client"

import { useEffect, useRef } from "react"
import { useToast } from "./use-toast"

interface NotificationOptions {
  enabled: boolean
  soundEnabled: boolean
  desktopEnabled: boolean
}

export function useNotifications(options: NotificationOptions) {
  const { toast } = useToast()
  const audioRef = useRef<HTMLAudioElement>()

  useEffect(() => {
    // Request notification permission
    if (options.desktopEnabled && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission()
    }

    // Create audio element for sound notifications
    if (options.soundEnabled) {
      audioRef.current = new Audio("/notification-sound.mp3") // You'd need to add this file
      audioRef.current.volume = 0.3
    }
  }, [options.desktopEnabled, options.soundEnabled])

  const playNotificationSound = () => {
    if (options.soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {
        // Ignore autoplay restrictions
      })
    }
  }

  const showDesktopNotification = (title: string, body: string, icon?: string) => {
    if (
      options.desktopEnabled &&
      "Notification" in window &&
      Notification.permission === "granted" &&
      document.hidden
    ) {
      const notification = new Notification(title, {
        body,
        icon: icon || "/favicon.ico",
        tag: "chatroom-notification",
      })

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000)

      // Focus window when clicked
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    }
  }

  const notifyNewMessage = (sender: string, message: string, roomName: string) => {
    if (!options.enabled) return

    // Show toast notification
    toast({
      title: `New message in #${roomName}`,
      description: `${sender}: ${message.length > 50 ? message.substring(0, 50) + "..." : message}`,
    })

    // Play sound
    playNotificationSound()

    // Show desktop notification
    showDesktopNotification(`New message in #${roomName}`, `${sender}: ${message}`)
  }

  const notifyUserJoined = (username: string, roomName: string) => {
    if (!options.enabled) return

    toast({
      title: "User joined",
      description: `${username} joined #${roomName}`,
    })

    showDesktopNotification("User joined", `${username} joined #${roomName}`)
  }

  const notifyUserLeft = (username: string, roomName: string) => {
    if (!options.enabled) return

    toast({
      title: "User left",
      description: `${username} left #${roomName}`,
    })
  }

  const notifyMention = (sender: string, message: string, roomName: string) => {
    if (!options.enabled) return

    toast({
      title: `You were mentioned in #${roomName}`,
      description: `${sender}: ${message}`,
      variant: "default",
    })

    playNotificationSound()
    showDesktopNotification(`Mentioned in #${roomName}`, `${sender}: ${message}`)
  }

  return {
    notifyNewMessage,
    notifyUserJoined,
    notifyUserLeft,
    notifyMention,
    playNotificationSound,
  }
}
