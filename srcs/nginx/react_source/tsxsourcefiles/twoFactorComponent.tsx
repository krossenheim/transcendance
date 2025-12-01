import React, { useState } from "react";

interface TwoFactorVerifyProps {
  tempToken: string;
  onVerifySuccess: (data: any) => void;
  onCancel: () => void;
}

export function TwoFactorVerify({
  tempToken,
  onVerifySuccess,
  onCancel,
}: TwoFactorVerifyProps) {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/public_api/auth/2fa/verify-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken, code }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Invalid 2FA code");
      }

      const data = await response.json();
      
      // Save tokens
      if (data?.tokens?.jwt) {
        localStorage.setItem("jwt", data.tokens.jwt);
      }
      if (data?.tokens?.refresh) {
        localStorage.setItem("refreshToken", data.tokens.refresh);
      }

      onVerifySuccess(data);
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleVerify();
    }
  };

  return (
    <div className="flex items-start justify-center bg-gradient-to-br from-blue-50 dark:from-gray-900 via-white dark:via-gray-800 to-purple-50 dark:to-gray-900 px-4 py-4">
      <div className="w-full max-w-md shadow-lg glass-light-sm dark:glass-dark-sm glass-border p-4 md:p-6 mt-4 md:mt-6">
        <h1 className="text-2xl font-bold text-center mb-2 text-gray-900 dark:text-white">
          Two-Factor Authentication
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
          Enter the 6-digit code from your authenticator app
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-center">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label
              htmlFor="2fa-code"
              className="block mb-1 font-semibold text-gray-700 dark:text-gray-200"
            >
              Authentication Code
            </label>
            <input
              id="2fa-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              placeholder="000000"
              className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 dark:bg-gray-700/80 dark:text-white disabled:opacity-50"
              autoFocus
            />
          </div>

          <button
            onClick={handleVerify}
            disabled={isLoading || code.length !== 6}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Verifying..." : "Verify"}
          </button>

          <button
            onClick={onCancel}
            disabled={isLoading}
            className="w-full py-3 px-4 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700/80 dark:hover:bg-gray-600/80 text-gray-800 dark:text-white font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface TwoFactorSetupProps {
  userId: number;
  username: string;
  onSetupComplete: () => void;
  onCancel: () => void;
}

export function TwoFactorSetup({
  userId,
  username,
  onSetupComplete,
  onCancel,
}: TwoFactorSetupProps) {
  const [step, setStep] = useState<"generate" | "verify">("generate");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/public_api/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, username }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to generate 2FA secret");
      }

      const data = await response.json();
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setStep("verify");
    } catch (err: any) {
      setError(err.message || "Setup failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnable = async () => {
    if (verifyCode.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/public_api/auth/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code: verifyCode }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Invalid verification code");
      }

      onSetupComplete();
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (step === "generate") {
    return (
      <div className="p-6 glass-light-sm dark:glass-dark-sm glass-border shadow-md">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
          Enable Two-Factor Authentication
        </h2>
        <p className="mb-6 text-gray-600 dark:text-gray-400">
          Two-factor authentication adds an extra layer of security to your account.
          You'll need an authenticator app like Google Authenticator or Authy.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={handleGenerate}
            disabled={isLoading}
            className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Generating..." : "Get Started"}
          </button>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 py-3 px-4 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700/80 dark:hover:bg-gray-600/80 text-gray-800 dark:text-white font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 glass-light-sm dark:glass-dark-sm glass-border shadow-md max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
        Scan QR Code
      </h2>
      
      <div className="mb-6">
        <p className="mb-4 text-gray-600 dark:text-gray-400">
          1. Open your authenticator app
        </p>
        <p className="mb-4 text-gray-600 dark:text-gray-400">
          2. Scan this QR code:
        </p>
        {qrCode && (
          <div className="flex justify-center mb-4 p-4 bg-white">
            <img src={qrCode} alt="2FA QR Code" className="w-64 h-64" />
          </div>
        )}
        
        <details className="mb-4">
          <summary className="cursor-pointer text-sm text-blue-600 dark:text-blue-400 hover:underline">
            Can't scan? Enter manually
          </summary>
          <div className="mt-2 p-3 bg-gray-100/40 dark:bg-gray-700/50 font-mono text-xs break-all">
            {secret}
          </div>
        </details>

        <p className="mb-4 text-gray-600 dark:text-gray-400">
          3. Enter the 6-digit code from your app:
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={verifyCode}
          onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
          disabled={isLoading}
          placeholder="000000"
          className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 dark:bg-gray-700/80 dark:text-white disabled:opacity-50"
          autoFocus
        />

        <button
          onClick={handleEnable}
          disabled={isLoading || verifyCode.length !== 6}
          className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "Verifying..." : "Enable 2FA"}
        </button>

        <button
          onClick={onCancel}
          disabled={isLoading}
          className="w-full py-3 px-4 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700/80 dark:hover:bg-gray-600/80 text-gray-800 dark:text-white font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface TwoFactorDisableProps {
  userId: number;
  onDisableComplete: () => void;
  onCancel: () => void;
}

export function TwoFactorDisable({
  userId,
  onDisableComplete,
  onCancel,
}: TwoFactorDisableProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDisable = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/public_api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to disable 2FA");
      }

      onDisableComplete();
    } catch (err: any) {
      setError(err.message || "Disable failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 glass-light-sm dark:glass-dark-sm glass-border shadow-md">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
        Disable Two-Factor Authentication
      </h2>
      <p className="mb-6 text-gray-600 dark:text-gray-400">
        Are you sure you want to disable two-factor authentication? 
        This will make your account less secure.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-4">
        <button
          onClick={handleDisable}
          disabled={isLoading}
          className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "Disabling..." : "Disable 2FA"}
        </button>
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 py-3 px-4 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700/80 dark:hover:bg-gray-600/80 text-gray-800 dark:text-white font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
