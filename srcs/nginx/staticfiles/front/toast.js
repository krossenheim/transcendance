// toast.js
export function showToast(message, duration = 3000, toast_container_id) {
  let container = document.getElementById(toast_container_id);
  if (!container) {
    container = document.createElement("div");
    container.id = "toast_container_id";
    Object.assign(container.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      zIndex: 9999,
    });
    document.body.appendChild(container);
  } 

  const toast = document.createElement("div");
  toast.textContent = message;
  Object.assign(toast.style, {
    background: "#333",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    opacity: "0",
    transform: "translateY(20px)",
    transition: "opacity 0.3s ease, transform 0.3s ease",
    cursor: "pointer",
  });

  toast.addEventListener("click", () => {
    if (container.contains(toast)) container.removeChild(toast);
  });

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";
    setTimeout(() => {
      if (container.contains(toast)) container.removeChild(toast);
    }, 300);
  }, duration);
}
