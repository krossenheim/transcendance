export function gridCreateGrid(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container with id "${containerId}" not found.`);
    return;
  }

  // Apply container styles
  Object.assign(container.style, {
    display: "grid",
    width: "100%",
    height: "100%",
    gridTemplateColumns: "1fr 8fr 1fr", // 3 equal columns
    gridTemplateRows: "1fr 8fr 1fr",
    gap: "0", // remove gaps to avoid scrollbars
    border: "0", // or adjust box-sizing
    boxSizing: "border-box",
  });

  // Clear any existing content
  container.innerHTML = "";

  // Define cell colors for clarity
  const colors = [
    ["#81c784", "#81c784", "#81c784"],
    ["#81c784", "#f85c50", "#81c784"],
    ["#81c784", "#81c784", "#81c784"],
  ];

  const cells = [];

  // Create 3x3 grid cells
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cell = document.createElement("div");
      cell.id = `cell-${row + 1}-${col + 1}`;
      cell.textContent = `${row + 1},${col + 1}`;

      Object.assign(cell.style, {
        backgroundColor: colors[row][col],
        border: "1px solid #999",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      });

      container.appendChild(cell);
      cells.push(cell);
    }
  }

  // Return the array of cells
  return cells;
}

// Usage example:

// Usage example:
// createResizableGrid("embedded-container");
