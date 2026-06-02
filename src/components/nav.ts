import { state } from "../appShell.ts";
import { svgIcon } from "../utils.ts";

// ====== NAV ======
function renderNav(): string {
  const isSearch = state.view === "search";
  const isHistory = state.view === "history";
  return `
  <nav>
    <div class="nav-logo">
      ${svgIcon("viper").replace('<svg ', '<svg class="nav-logo-icon" ')}
      <span>Viper</span>
      <span class="nav-badge">v2</span>
    </div>
    <ul class="nav-links">
      <li><a class="animate-line ${isSearch ? "active" : ""}" id="nav-search" style="cursor:pointer">Search</a></li>
      <li><a class="animate-line" href="/imx">IMX</a></li>
      <li><a class="animate-line ${isHistory ? "active" : ""}" id="nav-history" style="cursor:pointer">History</a></li>
      <li><a class="animate-line ${state.view === "rss" ? "active" : ""}" id="nav-rss" style="cursor:pointer">RSS</a></li>
      <li><a class="animate-line" href="/plain" target="_blank" rel="noopener">Plain</a></li>
      <li><a class="animate-line" href="/docs" target="_blank" rel="noopener">Docs</a></li>
      <li><a class="animate-line" href="/text" target="_blank" rel="noopener">Text</a></li>
    </ul>
  </nav>`;
}

export { renderNav };
