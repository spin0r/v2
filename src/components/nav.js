import { state } from '../app.js';
import { svgIcon } from '../utils.js';

// ====== NAV ======
function renderNav() {
  const isSearch = state.view === 'search';
  const isHistory = state.view === 'history';
  return `
  <nav>
    <div class="nav-logo">
      <img src="/web.svg" class="nav-logo-icon" alt="V" />
      <span>Viper</span>
      <span class="nav-badge">v2</span>
    </div>
    <ul class="nav-links">
      <li><a class="animate-line ${isSearch?'active':''}" id="nav-search" style="cursor:pointer">Search</a></li>
      <li><a class="animate-line ${state.view==='imx'?'active':''}" id="nav-imx" style="cursor:pointer">IMX</a></li>
      <li><a class="animate-line ${isHistory?'active':''}" id="nav-history" style="cursor:pointer">History</a></li>
      <li><a class="animate-line ${state.view==='rss'?'active':''}" id="nav-rss" style="cursor:pointer">RSS</a></li>
      <li><a class="animate-line" id="nav-docs" href="https://viper.to" target="_blank" rel="noopener">ViperGirls</a></li>
      <li><a class="animate-line" id="nav-aps" href="https://adultphotosets.best" target="_blank" rel="noopener">APS</a></li>
    </ul>
  </nav>`;
}


export { renderNav };
