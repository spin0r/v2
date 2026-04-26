"use strict";

const axios = require("axios");
const FormData = require("form-data");

async function uploadToPaste(content, expiryDays = 1, service = "pb") {
  const url =
    service === "pb"
      ? "https://pb.dotrhelvetican.workers.dev"
      : "https://shz.al";
  try {
    const form = new FormData();
    form.append("c", Buffer.from(content, "utf-8"), {
      filename: "paste.txt",
      contentType: "text/plain",
    });
    form.append("e", `${expiryDays}d`);
    const res = await axios.post(url, form, {
      headers: form.getHeaders(),
      timeout: 60000,
    });
    if (res.status === 200) {
      return {
        success: true,
        url: res.data.url,
        manageUrl: res.data.manageUrl,
        service,
      };
    }
    return { success: false, error: String(res.data).slice(0, 100) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = { uploadToPaste };
