import axios from "axios";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

export async function sendTelegramLog(message: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      },
      { timeout: 10000 },
    );
  } catch (e) {
    console.error("[Telegram] Failed to send log:", (e as Error).message);
  }
}

export function formatImxLog(data: {
  total: number;
  uploaded: number;
  failed: number;
  extracted: number;
  galleryUrl: string | null;
  pasteUrl: string | null;
  galleryName: string | null;
}): string {
  const lines: string[] = [
    `📤 <b>IMX Upload Complete</b>`,
    ``,
    `📁 Gallery: ${data.galleryName || "Untitled"}`,
    `📊 Total: ${data.total} | Uploaded: ${data.uploaded} | Failed: ${data.failed}`,
    `🔗 Extracted: ${data.extracted} direct URLs`,
  ];
  if (data.galleryUrl) lines.push(`🖼 Gallery: ${data.galleryUrl}`);
  if (data.pasteUrl) lines.push(`📋 Paste: ${data.pasteUrl}`);
  lines.push(``, `⏰ ${new Date().toISOString()}`);
  return lines.join("\n");
}
