import { createClient } from "npm:@supabase/supabase-js@2";
import { parseHTML } from "npm:linkedom@0.18.9";

const ALLOWED_ORIGINS = new Set([
  "https://pbtrkr.app",
  "https://www.pbtrkr.app",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

function cors(origin: string | null): Record<string,string> {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://pbtrkr.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8" }
  });
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripMarkup(value: string): string {
  return decodeEntities(value.replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ").trim());
}


function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isExcluded(node: Element): boolean {
  return Boolean(node.closest("nav, footer, aside, script, style, header, [class*='related'], [class*='sidebar'], [class*='share'], [class*='social'], [class*='recommend']"));
}

function extractJsonLdArticleBody(document: Document): string[] {
  const found: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.articleBody === "string" && record.articleBody.trim().length > 300) {
      found.push(record.articleBody.trim());
    }
    if (record["@graph"]) visit(record["@graph"]);
    if (record.mainEntity) visit(record.mainEntity);
    if (record.mainEntityOfPage) visit(record.mainEntityOfPage);
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { visit(JSON.parse(script.textContent || "")); } catch { /* ignore malformed JSON-LD */ }
  }
  return found.sort((a, b) => b.length - a.length);
}

function extractArticleBody(html: string, description: string): { bodyText: string; bodyHtml: string } {
  const { document } = parseHTML(html);
  const selectors = [
    '[itemprop="articleBody"]',
    'article',
    'main',
    '[class*="article-body"]',
    '[class*="article-content"]',
    '[class*="story-body"]',
    '[class*="story-content"]',
    '[data-testid*="article"]'
  ];
  let bestBlocks: Array<{ tag: string; text: string }> = [];
  let bestLength = 0;

  for (const selector of selectors) {
    for (const candidate of document.querySelectorAll(selector)) {
      const blocks: Array<{ tag: string; text: string }> = [];
      for (const node of candidate.querySelectorAll("h2,h3,h4,p,blockquote,li")) {
        if (isExcluded(node)) continue;
        const text = (node.textContent || "").replace(/\\s+/g, " ").trim();
        if (text.length < 25) continue;
        if (blocks.some(block => block.text === text)) continue;
        blocks.push({ tag: node.tagName.toLowerCase(), text });
      }
      const length = blocks.reduce((sum, block) => sum + block.text.length, 0);
      if (length > bestLength) { bestLength = length; bestBlocks = blocks; }
    }
  }

  if (bestLength < 300) {
    const jsonLd = extractJsonLdArticleBody(document)[0];
    if (jsonLd) {
      const paragraphs = jsonLd.split(/\\n\\s*\\n/).map(part => part.trim()).filter(Boolean);
      if (paragraphs.join("").length > bestLength) {
        bestBlocks = paragraphs.map(text => ({ tag: "p", text }));
        bestLength = paragraphs.join("").length;
      }
    }
  }

  if (bestLength < 300) {
    const articleRegion = document.querySelector("article") || document.querySelector("main");
    const text = (articleRegion?.textContent || "").replace(/\\s+/g, " ").trim();
    if (text.length > bestLength + 80 && text.length > 300) {
      bestBlocks = [{ tag: "p", text }];
      bestLength = text.length;
    }
  }

  if (bestLength < 300) {
    return { bodyText: description, bodyHtml: "<p>" + escapeHtml(description) + "</p>" };
  }

  const bodyText = bestBlocks.map(block => block.text).join("\\n\\n");
  const bodyHtml = bestBlocks.map(block => {
    const tag = block.tag === "h2" || block.tag === "h3" || block.tag === "h4" ? block.tag : "p";
    const content = tag === "p" && block.tag === "li" ? "• " + block.text : block.text;
    return "<" + tag + ">" + escapeHtml(content) + "</" + tag + ">";
  }).join("\\n");
  return { bodyText, bodyHtml };
}
function attributes(tag: string): Record<string,string> {
  const result: Record<string,string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tag)) !== null) result[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  return result;
}

function metaValue(html: string, key: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const a = attributes(tag);
    if ((a.property ?? "").toLowerCase() === key.toLowerCase() || (a.name ?? "").toLowerCase() === key.toLowerCase()) {
      return a.content ?? "";
    }
  }
  return "";
}

