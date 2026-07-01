import axios, { AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import { HOST_MAP, IMAGE_HOSTS } from "./hosts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export class ImageHostExtractor {
  private client: AxiosInstance;
  private cookies: Record<string, string>;

  constructor() {
    this.client = axios.create({
      headers: { "User-Agent": UA },
      timeout: 10000,
      maxRedirects: 5,
    });
    this.cookies = {};
  }

  private async _get(url: string, opts: Record<string, unknown> = {}): Promise<string> {
    const cookieStr = Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    const headers = cookieStr
      ? { Cookie: cookieStr, ...(opts.headers as object) }
      : opts.headers;
    const res = await this.client.get(url, { ...opts, headers });
    return res.data;
  }

  private _load(html: string) {
    return cheerio.load(html);
  }

  private _og($: cheerio.CheerioAPI): string | null {
    return $('meta[property="og:image"]').attr("content") ?? null;
  }

  private _cleanThumb(src: string): string {
    return src.replace(/(\.|_)(md|th|tn|thumbnail|preview)(\.|_)/gi, "$1$3");
  }

  async extractImxTo(url: string): Promise<string | null> {
    try {
      const html = await this._get(url);
      const $ = this._load(html);
      let img = $("img#iimg").attr("src") || $("img.centred").attr("src");
      if (img) return img;
      const btn = $('input[name="imgContinue"]');
      if (btn.length) {
        const form = btn.closest("form");
        const action = form.attr("action") || url;
        const formUrl = new URL(action, url).href;
        const data = new URLSearchParams();
        form.find("input[name]").each((_, el) => {
          data.append($(el).attr("name")!, $(el).attr("value") || "");
        });
        const res = await this.client.post(formUrl, data.toString(), {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        const $2 = this._load(res.data);
        img = $2("img#iimg").attr("src") || $2("img.centred").attr("src");
        if (img) return img;
      }
      return $("img#image").attr("src") ?? this._og($);
    } catch {
      return null;
    }
  }

  async extractImagebam(url: string): Promise<string | null> {
    try {
      this.cookies["nsfw_inter"] = "1";
      this.cookies["sfw_inter"] = "1";
      const html = await this._get(url, { headers: { Cookie: "nsfw_inter=1; sfw_inter=1" } });
      const $ = this._load(html);
      const img = $("img.main-image").attr("src");
      if (img) return img;
      for (const el of $("img").toArray()) {
        const src = $(el).attr("src") || "";
        if (/\.(jpg|jpeg|png|webp)$/i.test(src)) return src;
      }
      return this._og($);
    } catch {
      return null;
    }
  }

  async extractPixhost(url: string): Promise<string | null> {
    try {
      const html = await this._get(url);
      const $ = this._load(html);

      // Try DOM image selector first — it's specific to the current page
      let src = $("img#image, img#show_image, img.image-center").first().attr("src");
      if (src && !/\/show\//.test(src)) {
        if (src.includes("/thumbs/"))
          src = src.replace("//t", "//img").replace("/thumbs/", "/images/");
        return src;
      }

      // pswp_items contains ALL gallery images, so we must match the current
      // page's image rather than blindly picking the first URL
      const urlFilename = url.split("/").pop()?.replace(/\.\w+$/, "") || "";
      for (const el of $("script").toArray()) {
        const text = $(el).html() || "";
        if (text.includes("pswp_items")) {
          const urls = [...text.matchAll(/https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp)/gi)].map((m) => m[0]);
          const nonThumb = urls.filter((u) => !/\/thumbs\/|\/show\//.test(u));
          if (nonThumb.length) {
            // Try matching by filename from the input URL
            if (urlFilename) {
              const match = nonThumb.find((u) => u.includes(urlFilename));
              if (match) return match;
            }
            // Safe to use if there's only one full-size image
            if (nonThumb.length === 1) return nonThumb[0];
          }
        }
      }

      return this._og($);
    } catch {
      return null;
    }
  }

  async extractViprIm(url: string): Promise<string | null> {
    try {
      const html = await this._get(url, {
        headers: {
          Referer: "https://vipr.im/",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      });
      const $ = this._load(html);
      const img = $("img.pic").attr("src");
      if (img) return img;
      for (const el of $("img").toArray()) {
        const src = $(el).attr("src") || "";
        if (src.includes("vipr.im") && /\.(jpg|jpeg|png|gif|webp)$/i.test(src)) return src;
      }
      return this._og($);
    } catch {
      return null;
    }
  }

  async extractPostimg(url: string): Promise<string | null> {
    try {
      const html = await this._get(url);
      const $ = this._load(html);
      return $("img#main-image, img.main-image").first().attr("src") ?? this._og($);
    } catch {
      return null;
    }
  }

  async extractImgbox(url: string): Promise<string | null> {
    try {
      if (/\.(jpg|jpeg|png|gif|webp)$/i.test(url)) return url;
      const html = await this._get(url);
      const $ = this._load(html);
      return $("img#img").attr("src") ?? this._og($);
    } catch {
      return null;
    }
  }

  async extractImagetwist(url: string): Promise<string | null> {
    try {
      const html = await this._get(url);
      const $ = this._load(html);
      let img = $("img.pic, img#img_obj").first().attr("src");
      if (img) return img;
      const filename = url.replace(/\/$/, "").split("/").pop();
      if (filename) {
        const re = new RegExp(filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        for (const el of $("img").toArray()) {
          const src = $(el).attr("src") || "";
          if (re.test(src) && src !== url) return src;
        }
      }
      return this._og($);
    } catch {
      return null;
    }
  }

  async extractTurboimagehost(url: string): Promise<string | null> {
    try {
      const html = await this._get(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          Referer: "https://turboimagehost.com/",
        },
      });
      const $ = this._load(html);
      return $("img#imageid, img.centred_resized, img.main-image").first().attr("src") ?? this._og($);
    } catch {
      return null;
    }
  }

  async extractImgur(url: string): Promise<string | null> {
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(url)) return url;
    try {
      const html = await this._get(url);
      return this._og(this._load(html));
    } catch {
      return null;
    }
  }

  async extractFastpic(url: string): Promise<string | null> {
    try {
      const html = await this._get(url);
      const $ = this._load(html);
      for (const el of $("img").toArray()) {
        const src = $(el).attr("src") || "";
        if (src.includes("/big/")) return src;
      }
      return $("img#image").attr("src") ?? this._og($);
    } catch {
      return null;
    }
  }

  async extractImgxxt(url: string): Promise<string | null> {
    try {
      const html = await this._get(url);
      const $ = this._load(html);
      return (
        $('link[rel="image_src"]').attr("href") ??
        $('meta[property="og:image"]').attr("content") ??
        $(".image-viewer-container img").attr("src") ??
        this._og($)
      );
    } catch {
      return null;
    }
  }

  async extractImgdrive(url: string): Promise<string | null> {
    try {
      const html = await this._get(url);
      const $ = this._load(html);
      const og = $('meta[property="og:image"]').attr("content");
      if (og) {
        if (og.includes("/small/")) {
          const hd = og.replace("/small/", "/big/");
          try {
            await this.client.head(hd);
            return hd;
          } catch {}
        }
        return og;
      }
      return (
        $("img.centred_resized, img.main-image, img.pic, img#myImage, img#main_image").first().attr("src") ??
        this._og($)
      );
    } catch {
      return null;
    }
  }

  async extractPimpandhost(url: string): Promise<string | null> {
    try {
      const html = await this._get(url);
      const $ = this._load(html);
      const wrapper = $(".main-image-wrapper").attr("data-src");
      if (wrapper) return wrapper;
      const img = $("img.main-image, img#main-image").first().attr("src");
      return img ? this._cleanThumb(img) : this._og($);
    } catch {
      return null;
    }
  }

  async extractImagevenue(url: string): Promise<string | null> {
    try {
      const html = await this._get(url);
      const $ = this._load(html);
      const img = $("img.card-img-top, img#main-image").first().attr("src");
      if (img) return img;
      for (const el of $("img").toArray()) {
        const src = $(el).attr("src") || "";
        if (/\.(jpg|jpeg|png|webp)$/i.test(src)) return src;
      }
      return this._og($);
    } catch {
      return null;
    }
  }

  async extractViaOgImage(url: string): Promise<string | null> {
    try {
      const html = await this._get(url);
      return this._og(this._load(html));
    } catch {
      return null;
    }
  }

  async extractDirectUrl(url: string): Promise<string | null> {
    for (const [domain, method] of HOST_MAP) {
      if (url.includes(domain))
        return (this as unknown as Record<string, (u: string) => Promise<string | null>>)[method](url);
    }
    return this.extractViaOgImage(url);
  }
}

export { IMAGE_HOSTS };
