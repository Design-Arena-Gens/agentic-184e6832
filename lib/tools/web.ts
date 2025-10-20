import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export type SearchResult = { title: string; url: string; snippet?: string };

export async function webSearch(query: string, maxResults = 5): Promise<SearchResult[]> {
  const q = encodeURIComponent(query);
  const url = `https://duckduckgo.com/html/?q=${q}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  $(".result__title a.result__a").each((_, el) => {
    if (results.length >= maxResults) return false;
    const href = $(el).attr("href");
    const title = $(el).text().trim();
    const snippet = $(el).closest(".result").find(".result__snippet").text().trim();
    if (href && title) results.push({ title, url: href, snippet });
  });
  return results;
}

export async function webFetch(url: string): Promise<{ url: string; status: number; contentType?: string; text: string }>{
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const contentType = res.headers.get("content-type") || undefined;
  const text = await res.text();
  return { url, status: res.status, contentType, text };
}

export async function webExtract(url: string): Promise<{ url: string; title: string; text: string }>{
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const title = article?.title || dom.window.document.title || url;
  const text = article?.textContent || dom.window.document.body.textContent || "";
  return { url, title, text };
}
