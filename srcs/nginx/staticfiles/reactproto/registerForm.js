//(e: React.KeyboardEvent, action: () => void) => {}
const handleKeyPress = (e, action) => {
  if (e.key === "Enter") {
    e.preventDefault();
    action();
  }
};

function RegisterForm({ whenCompletedSuccesfully }) {
  // const validateEmail = (email: string): boolean => {
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // const validatePassword = (password: string): string | null => {
  const validatePassword = (password) => {
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

  //  const validateUsername = (username: string): string | null => {

  const validateUsername = (username) => {
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
  async function registerAsUser(username, email, password) {
    const url =
      "https://" + window.location.host + "/public_api/auth/create/user";

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
      const data = await response.json(); // AuthResponseType
      return data;
    } catch (err) {
      // Catch network or parsing errors
      throw new Error(err && err.message ? err.message : "Registration failed");
    }
  }
  // public_api/auth/create/user
  // post username, email, password
  // 201 registered
  // 400? 4001? error

  const handleRegister = async () => {
    setError(null);
    setValidationErrors({});

    //  const errors: Record<string, string> = {};
    const errors = {};

    const usernameError = validateUsername(registerUsername);
    if (usernameError) {
      errors.registerUsername = usernameError;
    }

    if (!registerEmail) {
      errors.registerEmail = "Email is required";
    } else if (!validateEmail(registerEmail)) {
      errors.registerEmail = "Please enter a valid email";
    }

    const passwordError = validatePassword(registerPassword);
    if (passwordError) {
      errors.registerPassword = passwordError;
    }

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
      // We are throwing so we assume it to be success here
      whenCompletedSuccesfully(AuthResponseOrError);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };
  const [validationErrors, setValidationErrors] = React.useState({});
  const [username, setUsername] = React.useState("");
  const [isLoading, setIsLoading] = React.useState("");
  const [error, setError] = React.useState(null);
  const [registerUsername, setRegisterUsername] = React.useState("");
  const [registerEmail, setRegisterEmail] = React.useState("");
  const [registerPassword, setRegisterPassword] = React.useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] =
    React.useState("");
  const [showRegisterPassword, setShowRegisterPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Create Account
          </CardTitle>
          <CardDescription className="text-center">
            Fill in your details to register
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert
              variant="destructive"
              className="mb-4 flex items-center gap-2"
            >
              <span className="h-4 w-4 text-yellow-500">⚠️</span>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            {/* Username */}
            <div className="space-y-2">
              <Label htmlFor="register-username">Username</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500">
                  👤
                </span>
                <Input
                  id="register-username"
                  type="text"
                  placeholder="johndoe"
                  value={registerUsername}
                  onChange={(e) => setRegisterUsername(e.target.value)}
                  className={`pl-10 ${
                    validationErrors.registerUsername ? "border-red-500" : ""
                  }`}
                  disabled={isLoading}
                />
              </div>
              {validationErrors.registerUsername && (
                <p className="text-sm text-red-500">
                  {validationErrors.registerUsername}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="register-email">Email</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500">
                  📧
                </span>
                <Input
                  id="register-email"
                  type="email"
                  placeholder="you@example.com"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  className={`pl-10 ${
                    validationErrors.registerEmail ? "border-red-500" : ""
                  }`}
                  disabled={isLoading}
                />
              </div>
              {validationErrors.registerEmail && (
                <p className="text-sm text-red-500">
                  {validationErrors.registerEmail}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="register-password">Password</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500">
                  🔒
                </span>
                <Input
                  id="register-password"
                  type={showRegisterPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  className={`pl-10 pr-10 ${
                    validationErrors.registerPassword ? "border-red-500" : ""
                  }`}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  <span className="h-4 w-4 text-gray-700">
                    {showRegisterPassword ? "🙈" : "👁️"}
                  </span>
                </button>
              </div>
              {validationErrors.registerPassword && (
                <p className="text-sm text-red-500">
                  {validationErrors.registerPassword}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="register-confirm-password">
                Confirm Password
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500">
                  🔒
                </span>
                <Input
                  id="register-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={registerConfirmPassword}
                  onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                  className={`pl-10 pr-10 ${
                    validationErrors.registerConfirmPassword
                      ? "border-red-500"
                      : ""
                  }`}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  <span className="h-4 w-4 text-gray-700">
                    {showConfirmPassword ? "🙈" : "👁️"}
                  </span>
                </button>
              </div>
              {validationErrors.registerConfirmPassword && (
                <p className="text-sm text-red-500">
                  {validationErrors.registerConfirmPassword}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleRegister}
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>Creating
                  account...
                </>
              ) : (
                <>
                  <span className="mr-2 h-4 w-4 text-purple-500">➕</span>Create
                  Account
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

window.RegisterForm = RegisterForm;
