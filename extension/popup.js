document.addEventListener("DOMContentLoaded", async () => {
  const tabStatus = document.getElementById("tab-status");
  const btnTabFallback = document.getElementById("btn-tab-fallback");
  const manualInput = document.getElementById("manual-input");
  const btnManualExtract = document.getElementById("btn-manual-extract");
  const manualOutputBox = document.getElementById("manual-output-box");
  const manualResults = document.getElementById("manual-results");
  const btnCopyResults = document.getElementById("btn-copy-results");

  let activeTabId = null;

  // 1. Inspect Active Tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs.length) {
      tabStatus.textContent = "No active tab found.";
      return;
    }

    const tab = tabs[0];
    activeTabId = tab.id;

    chrome.tabs.sendMessage(tab.id, { action: "QUERY_PAGE_STATUS" }, (res) => {
      if (chrome.runtime.lastError || !res) {
        tabStatus.textContent = "Open your Viper web app to enable one-click fallback.";
        return;
      }

      if (res.isViperApp) {
        if (res.failedCount > 0) {
          tabStatus.innerHTML = `⚠️ <strong style="color:#f87171">${res.failedCount} blocked links</strong> detected on current page (${escapeHtml(res.title || "Viper")}).`;
          btnTabFallback.style.display = "flex";
          btnTabFallback.textContent = `⚡ Resolve ${res.failedCount} Blocked Links on Page`;
        } else {
          tabStatus.innerHTML = `✓ Connected to Viper app. No blocked links currently open.`;
        }
      } else {
        tabStatus.textContent = "Not currently on a Viper app page.";
      }
    });
  });

  // 2. Trigger fallback on active tab
  btnTabFallback.addEventListener("click", () => {
    if (!activeTabId) return;
    btnTabFallback.disabled = true;
    btnTabFallback.innerHTML = `<div class="spinner"></div> Resolving on page…`;

    chrome.tabs.sendMessage(activeTabId, { action: "TRIGGER_PAGE_FALLBACK" }, (res) => {
      setTimeout(() => {
        btnTabFallback.textContent = "✓ Triggered! Check your Viper tab.";
      }, 500);
    });
  });

  // 3. Manual URL Extraction
  btnManualExtract.addEventListener("click", async () => {
    const raw = manualInput.value.trim();
    if (!raw) return;

    const urls = raw
      .split(/[\r\n]+/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u));

    if (!urls.length) {
      alert("Please enter valid URLs (starting with http:// or https://)");
      return;
    }

    btnManualExtract.disabled = true;
    btnManualExtract.innerHTML = `<div class="spinner"></div> Extracting ${urls.length} URLs…`;

    chrome.runtime.sendMessage(
      { action: "resolve_urls", links: urls },
      (res) => {
        btnManualExtract.disabled = false;
        btnManualExtract.textContent = "Extract with Local Internet";

        if (!res || !res.success) {
          alert(`Failed: ${res?.error || "Unknown error"}`);
          return;
        }

        const resolved = Object.values(res.resolvedLinks || {});
        if (!resolved.length) {
          alert("Could not extract any direct image links from the provided URLs.");
          return;
        }

        manualResults.textContent = resolved.join("\n");
        manualOutputBox.classList.add("show");
      }
    );
  });

  // 4. Copy results to clipboard
  btnCopyResults.addEventListener("click", () => {
    navigator.clipboard.writeText(manualResults.textContent).then(() => {
      const orig = btnCopyResults.textContent;
      btnCopyResults.textContent = "✓ Copied to Clipboard!";
      setTimeout(() => {
        btnCopyResults.textContent = orig;
      }, 1500);
    });
  });

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
});
