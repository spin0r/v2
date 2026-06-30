import https from "https";
import type { IncomingMessage, ServerResponse } from "http";
import { sendJSON, readBody } from "../utils.js";

const USER_ID = "6a30186dce47071879e22b53";
const GARDEN_ID = Buffer.from(
  USER_ID.match(/\w{2}/g)!.map((e) => String.fromCharCode(parseInt(e, 16))).join(""),
  "binary",
).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
const AUTH_COOKIE =
  "s%3ANmEzMDE4NmRjZTQ3MDcxODc5ZTIyYjUzOlljNFZlUmtQQ3pBK2dSYW9mUElxUzRqMjBsbVhPb2xiOHcwMzZMc25yU3FwckFEZWRDd0tyRVE0bFpZR1A0aEtCeld6Vk9XR284UmVzYStuSFBSK0d3K2dWMHd2bStZNG5xV2U0RUpVaWc5NEhBRVFUN2h3eGZ5VTlwNG0xMm9qb3R6MCtnPT0%3D.kDyTuWTg1KVbLnFlDjCSALiHRaaECKrTkiru0LY8s2s";

function fgRequest(method: string, apiPath: string, body: Buffer | null, extraHeaders: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = body || Buffer.alloc(0);
    const req = https.request(
      {
        hostname: "api.filegarden.com",
        path: apiPath,
        method,
        headers: {
          Cookie: `auth=${AUTH_COOKIE}`,
          "Content-Type": "application/octet-stream",
          "Content-Length": data.length,
          ...extraHeaders,
        },
      },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => resolve({ status: res.statusCode!, body: b }));
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function getOrCreateDir(name: string): Promise<{ id: string; path: string }> {
  const list = await fgRequest("GET", `/users/${USER_ID}/pipe`, null);
  const { items } = JSON.parse(list.body);
  const existing = (items as Array<{ type: string; name: string; id: string; path: string }>).find(
    (i) => i.type === "/" && i.name === name,
  );
  if (existing) return existing;
  const res = await fgRequest("POST", `/users/${USER_ID}/pipe`, null, {
    "X-Data": JSON.stringify({ parent: null, name, type: "/" }),
  });
  if (res.status !== 201) throw new Error(`Failed to create dir: ${res.body}`);
  return JSON.parse(res.body);
}

// GET /api/fgarden/list — list items (optionally by parent folder)
export async function handleFgardenList(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const parent = url.searchParams.get("parent");
    const apiPath = parent
      ? `/users/${USER_ID}/pipe?parent=${encodeURIComponent(parent)}`
      : `/users/${USER_ID}/pipe`;
    const r = await fgRequest("GET", apiPath, null);
    const data = JSON.parse(r.body);
    sendJSON(res, 200, { ok: true, items: data.items || [], gardenId: GARDEN_ID });
  } catch (e) {
    sendJSON(res, 500, { ok: false, error: (e as Error).message });
  }
}

// POST /api/fgarden/upload — upload file or URL
// Body: { url?: string, name?: string, dir?: string }
// Or multipart form with file + optional dir/name fields
export async function handleFgardenUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const contentType = req.headers["content-type"] || "";

    let fileData: Buffer | null = null;
    let fileName = "";
    let dirName = "";
    let fileUrl = "";

    if (contentType.includes("application/json")) {
      const body = await readBody(req);
      const parsed = JSON.parse(body) as { url?: string; name?: string; dir?: string };
      fileUrl = parsed.url || "";
      fileName = parsed.name || "";
      dirName = parsed.dir || "";
      if (!fileUrl) return sendJSON(res, 400, { ok: false, error: "Missing url" });
      const urlObj = new URL(fileUrl);
      if (!fileName) fileName = urlObj.pathname.split("/").pop() || "file";
    } else if (contentType.includes("multipart/form-data")) {
      // Parse multipart manually
      const boundary = contentType.split("boundary=")[1];
      if (!boundary) return sendJSON(res, 400, { ok: false, error: "No boundary" });

      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks);

      const sep = Buffer.from(`--${boundary}`);
      const parts: Buffer[] = [];
      let start = 0;
      while (start < raw.length) {
        const idx = raw.indexOf(sep, start);
        if (idx === -1) break;
        const partStart = idx + sep.length;
        if (raw[partStart] === 0x2d && raw[partStart + 1] === 0x2d) break; // --
        // skip \r\n
        const headerStart = raw[partStart] === 0x0d ? partStart + 2 : partStart;
        parts.push(raw.slice(headerStart));
        start = partStart;
      }

      for (const part of parts) {
        const headerEnd = part.indexOf("\r\n\r\n");
        if (headerEnd === -1) continue;
        const headers = part.slice(0, headerEnd).toString();
        const value = part.slice(headerEnd + 4);
        // Trim trailing boundary separator
        const trimmed = trimBoundary(value, boundary);

        const dispMatch = headers.match(/Content-Disposition:.*name="([^"]+)"/i);
        const nameAttr = dispMatch?.[1] || "";
        const filenameMatch = headers.match(/filename="([^"]+)"/i);

        if (filenameMatch) {
          fileName = filenameMatch[1];
          fileData = trimmed;
        } else if (nameAttr === "dir") {
          dirName = trimmed.toString().trim();
        } else if (nameAttr === "name") {
          fileName = trimmed.toString().trim();
        } else if (nameAttr === "url") {
          fileUrl = trimmed.toString().trim();
        }
      }

      if (!fileData && !fileUrl) return sendJSON(res, 400, { ok: false, error: "No file or url provided" });
      if (!fileName) fileName = "file";
    } else {
      return sendJSON(res, 400, { ok: false, error: "Unsupported content type" });
    }

    let parentId: string | null = null;
    if (dirName) {
      const dir = await getOrCreateDir(dirName);
      parentId = dir.id;
    }

    const xData: Record<string, unknown> = { parent: parentId, name: fileName };
    if (fileUrl) xData.url = fileUrl;

    const uploadRes = await fgRequest("POST", `/users/${USER_ID}/pipe`, fileData, {
      "X-Data": JSON.stringify(xData),
    });

    if (uploadRes.status !== 201) {
      let errorMsg = uploadRes.body;
      try {
        const parsed = JSON.parse(uploadRes.body);
        if (parsed.error) {
          // Strip HTML tags like <b> from the error message
          errorMsg = parsed.error.replace(/<[^>]*>?/gm, '');
        }
      } catch (e) {
        // Not JSON, use raw body
      }
      return sendJSON(res, uploadRes.status, { ok: false, error: errorMsg });
    }

    const item = JSON.parse(uploadRes.body) as { path: string; id: string; name: string };
    const fileLink = `https://file.garden/${GARDEN_ID}/${item.path}`;
    sendJSON(res, 201, { ok: true, url: fileLink, item });
  } catch (e) {
    sendJSON(res, 500, { ok: false, error: (e as Error).message });
  }
}

function trimBoundary(buf: Buffer, boundary: string): Buffer {
  const sep = Buffer.from(`\r\n--${boundary}`);
  const idx = buf.lastIndexOf(sep);
  return idx !== -1 ? buf.slice(0, idx) : buf;
}
