export function LoginOrRegister() {
  /** @type {[AuthResponseType | null, React.Dispatch<React.SetStateAction<AuthResponseType | null>>]} */
  const [authResponse, setAuthResponse] = useState(null);

  /** @param {AuthResponseType} varTypeAuthResponse */
  function logInOrRegistered(varTypeAuthResponse) {
    console.log("AA: ", varTypeAuthResponse);
    setAuthResponse(varTypeAuthResponse);
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      {authResponse ? (
        <RootMain AuthResponseObject={authResponse} />
      ) : (
        <div className="flex gap-8 justify-center items-start">
          <div className="w-1/2">
            <LoginComponent onLoginSuccess={logInOrRegistered} />
          </div>{" "}
          <div className="w-1/2">
            <RegisterComponent whenCompletedSuccesfully={logInOrRegistered} />
          </div>
        </div>
      )}
    </main>
  );
}
