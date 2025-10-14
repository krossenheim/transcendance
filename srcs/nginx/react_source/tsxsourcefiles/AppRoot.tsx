import RegisterComponent from "./registerComponent";
import SocketComponent from "./socketComponent";
import LoginComponent from "./loginComponent";
import { useState } from "react";
import { AuthResponseType } from "../../../nodejs_base_image/utils/api/service/auth/loginResponse";

export default function AppRoot() {
  const [authResponse, setAuthResponse] = useState<AuthResponseType | null>(
    null
  );

  function logInOrRegistered(varTypeAuthResponse: AuthResponseType) {
    setAuthResponse(varTypeAuthResponse);
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      {authResponse ? (
        <SocketComponent AuthResponseObject={authResponse} />
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
