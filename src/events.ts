import { bindNavEvents } from "./events/nav.ts";
import { bindRssEvents } from "./events/rss.ts";
import { bindCardEvents } from "./events/cards.ts";
import { bindModalEvents } from "./events/modal.ts";

export function bindEvents(): void {
  const appEl = document.querySelector<HTMLElement>("#app");
  if (!appEl) return;

  bindNavEvents(appEl);
  bindRssEvents(appEl);
  bindCardEvents(appEl);
  bindModalEvents(appEl);
}
