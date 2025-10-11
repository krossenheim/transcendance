function RegisterForm({ whenCompletedSuccesfully }) {
  const [username, setUsername] = React.useState("");
  function handleSubmit(e) {
    e.preventDefault();
    whenCompletedSuccesfully({ user: { username } });
  }
  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        required
      />
      <button type="submit">Register</button>
    </form>
  );
}

window.RegisterForm = RegisterForm;
