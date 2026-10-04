import { state, render } from "../appShell.ts";
import { toast, copyText } from "../utils.ts";
import { apiReExtract, apiThreadPostExtractStream } from "../api.ts";

export function bindModalEvents(appEl: HTMLElement): void {
  setupExtensionBridge();
  const overlay = appEl.querySelector("#modal-overlay");
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        state.modalData = null;
        render();
      }
    });
  }

  const dfOpenBtn = appEl.querySelector<HTMLElement>("#df-open");
  if (dfOpenBtn)
    dfOpenBtn.addEventListener("click", () =>
      window.open(dfOpenBtn.dataset.url, "_blank", "noopener"),
    );

  const cmdBlock = appEl.querySelector<HTMLElement>(".cmd-block");
  if (cmdBlock)
    cmdBlock.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".cmd-source-link")) return;
      copyText((cmdBlock.dataset.copyCmd || "").replace(/\\n/g, "\n") + "\n");
    });

  const dfCopyPaste = appEl.querySelector("#df-copy-paste");
  if (dfCopyPaste && state.directFetchResult?.pasteUrl) {
    dfCopyPaste.addEventListener("click", () =>
      copyText(state.directFetchResult!.pasteUrl!),
    );
  }

  const dfCopySend = appEl.querySelector("#df-copy-send");
  if (dfCopySend && state.directFetchResult?.sendCommand) {
    dfCopySend.addEventListener("click", () => {
      const d = state.directFetchResult!;
      let cmd = d.sendCommand!;
      if (d.sourceUrl) cmd += `\n\n<a href="${d.sourceUrl}">Source</a>`;
      copyText(cmd + "\n");
    });
  }

  // Thread view pagination
  const threadPrevBtn = appEl.querySelector("#thread-prev-page");
  const threadNextBtn = appEl.querySelector("#thread-next-page");
  if (threadPrevBtn) {
    threadPrevBtn.addEventListener("click", () => {
      if (state.threadPage > 0) {
        state.threadPage--;
        render();
      }
    });
  }
  if (threadNextBtn) {
    threadNextBtn.addEventListener("click", () => {
      if (state.threadData && state.threadPage < state.threadData.pages.length - 1) {
        state.threadPage++;
        render();
      }
    });
  }

  // Thread view extract buttons
  appEl.querySelectorAll<HTMLElement>(".extract-post-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const gidx = parseInt(btn.dataset.gidx || "0");
      if (state.fetchingThreadPosts.has(gidx)) return;

      const d = state.threadData;
      if (!d) return;
      let postTitle = `Post #${gidx + 1}`;
      let postId: string | undefined;
      let cur = 0;
      outer: for (const page of d.pages) {
        for (const p of page.posts) {
          if (cur === gidx) {
            postTitle = p.title || postTitle;
            postId = p.postId;
            break outer;
          }
          cur++;
        }
      }
      const postUrl = postId && d.url
        ? `${d.url.replace(/\/$/, "")}?p=${postId}&viewfull=1#post${postId}`
        : d.url;

      state.fetchingThreadPosts.set(gidx, { phase: "extracting", extracted: 0, total: 0 });
      render();

      try {
        const data = await apiThreadPostExtractStream(
          state.threadId!,
          gidx,
          (progress) => {
            const info = state.fetchingThreadPosts.get(gidx);
            if (!info) return;
            if (progress.type === "phase") {
              info.phase = progress.phase || info.phase;
              if (progress.total) info.total = progress.total;
              render();
            } else if (progress.type === "progress") {
              info.extracted = progress.extracted || 0;
              info.total = progress.total || 0;
              const el = document.querySelector(`[data-thread-progress="${gidx}"]`);
              if (el) el.textContent = `${progress.extracted}/${progress.total}`;
            }
          },
        );
        state.fetchingThreadPosts.delete(gidx);
        const result = { ...data, title: data.title || postTitle, sourceUrl: data.sourceUrl || postUrl };
        state.completedThreadPosts.set(gidx, result);
        render();
        toast(`✓ ${postTitle?.slice(0, 40)} — ${data.extracted || 0}/${data.total || 0}`, "success");
      } catch (err) {
        state.fetchingThreadPosts.delete(gidx);
        state.completedThreadPosts.set(gidx, { ok: false, error: (err as Error).message, title: postTitle, sourceUrl: postUrl });
        render();
        toast(`✗ ${postTitle?.slice(0, 40)} — failed`, "error");
      }
    });
  });

  // View completed thread post results
  appEl.querySelectorAll<HTMLElement>("[data-view-completed-post]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const gidx = parseInt(btn.dataset.viewCompletedPost || "0");
      const result = state.completedThreadPosts.get(gidx);
      if (result) {
        state.modalData = result;
        render();
      }
    });
  });

  const modalClose = appEl.querySelector("#modal-close");
  if (modalClose)
    modalClose.addEventListener("click", () => {
      state.modalData = null;
      render();
    });

  const modalCopyPaste = appEl.querySelector("#modal-copy-paste");
  if (modalCopyPaste)
    modalCopyPaste.addEventListener("click", () =>
      copyText(state.modalData?.pasteUrl || ""),
    );

  const modalCopySend = appEl.querySelector("#modal-copy-send");
  if (modalCopySend)
    modalCopySend.addEventListener("click", () => {
      const d = state.modalData;
      if (!d?.sendCommand) return;
      let cmd = d.sendCommand;
      if (d.sourceUrl) cmd += `\n\n<a href="${d.sourceUrl}">Source</a>`;
      copyText(cmd + "\n");
    });

  const modalOpen = appEl.querySelector<HTMLElement>("#modal-open");
  if (modalOpen)
    modalOpen.addEventListener("click", () =>
      window.open(modalOpen.dataset.url, "_blank", "noopener"),
    );

  // Re-extract Failed
  const reextractFailedBtn = appEl.querySelector<HTMLButtonElement>("#modal-reextract-failed");
  if (reextractFailedBtn)
    reextractFailedBtn.addEventListener("click", async () => {
      const d = state.modalData;
      if (!d || !d.failedLinks || !d.failedLinks.length) return;
      reextractFailedBtn.disabled = true;
      reextractFailedBtn.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:1.5px"></div> Retrying…';
      try {
        const result = await apiReExtract(
          d.failedLinks,
          d.directUrls || [],
          d.title || "",
          d.sourceUrl || "",
          d.hashtag ? d.hashtag.replace("#", "").replace(/_/g, " ").trim() : "",
          d.indexedFailedLinks || undefined,
          d.indexedUrls || undefined,
        );
        state.modalData = { ...result, title: result.title || d.title, sourceUrl: result.sourceUrl || d.sourceUrl };
        for (const [key, val] of state.completedCards.entries()) {
          if (val === d || (val.title === d.title && val.sourceUrl === d.sourceUrl)) {
            state.completedCards.set(key, state.modalData);
            break;
          }
        }
        for (const [key, val] of state.completedThreadPosts.entries()) {
          if (val === d || (val.title === d.title && val.sourceUrl === d.sourceUrl)) {
            state.completedThreadPosts.set(key, state.modalData);
            break;
          }
        }
        render();
        if ((result.newlyRecovered ?? 0) > 0) {
          toast(`✓ Recovered ${result.newlyRecovered} images! Now ${result.extracted}/${result.total}`, "success");
        } else {
          toast(`No additional images recovered (${result.extracted}/${result.total})`, "error");
        }
      } catch (err) {
        toast(`Re-extract failed: ${(err as Error).message}`, "error");
        reextractFailedBtn.disabled = false;
        reextractFailedBtn.innerHTML = "↻ Re-extract Failed";
      }
    });

  // Re-extract Local (via Local Browser Extension fallback)
  const reextractLocalBtn = appEl.querySelector<HTMLButtonElement>("#modal-reextract-local");
  if (reextractLocalBtn)
    reextractLocalBtn.addEventListener("click", async () => {
      const d = state.modalData;
      if (!d || !d.failedLinks || !d.failedLinks.length) return;
      reextractLocalBtn.disabled = true;
      reextractLocalBtn.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:1.5px"></div> Routing via Local IP…';
      try {
        toast(`⚡ Sending ${d.failedLinks.length} blocked links to local browser extension...`);
        const resolved = await requestLocalExtensionExtraction(
          d.failedLinks,
          d.indexedFailedLinks,
        );

        const recoveredCount =
          (resolved.resolvedIndexed && resolved.resolvedIndexed.length) ||
          Object.keys(resolved.resolvedLinks || {}).length;

        if (recoveredCount === 0) {
          throw new Error("Extension could not resolve any direct image links.");
        }

        reextractLocalBtn.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:1.5px"></div> Merging & Saving…';

        const result = await apiReExtract(
          d.failedLinks,
          d.directUrls || [],
          d.title || "",
          d.sourceUrl || "",
          d.hashtag ? d.hashtag.replace("#", "").replace(/_/g, " ").trim() : "",
          d.indexedFailedLinks || undefined,
          d.indexedUrls || undefined,
          resolved.resolvedLinks,
          resolved.resolvedIndexed,
        );

        state.modalData = { ...result, title: result.title || d.title, sourceUrl: result.sourceUrl || d.sourceUrl };
        for (const [key, val] of state.completedCards.entries()) {
          if (val === d || (val.title === d.title && val.sourceUrl === d.sourceUrl)) {
            state.completedCards.set(key, state.modalData);
            break;
          }
        }
        for (const [key, val] of state.completedThreadPosts.entries()) {
          if (val === d || (val.title === d.title && val.sourceUrl === d.sourceUrl)) {
            state.completedThreadPosts.set(key, state.modalData);
            break;
          }
        }
        render();
        if ((result.newlyRecovered ?? 0) > 0) {
          toast(`✓ Recovered ${result.newlyRecovered} images via Local IP! Now ${result.extracted}/${result.total}`, "success");
        } else {
          toast(`No additional images recovered (${result.extracted}/${result.total})`, "error");
        }
      } catch (err) {
        toast(`Local fallback: ${(err as Error).message}`, "error");
        reextractLocalBtn.disabled = false;
        reextractLocalBtn.innerHTML = `⚡ Local Fallback (${d.failedLinks.length})`;
      }
    });

  // Re-extract All
  const reextractAllBtn = appEl.querySelector("#modal-reextract-all");
  if (reextractAllBtn)
    reextractAllBtn.addEventListener("click", () => {
      const d = state.modalData;
      if (!d) return;
      state.modalData = null;

      for (const [key, val] of state.completedCards.entries()) {
        if (val === d || (val.title === d.title && val.sourceUrl === d.sourceUrl)) {
          state.completedCards.delete(key);
          if (typeof key === "string" && key.includes("-")) {
            const [cardIdx, postIdx] = key.split("-").map(Number);
            render();
            requestAnimationFrame(() => {
              const newBtn = appEl.querySelector<HTMLElement>(`[data-card-idx="${cardIdx}"][data-post-idx="${postIdx}"]`);
              if (newBtn) newBtn.click();
            });
          } else {
            state.scrapedCards.delete(key);
            render();
            requestAnimationFrame(() => {
              const newBtn = appEl.querySelector<HTMLElement>(`[data-fetch-idx="${key}"]`);
              if (newBtn) newBtn.click();
            });
          }
          return;
        }
      }
      for (const [key, val] of state.completedThreadPosts.entries()) {
        if (val === d || (val.title === d.title && val.sourceUrl === d.sourceUrl)) {
          state.completedThreadPosts.delete(key);
          render();
          requestAnimationFrame(() => {
            const newBtn = appEl.querySelector<HTMLElement>(`[data-gidx="${key}"]`);
            if (newBtn) newBtn.click();
          });
          return;
        }
      }
      render();
      toast("Could not find the original extraction to retry", "error");
    });

  // Copy command lines on click
  appEl.querySelectorAll<HTMLElement>("[data-copy-cmd]").forEach((el) => {
    el.style.cursor = "pointer";
    el.title = "Click to copy";
    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".cmd-source-link")) return;
      copyText((el.dataset.copyCmd || "").replace(/\\n/g, "\n") + "\n");
    });
  });
}

