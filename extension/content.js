/**
 * Viper Local Extractor - Content Script
 * Bridges communication between the Viper Web App page and the background service worker.
 */

// Announce extension presence to the page
function announceReady() {
  window.postMessage(
    {
      type: "VIPER_EXT_PONG",
      version: "1.0.0",
      isViperExtension: true,
    },
    "*"
  );
}

announceReady();
window.addEventListener("load", announceReady);

// Listen for messages from the Viper web page
window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || typeof event.data !== "object") return;

  // Web page pinging to check if extension is installed
  if (event.data.type === "VIPER_EXT_PING") {
    announceReady();
    return;
  }

  // Web page requesting local residential extraction
  if (event.data.type === "VIPER_EXT_RESOLVE_REQUEST") {
    const { id, links, indexedFailedLinks } = event.data;

    chrome.runtime.sendMessage(
      {
        action: "resolve_urls",
        links,
        indexedFailedLinks,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage(
            {
              type: "VIPER_EXT_RESOLVE_RESPONSE",
              id,
              success: false,
              error: chrome.runtime.lastError.message,
            },
            "*"
          );
          return;
        }

        window.postMessage(
          {
            type: "VIPER_EXT_RESOLVE_RESPONSE",
            id,
            success: response?.success ?? false,
            data: response,
            error: response?.error,
          },
          "*"
        );
      }
    );
  }
});

// Listen for messages from extension popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "QUERY_PAGE_STATUS") {
    // Check if the current page has a Viper modal with failed links
    const modal = document.querySelector("#modal-overlay.open");
    const retryBtn = document.querySelector("#modal-reextract-local, #modal-reextract-failed");
    const modalTitle = document.querySelector(".modal-title-text")?.textContent || "";
    
    // Ask the window app for exact failed links count
    const queryId = "q_" + Math.random().toString(36).slice(2, 8);
    let answered = false;

    const listener = (e) => {
      if (e.data && e.data.type === "VIPER_PAGE_FAILED_LINKS_RESPONSE" && e.data.id === queryId) {
        answered = true;
        window.removeEventListener("message", listener);
        sendResponse({
          isViperApp: true,
          hasModal: true,
          title: e.data.title || modalTitle,
          failedCount: e.data.failedCount || 0,
          failedLinks: e.data.failedLinks || [],
          indexedFailedLinks: e.data.indexedFailedLinks || [],
        });
      }
    };
    window.addEventListener("message", listener);

    window.postMessage({ type: "VIPER_PAGE_GET_FAILED_LINKS", id: queryId }, "*");

    setTimeout(() => {
      if (!answered) {
        window.removeEventListener("message", listener);
        sendResponse({
          isViperApp: !!modal || !!retryBtn || document.title.toLowerCase().includes("viper"),
          hasModal: !!modal,
          title: modalTitle,
          failedCount: 0,
          failedLinks: [],
        });
      }
    }, 400);

    return true; // async response
  }

  if (message.action === "TRIGGER_PAGE_FALLBACK") {
    window.postMessage({ type: "VIPER_TRIGGER_LOCAL_REEXTRACT" }, "*");
    sendResponse({ success: true });
    return true;
  }
});
