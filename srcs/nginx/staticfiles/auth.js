// auth.js
async function registerUser(username, password) {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) throw new Error('Registration failed');
  const data = await res.json();
  localStorage.setItem('token', data.token); // store JWT or session token
  onAuthSuccess();
  return data;
}

async function loginUser(username, password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) throw new Error('Login failed');
  const data = await res.json();
  localStorage.setItem('token', data.token);
  onAuthSuccess();
  return data;
}

function onAuthSuccess() {
  // Hide auth UI
  document.getElementById('authUI').style.display = 'none';
  // Show game UI and canvas
  document.getElementById('renderCanvas').style.display = '';
  document.getElementById('ui').style.display = '';
  document.getElementById('controls').style.display = '';
  // Start the Pong game
  if (typeof startPongGame === 'function') {
    startPongGame();
  }
}
