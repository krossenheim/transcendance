"use client";

import RegisterForm from '@/components/register-component';
// when login or register
import { useState } from "react";
// run logInOrRegistered
import { AuthResponse, type AuthResponseType } from '../../srcs/auth/dist/utils/api/service/auth/loginResponse.js'



export default function Home() {
  const [registeredUser, setRegisteredUser] = useState<null | AuthResponseType>(null);

  function logInOrRegistered(response: AuthResponseType) : void{
    // This function takes things inside Home(){} and does thing sto them
    setRegisteredUser(response);
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      {registeredUser ? (
        <div className="text-center p-8 border rounded shadow">
          <h2 className="text-2xl font-bold">Welcome, {registeredUser.user.username}!</h2>
          <p>Your account has been created successfully.</p>
        </div>
      ) : (
        <RegisterForm whenCompletedSuccesfully={logInOrRegistered} />
      )}
    </main>
  );
}