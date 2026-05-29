import axios from "axios";
import FormData from "form-data";

const PASTE_URL = "https://pb.dotrhelvetican.workers.dev";

export interface UploadResult {
  success: boolean;
  url?: string;
  manageUrl?: string;
  service?: string;
  error?: string;
}

export async function uploadToPaste(
  content: string,
  expiryDays = 1,
): Promise<UploadResult> {
  const attempt = async (): Promise<UploadResult> => {
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
  } catch {
    try {
      return await attempt();
    } catch (e2) {
      return { success: false, error: (e2 as Error).message };
    }
  }
}
