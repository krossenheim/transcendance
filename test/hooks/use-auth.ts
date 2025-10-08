"use client"

import { useState, useEffect, createContext, useContext } from "react"

interface User {
  id: string
  username: string
}

interface AuthContextType {
  user: User | null
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const context = useContext(AuthContext)

  useEffect(() => {
    // Check for stored user session
    const storedUser = localStorage.getItem("chatroom-user")
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser))
      } catch (e) {
        localStorage.removeItem("chatroom-user")
      }
    }
    setIsLoading(false)
  }, [])

  const login = async (username: string, password: string) => {
    // Mock authentication - in real app, this would call your API
    if (username && password) {
      const user = { id: Date.now().toString(), username }
      setUser(user)
      localStorage.setItem("chatroom-user", JSON.stringify(user))
    } else {
      throw new Error("Invalid credentials")
    }
  }

  const register = async (username: string, password: string) => {
    // Mock registration - in real app, this would call your API
    if (username && password) {
      const user = { id: Date.now().toString(), username }
      setUser(user)
      localStorage.setItem("chatroom-user", JSON.stringify(user))
    } else {
      throw new Error("Registration failed")
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem("chatroom-user")
  }

  if (!context) {
    return { user, login, register, logout, isLoading }
  }
  return context
}
