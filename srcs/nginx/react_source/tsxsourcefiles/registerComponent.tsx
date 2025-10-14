import React, { useState } from "react";
import { AuthResponseType } from "../../../nodejs_base_image/utils/api/service/auth/loginResponse";
interface RegisterComponentProps {
  whenCompletedSuccesfully: (data: any) => void;
}

interface ValidationErrors {
  registerUsername?: string;
  registerEmail?: string;
  registerPassword?: string;
  registerConfirmPassword?: string;
}

export default function RegisterComponent({
  whenCompletedSuccesfully,
}: RegisterComponentProps) {
  const [registerUsername, setRegisterUsername] = useState<string>("");
  const [registerEmail, setRegisterEmail] = useState<string>("");
  const [registerPassword, setRegisterPassword] = useState<string>("");
  const [registerConfirmPassword, setRegisterConfirmPassword] =
    useState<string>("");
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showRegisterPassword, setShowRegisterPassword] =
    useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState<boolean>(false);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return "Password must be at least 8 characters";
    }
    if (!/[A-Z]/.test(password)) {
      return "Password must contain at least one uppercase letter";
    }
    if (!/[a-z]/.test(password)) {
      return "Password must contain at least one lowercase letter";
    }
    if (!/[0-9]/.test(password)) {
      return "Password must contain at least one number";
    }
    return null;
  };

  const validateUsername = (username: string): string | null => {
    if (username.length < 3) {
      return "Username must be at least 3 characters";
    }
    if (username.length > 20) {
      return "Username must be less than 20 characters";
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return "Username can only contain letters, numbers, and underscores";
    }
    return null;
  };

  const registerAsUser = async (
    username: string,
    email: string,
    password: string
  ): Promise<AuthResponseType> => {
    const url = `https://${window.location.host}/public_api/auth/create/user`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Registration failed");
    }

    const data: AuthResponseType = await response.json();
    return data;
  };

  const handleRegister = async () => {
    setError(null);
    setValidationErrors({});

    const errors: ValidationErrors = {};

    const usernameError = validateUsername(registerUsername);
    if (usernameError) errors.registerUsername = usernameError;

    if (!registerEmail) {
      errors.registerEmail = "Email is required";
    } else if (!validateEmail(registerEmail)) {
      errors.registerEmail = "Please enter a valid email";
    }

    const passwordError = validatePassword(registerPassword);
    if (passwordError) errors.registerPassword = passwordError;

    if (registerPassword !== registerConfirmPassword) {
      errors.registerConfirmPassword = "Passwords do not match";
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsLoading(true);
    try {
      const AuthResponseOrError = await registerAsUser(
        registerUsername,
        registerEmail,
        registerPassword
      );
      whenCompletedSuccesfully(AuthResponseOrError);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Registration failed");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <div className="w-full max-w-md shadow-lg rounded-lg bg-white p-6">
        <h1 className="text-2xl font-bold text-center mb-4">Create Account</h1>
        <p className="text-center mb-4 text-gray-500">
          Fill in your details to register
        </p>

        {error && (
          <div className="bg-red-100 text-red-700 p-2 rounded mb-4 text-center">
            ⚠️ {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Username */}
          <div>
            <label htmlFor="register-username" className="block font-semibold">
              Username
            </label>
            <input
              id="register-username"
              type="text"
              placeholder="johndoe"
              value={registerUsername}
              onChange={(e) => setRegisterUsername(e.target.value)}
              className={`border p-2 w-full rounded ${
                validationErrors.registerUsername ? "border-red-500" : ""
              }`}
              disabled={isLoading}
            />
            {validationErrors.registerUsername && (
              <p className="text-sm text-red-500">
                {validationErrors.registerUsername}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="register-email" className="block font-semibold">
              Email
            </label>
            <input
              id="register-email"
              type="email"
              placeholder="you@example.com"
              value={registerEmail}
              onChange={(e) => setRegisterEmail(e.target.value)}
              className={`border p-2 w-full rounded ${
                validationErrors.registerEmail ? "border-red-500" : ""
              }`}
              disabled={isLoading}
            />
            {validationErrors.registerEmail && (
              <p className="text-sm text-red-500">
                {validationErrors.registerEmail}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="register-password" className="block font-semibold">
              Password
            </label>
            <input
              id="register-password"
              type={showRegisterPassword ? "text" : "password"}
              placeholder="••••••••"
              value={registerPassword}
              onChange={(e) => setRegisterPassword(e.target.value)}
              className={`border p-2 w-full rounded ${
                validationErrors.registerPassword ? "border-red-500" : ""
              }`}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowRegisterPassword(!showRegisterPassword)}
              className="text-sm text-gray-600 mt-1"
            >
              {showRegisterPassword ? "Hide" : "Show"} Password
            </button>
            {validationErrors.registerPassword && (
              <p className="text-sm text-red-500">
                {validationErrors.registerPassword}
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label
              htmlFor="register-confirm-password"
              className="block font-semibold"
            >
              Confirm Password
            </label>
            <input
              id="register-confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="••••••••"
              value={registerConfirmPassword}
              onChange={(e) => setRegisterConfirmPassword(e.target.value)}
              className={`border p-2 w-full rounded ${
                validationErrors.registerConfirmPassword ? "border-red-500" : ""
              }`}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="text-sm text-gray-600 mt-1"
            >
              {showConfirmPassword ? "Hide" : "Show"} Password
            </button>
            {validationErrors.registerConfirmPassword && (
              <p className="text-sm text-red-500">
                {validationErrors.registerConfirmPassword}
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleRegister}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
            disabled={isLoading}
          >
            {isLoading ? "Creating account..." : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
