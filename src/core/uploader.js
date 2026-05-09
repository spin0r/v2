"use strict";

const axios = require("axios");
const FormData = require("form-data");

const PASTE_URL = "https://pb.dotrhelvetican.workers.dev";

async function uploadToPaste(content, expiryDays = 1) {
  const attempt = async () => {
    const form = new FormData();
    form.append("c", Buffer.from(content, "utf-8"), {
      filename: "paste.txt",
      contentType: "text/plain",
    });
    form.append("e", `${expiryDays}d`);
    const res = await axios.post(PASTE_URL, form, {
      headers: form.getHeaders(),
      timeout: 60000,
    });
    if (res.status === 200) {
      return {
        success: true,
        url: res.data.url,
        manageUrl: res.data.manageUrl,
        service: "pb",
      };
    }
    throw new Error(String(res.data).slice(0, 100));
  };

  try {
    return await attempt();
  } catch (e) {
    // Retry once on the same endpoint
    try {
      return await attempt();
    } catch (e2) {
      return { success: false, error: e2.message };
    }
  }
}

module.exports = { uploadToPaste };
