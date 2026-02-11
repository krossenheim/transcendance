"use client"

import { pub_url } from "@app/shared/api/service/common/endpoints"
import type { AuthResponseType } from "./types/auth-response"
import { apiCall } from "@utils/useApi"
import { useLanguage } from "./i18n"
import { useState } from "react"

interface RegisterComponentProps {
  whenCompletedSuccesfully: (data: any) => void
}

interface ValidationErrors {
  registerUsername?: string
  registerEmail?: string
  registerPassword?: string
  registerConfirmPassword?: string
}

export default function RegisterComponent({ whenCompletedSuccesfully }: RegisterComponentProps) {
  const { t } = useLanguage()
  const [registerUsername, setRegisterUsername] = useState<string>("")
  const [registerEmail, setRegisterEmail] = useState<string>("")
  const [registerPassword, setRegisterPassword] = useState<string>("")
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState<string>("")
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [showRegisterPassword, setShowRegisterPassword] = useState<boolean>(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false)

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return t('register.passwordMinLength')
    }
    if (!/[A-Z]/.test(password)) {
      return t('register.passwordUppercase')
    }
    if (!/[a-z]/.test(password)) {
      return t('register.passwordLowercase')
    }
    if (!/[0-9]/.test(password)) {
      return t('register.passwordNumber')
    }
    return null
  }

  const validateUsername = (username: string): string | null => {
    if (username.length < 3) {
      return t('register.usernameMinLength')
    }
    if (username.length > 20) {
      return t('register.usernameMaxLength')
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return t('register.usernameInvalid')
    }
    return null
  }

  const registerAsUser = async (username: string, email: string, password: string): Promise<AuthResponseType> => {
    const result = await apiCall(pub_url.http.auth.createNormalUser, {
      body: { username, email, password },
    });

    if (result.code !== 201)
      throw new Error(result.payload.message || "Registration failed")

    return result.payload;
  }

  const handleRegister = async () => {
    setError(null)
    setValidationErrors({})

    const errors: ValidationErrors = {}

    const usernameError = validateUsername(registerUsername)
    if (usernameError) errors.registerUsername = usernameError

    if (!registerEmail) {
      errors.registerEmail = t('register.emailRequired')
    } else if (!validateEmail(registerEmail)) {
      errors.registerEmail = t('register.emailInvalid')
    }

    const passwordError = validatePassword(registerPassword)
    if (passwordError) errors.registerPassword = passwordError

    if (registerPassword !== registerConfirmPassword) {
      errors.registerConfirmPassword = t('register.passwordsNoMatch')
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    setIsLoading(true)
    try {
      const AuthResponseOrError = await registerAsUser(registerUsername, registerEmail, registerPassword)
      whenCompletedSuccesfully(AuthResponseOrError)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError(t('register.registrationFailed'))
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex items-start justify-center px-4 py-4">
      <div className="w-full max-w-md shadow-lg glass-light-sm dark:glass-dark-sm glass-border p-4 md:p-6 mt-4 md:mt-6">
        <h1 className="text-2xl font-bold text-center mb-4 text-gray-900 dark:text-white">{t('register.title')}</h1>
        <p className="text-center mb-4 text-gray-500 dark:text-gray-300">{t('register.subtitle')}</p>

        {error && (
          <div className="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 p-2 mb-4 text-center">⚠️ {error}</div>
        )}

        <div className="space-y-4">
          {/* Username */}
          <div>
            <label htmlFor="register-username" className="block font-semibold text-gray-700 dark:text-gray-200">
              {t('register.username')}
            </label>
            <input
              id="register-username"
              type="text"
              placeholder="johndoe"
              value={registerUsername}
              onChange={(e) => setRegisterUsername(e.target.value)}
              className={`border p-2 w-full border-gray-300 dark:border-gray-600 bg-white/50 dark:bg-gray-700/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 ${validationErrors.registerUsername ? "border-red-500 dark:border-red-400" : ""
                }`}
              disabled={isLoading}
            />
            {validationErrors.registerUsername && (
              <p className="text-sm text-red-500 dark:text-red-300">{validationErrors.registerUsername}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="register-email" className="block font-semibold text-gray-700 dark:text-gray-200">
              {t('register.email')}
            </label>
            <input
              id="register-email"
              type="email"
              placeholder="you@example.com"
              value={registerEmail}
              onChange={(e) => setRegisterEmail(e.target.value)}
              className={`border p-2 w-full border-gray-300 dark:border-gray-600 bg-white/50 dark:bg-gray-700/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 ${validationErrors.registerEmail ? "border-red-500 dark:border-red-400" : ""
                }`}
              disabled={isLoading}
            />
            {validationErrors.registerEmail && (
              <p className="text-sm text-red-500 dark:text-red-300">{validationErrors.registerEmail}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="register-password" className="block font-semibold text-gray-700 dark:text-gray-200">
              {t('register.password')}
            </label>
            <input
              id="register-password"
              type={showRegisterPassword ? "text" : "password"}
              placeholder={t('register.passwordPlaceholder')}
              value={registerPassword}
              onChange={(e) => setRegisterPassword(e.target.value)}
              className={`border p-2 w-full border-gray-300 dark:border-gray-600 bg-white/50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 ${validationErrors.registerPassword ? "border-red-500 dark:border-red-400" : ""
                }`}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowRegisterPassword(!showRegisterPassword)}
              className="text-sm text-gray-600 dark:text-gray-300 mt-1"
            >
              {showRegisterPassword ? t('register.hidePassword') : t('register.showPassword')}
            </button>
            {validationErrors.registerPassword && (
              <p className="text-sm text-red-500 dark:text-red-300">{validationErrors.registerPassword}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="register-confirm-password" className="block font-semibold text-gray-700 dark:text-gray-200">
              {t('register.confirmPassword')}
            </label>
            <input
              id="register-confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              placeholder={t('register.confirmPasswordPlaceholder')}
              value={registerConfirmPassword}
              onChange={(e) => setRegisterConfirmPassword(e.target.value)}
              className={`border p-2 w-full border-gray-300 dark:border-gray-600 bg-white/50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 ${validationErrors.registerConfirmPassword ? "border-red-500 dark:border-red-400" : ""
                }`}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="text-sm text-gray-600 dark:text-gray-300 mt-1"
            >
              {showConfirmPassword ? t('register.hidePassword') : t('register.showPassword')}
            </button>
            {validationErrors.registerConfirmPassword && (
              <p className="text-sm text-red-500 dark:text-red-300">{validationErrors.registerConfirmPassword}</p>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleRegister}
            className="w-full bg-blue-600 dark:bg-blue-600 text-white py-2 hover:bg-blue-700 dark:hover:bg-blue-700 transition-colors"
            disabled={isLoading}
          >
            {isLoading ? t('register.registering') : t('register.registerButton')}
          </button>
        </div>
      </div>
    </div>
  )
}