function canonicalArticleUrl(href: string, pageUrl: string): string | null {
  try {
    const url = new URL(href, pageUrl);
    if (url.hostname !== "pickleball.com" || url.protocol !== "https:") return null;
    if (!/^\/(?:news|people)\/[a-z0-9][a-z0-9-]+\/?$/i.test(url.pathname)) return null;
    return "https://pickleball.com" + url.pathname.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function extractCandidates(html: string, pageUrl: string): Array<{url:string,title:string}> {
  const found = new Map<string,string>();
  const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? [];
  for (const anchor of anchors) {
    const open = anchor.match(/^<a\b[^>]*>/i)?.[0] ?? "";
    const attrs = attributes(open);
    const url = canonicalArticleUrl(attrs.href ?? "", pageUrl);
    if (!url) continue;
    const title = stripMarkup(anchor.replace(/^<a\b[^>]*>/i, "").replace(/<\/a>\s*$/i, ""));
    if (!title || title.length < 8) continue;
    const previous = found.get(url) ?? "";
    if (title.length > previous.length) found.set(url, title);
  }
  return Array.from(found, ([url,title]) => ({url,title}));
}

function parseDate(html: string): string | null {
  const candidates = [
    metaValue(html, "article:published_time"),
    metaValue(html, "datePublished"),
    metaValue(html, "publish-date")
  ].filter(Boolean);
  for (const value of candidates) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const visible = stripMarkup(html.match(/<time\b[^>]*>[\s\S]*?<\/time>/i)?.[0] ?? "");
  const match = visible.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s*ET)?/i);
  if (match) {
    const d = new Date(match[0].replace(/\s+ET$/i, ""));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

async function fetchArticle(candidate: {url:string,title:string}) {
  const response = await fetch(candidate.url, {
    headers: {
      "Accept": "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (compatible; PBTRKRNewsImporter/1.0; +https://pbtrkr.app/news)"
    },
    redirect: "follow"
  });
  if (!response.ok) throw new Error("Pickleball.com returned " + response.status + " for " + candidate.title);
  const html = await response.text();
  const title = stripMarkup(metaValue(html, "og:title")) ||
    stripMarkup(html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i)?.[0] ?? "") ||
    candidate.title;
  const description = stripMarkup(metaValue(html, "og:description") || metaValue(html, "description")) || title;
  const imageRaw = metaValue(html, "og:image");
  let imageUrl: string | null = null;
  try {
    const parsed = new URL(imageRaw, candidate.url);
    if (parsed.protocol === "https:" && (parsed.hostname === "cdn.pickleball.com" || parsed.hostname === "images.pickleball.com")) imageUrl = parsed.href;
  } catch { /* no valid featured image */ }
  const sourceAuthor = stripMarkup(metaValue(html, "author") || metaValue(html, "article:author")) || null;
  const sourceId = new URL(candidate.url).pathname.split("/").filter(Boolean).at(-1) || candidate.url;
  const extracted = extractArticleBody(html, description);
  return {
    title,
    description: description.slice(0, 600),
    image_url: imageUrl,
    image_alt: title,
    source_author: sourceAuthor,
    published_at: parseDate(html),
    category: "Pickleball News",
    source_name: "Pickleball.com",
    source_url: candidate.url,
    source_article_id: sourceId,
    body_text: extracted.bodyText,
    body_html: extracted.bodyHtml
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Sign in as a PBTRKR administrator first." }, 401, origin);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    if (!supabaseUrl || !anonKey) throw new Error("Supabase function environment is missing public API configuration.");

    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } }
    });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Your sign-in session is invalid or expired. Sign in again." }, 401, origin);
    const role = String(authData.user.app_metadata?.role ?? "").toLowerCase();
    const roles = Array.isArray(authData.user.app_metadata?.roles) ? authData.user.app_metadata.roles.map((r: unknown) => String(r).toLowerCase()) : [];
    if (role !== "clinic_admin" && role !== "pbtrkr_admin" && !roles.includes("clinic_admin") && !roles.includes("pbtrkr_admin")) {
      return json({ error: "Only PBTRKR administrators can import articles." }, 403, origin);
    }

    let requestedLimit = 6;
    try {
      const body = await req.json();
      if (Number.isInteger(body?.limit)) requestedLimit = body.limit;
    } catch { /* use default limit */ }
    const limit = Math.max(1, Math.min(6, requestedLimit));

    const pages = ["https://pickleball.com/news/all", "https://pickleball.com/news/1", "https://pickleball.com/news/2"];
    const seen = new Set<string>();
    const candidates: Array<{url:string,title:string}> = [];
    for (const pageUrl of pages) {
      if (candidates.length >= limit) break;
      const response = await fetch(pageUrl, {
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "User-Agent": "Mozilla/5.0 (compatible; PBTRKRNewsImporter/1.0; +https://pbtrkr.app/news)"
        },
        redirect: "follow"
      });
      if (!response.ok) continue;
      const html = await response.text();
      for (const candidate of extractCandidates(html, response.url || pageUrl)) {
        if (seen.has(candidate.url)) continue;
        seen.add(candidate.url);
        candidates.push(candidate);
        if (candidates.length >= limit) break;
      }
    }
    if (!candidates.length) throw new Error("No article links were found on Pickleball.com’s news listing. Try again later.");

    const articles = [];
    for (const candidate of candidates.slice(0, limit)) {
      try {
        articles.push(await fetchArticle(candidate));
      } catch (error) {
        articles.push({
          title: candidate.title,
          description: candidate.title,
          image_url: null,
          image_alt: candidate.title,
          source_author: null,
          published_at: null,
          category: "Pickleball News",
          source_name: "Pickleball.com",
          source_url: candidate.url,
          source_article_id: new URL(candidate.url).pathname.split("/").filter(Boolean).at(-1) || candidate.url,
          body_text: candidate.title,
          body_html: "<p>" + candidate.title + "</p>",
          fetch_warning: error instanceof Error ? error.message : "Could not read the article page."
        });
      }
    }
    return json({ articles, requested: limit, returned: articles.length, source: "https://pickleball.com/news/all" }, 200, origin);
  } catch (error) {
    console.error("PBTRKR Pickleball.com import failed:", error);
    return json({ error: error instanceof Error ? error.message : "Import failed." }, 502, origin);
  }
});