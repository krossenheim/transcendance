import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";

function App() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-pink-100 via-purple-100 to-blue-100 p-6">
      <h1 className="text-5xl font-extrabold text-pink-600 mb-6 drop-shadow-lg">
        Cute Tailwind Test
      </h1>
      <div className="bg-red-500 text-white p-4">Tailwind Test</div>

      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full flex flex-col items-center gap-4 transform transition-all hover:scale-105 hover:shadow-3xl">
        <p className="text-gray-700 text-center text-lg">
          Tailwind lets you style with{" "}
          <span className="font-bold text-purple-500">utility classes</span>!
        </p>

        <button className="px-6 py-3 bg-pink-500 text-white font-semibold rounded-full shadow-md hover:bg-pink-600 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
          Click Me
        </button>

        <div className="flex space-x-3 mt-4">
          <span className="w-4 h-4 bg-red-400 rounded-full animate-bounce"></span>
          <span className="w-4 h-4 bg-yellow-400 rounded-full animate-bounce delay-150"></span>
          <span className="w-4 h-4 bg-green-400 rounded-full animate-bounce delay-300"></span>
        </div>
      </div>

      <p className="mt-8 text-gray-500 italic text-sm">
        Hover over the card and button for some magic ✨
      </p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
