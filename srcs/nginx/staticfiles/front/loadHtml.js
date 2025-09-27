export async function loadHTML(url, web_element) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to load HTML");
  const html = await response.text();
  web_element.innerHTML = html;
}
