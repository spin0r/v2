import { bindNavEvents } from "./events/nav.js";
import { bindRssEvents } from "./events/rss.js";
import { bindCardEvents } from "./events/cards.js";
import { bindModalEvents } from "./events/modal.js";
import { bindImxEvents } from "./events/imx.js";

export function bindEvents() {
  const appEl = document.querySelector("#app");
  if (!appEl) return;

  bindNavEvents(appEl);
  bindRssEvents(appEl);
  bindCardEvents(appEl);
  bindModalEvents(appEl);
  bindImxEvents(appEl);
}
