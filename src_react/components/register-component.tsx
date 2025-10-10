"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, EyeOff, LogIn, UserPlus, Mail, Lock, User, AlertCircle } from 'lucide-react';
import { AuthResponse, type AuthResponseType } from '../../srcs/auth/dist/utils/api/service/auth/loginResponse.js'

// Mock authentication functions - replace with your actual API calls
const mockLogin = async (email: string, password: string) => {
  await new Promise(resolve => setTimeout(resolve, 1000));

  if (email && password) {
    const user = {
      id: Math.random().toString(36).substr(2, 9),
      username: email.split('@')[0],
      email: email
    };
    return { success: true, user };
  }
  throw new Error('Invalid credentials');
};

const mockRegister = async (
  username: string,
  email: string,
  password: string
): Promise<AuthResponseType> => {
  const url = "https://localhost/public_api/auth/create/user";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, email, password }),
    });

    if (!response.ok) {
      // Throw an error if the server responds with an error status
      const errorText = await response.text();
      throw new Error(errorText || "Registration failed");
    }

    // Parse the JSON returned by the server
    const data: AuthResponseType = await response.json();
    return data;

  } catch (err) {
    // Catch network or parsing errors
    throw new Error(err instanceof Error ? err.message : "Registration failed");
  }
};
interface onRegisterSuccess {
  onRegisterSuccess: (user: any) => void;
}
// public_api/auth/create/user
// post username, email, password
// 201 registered
// 400? 4001? error.

export default function RegisterForm({
  whenCompletedSuccesfully,
}: {
  whenCompletedSuccesfully: (response: AuthResponseType) => void;
}): JSX.Element {
  const [activeTab, setActiveTab] = useState<'register'>('register');

  // const [loginEmail, setLoginEmail] = useState('');
  // const [loginPassword, setLoginPassword] = useState('');
  // const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const validateUsername = (username: string): string | null => {
    if (username.length < 3) {
      return 'Username must be at least 3 characters';
    }
    if (username.length > 20) {
      return 'Username must be less than 20 characters';
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return 'Username can only contain letters, numbers, and underscores';
    }
    return null;
  };

  const handleRegister = async () => {
    setError(null);
    setValidationErrors({});

    const errors: Record<string, string> = {};

    const usernameError = validateUsername(registerUsername);
    if (usernameError) {
      errors.registerUsername = usernameError;
    }

    if (!registerEmail) {
      errors.registerEmail = 'Email is required';
    } else if (!validateEmail(registerEmail)) {
      errors.registerEmail = 'Please enter a valid email';
    }

    const passwordError = validatePassword(registerPassword);
    if (passwordError) {
      errors.registerPassword = passwordError;
    }

    if (registerPassword !== registerConfirmPassword) {
      errors.registerConfirmPassword = 'Passwords do not match';
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsLoading(true);
    try {
      const result = await mockRegister(registerUsername, registerEmail, registerPassword);
      // We are throwing so we assume it to be success here
      whenCompletedSuccesfully(result);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Create Account</CardTitle>
          <CardDescription className="text-center">
            Fill in your details to register
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="register-username">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="register-username"
                  type="text"
                  placeholder="johndoe"
                  value={registerUsername}
                  onChange={(e) => setRegisterUsername(e.target.value)}
                  className={`pl-10 ${validationErrors.registerUsername ? "border-red-500" : ""
                    }`}
                  disabled={isLoading}
                />
              </div>
              {validationErrors.registerUsername && (
                <p className="text-sm text-red-500">{validationErrors.registerUsername}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="register-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="register-email"
                  type="email"
                  placeholder="you@example.com"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  className={`pl-10 ${validationErrors.registerEmail ? "border-red-500" : ""
                    }`}
                  disabled={isLoading}
                />
              </div>
              {validationErrors.registerEmail && (
                <p className="text-sm text-red-500">{validationErrors.registerEmail}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="register-password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="register-password"
                  type={showRegisterPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  className={`pl-10 pr-10 ${validationErrors.registerPassword ? "border-red-500" : ""
                    }`}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showRegisterPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {validationErrors.registerPassword && (
                <p className="text-sm text-red-500">{validationErrors.registerPassword}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="register-confirm-password">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="register-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={registerConfirmPassword}
                  onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                  className={`pl-10 pr-10 ${validationErrors.registerConfirmPassword ? "border-red-500" : ""
                    }`}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {validationErrors.registerConfirmPassword && (
                <p className="text-sm text-red-500">{validationErrors.registerConfirmPassword}</p>
              )}
            </div>

            <Button onClick={handleRegister} className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Creating account...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create Account
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}