let extensionBridgeBound = false;

function setupExtensionBridge(): void {
  if (extensionBridgeBound) return;
  extensionBridgeBound = true;

  window.addEventListener("message", (e) => {
    if (!e.data || typeof e.data !== "object") return;

    if (e.data.type === "VIPER_PAGE_GET_FAILED_LINKS") {
      const d = state.modalData;
      window.postMessage(
        {
          type: "VIPER_PAGE_FAILED_LINKS_RESPONSE",
          id: e.data.id,
          hasModal: !!d,
          title: d?.title || "",
          failedCount: d?.failedLinks?.length || 0,
          failedLinks: d?.failedLinks || [],
          indexedFailedLinks: d?.indexedFailedLinks || [],
        },
        "*",
      );
    } else if (e.data.type === "VIPER_TRIGGER_LOCAL_REEXTRACT") {
      const localBtn = document.querySelector<HTMLButtonElement>("#modal-reextract-local");
      if (localBtn && !localBtn.disabled) {
        localBtn.click();
      }
    }
  });
}

function requestLocalExtensionExtraction(
  links: string[],
  indexedFailedLinks?: any[],
): Promise<{
  resolvedIndexed: { index: number; link: string; directUrl: string }[];
  resolvedLinks: Record<string, string>;
}> {
  return new Promise((resolve, reject) => {
    const reqId = "req_" + Math.random().toString(36).slice(2, 10);
    let handled = false;

    const timeout = setTimeout(() => {
      if (!handled) {
        handled = true;
        window.removeEventListener("message", handler);
        reject(
          new Error(
            "Local extension not detected or timed out. Please load the unpacked extension from the ./extension folder in chrome://extensions."
          ),
        );
      }
    }, 25000);

    function handler(e: MessageEvent) {
      if (!e.data || e.data.type !== "VIPER_EXT_RESOLVE_RESPONSE" || e.data.id !== reqId) return;
      handled = true;
      clearTimeout(timeout);
      window.removeEventListener("message", handler);

      if (e.data.success) {
        resolve(e.data.data);
      } else {
        reject(new Error(e.data.error || "Extension failed to extract links"));
      }
    }

    window.addEventListener("message", handler);

    window.postMessage(
      {
        type: "VIPER_EXT_RESOLVE_REQUEST",
        id: reqId,
        links,
        indexedFailedLinks,
      },
      "*",
    );
  });
}
