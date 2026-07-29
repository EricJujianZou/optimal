/**
 * Megamind internet reach — Agent-Reach–style capability layer.
 * Upstream: https://github.com/Panniantong/Agent-Reach
 *
 * Zero-config channels (no cookies / OpenCLI):
 *   search  → Exa (+ DDG/Jina fallback)
 *   web     → Jina Reader
 *   github  → gh CLI, else public api.github.com
 *   youtube → yt-dlp when present, else oEmbed + Jina
 *   rss     → native Atom/RSS parse
 *   v2ex    → public V2EX API
 *   linkedin / x.com / reddit public pages → Jina (best-effort)
 *
 * Cookie/OpenCLI channels (Twitter search, FB, IG, XHS, Bilibili login):
 *   reported by reachDoctor as locked — not offered in decide path.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { executeWebSearchTool } from "./web-search";
import { getExaApiKey } from "./config";

const execFileAsync = promisify(execFile);

export type ReachSource = { title: string; kind?: string };

export type ToolExecution = {
  output: unknown;
  sources: ReachSource[];
};

export type ReachChannelStatus = {
  channel: string;
  backend: string;
  ok: boolean;
  /** ok | warn | locked | off */
  status?: "ok" | "warn" | "locked" | "off";
  note?: string;
};

const UA =
  "Mozilla/5.0 (compatible; Megamind/1.0; +https://localhost; agent-reach)";

let cliCache: { gh: boolean; ytdlp: boolean } | null = null;

async function whichOk(bin: string): Promise<boolean> {
  try {
    await execFileAsync(bin, ["--version"], {
      timeout: 2500,
      env: process.env,
    });
    return true;
  } catch {
    return false;
  }
}

async function detectClis(): Promise<{ gh: boolean; ytdlp: boolean }> {
  if (cliCache) return cliCache;
  const [gh, ytdlp] = await Promise.all([whichOk("gh"), whichOk("yt-dlp")]);
  cliCache = { gh, ytdlp };
  return cliCache;
}

async function fetchText(
  url: string,
  timeoutMs: number,
  init?: RequestInit
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/plain, text/html, application/json, application/xml, */*",
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const text = await fetchText(url, timeoutMs, {
    headers: { Accept: "application/json" },
  });
  return JSON.parse(text) as T;
}

function stripTags(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeFeed(url: string, body?: string): boolean {
  const u = url.toLowerCase();
  if (/\/(feed|rss|atom)(\/|\.|\?|$)/i.test(u) || /\.(rss|atom|xml)(\?|$)/i.test(u)) {
    return true;
  }
  if (!body) return false;
  return /<(rss|feed)\b/i.test(body.slice(0, 800));
}

/** Agent-Reach doctor equivalent for Megamind backends. */
export async function reachDoctor(): Promise<ReachChannelStatus[]> {
  const clis = await detectClis();
  const exaKey = getExaApiKey();
  return [
    {
      channel: "search",
      backend: exaKey ? "exa" : "duckduckgo+jina",
      ok: true,
      status: "ok",
      note: exaKey
        ? "EXA_API_KEY set (Agent-Reach Exa channel)"
        : "No EXA_API_KEY — DDG/Jina fallback",
    },
    {
      channel: "web",
      backend: "jina-reader",
      ok: true,
      status: "ok",
      note: "https://r.jina.ai/{url}",
    },
    {
      channel: "rss",
      backend: "native-xml",
      ok: true,
      status: "ok",
      note: "RSS/Atom parsed in-process",
    },
    {
      channel: "github",
      backend: clis.gh ? "gh" : "api.github.com",
      ok: true,
      status: "ok",
      note: clis.gh
        ? "gh on PATH"
        : "public GitHub API (no auth) — install gh for private/richer",
    },
    {
      channel: "youtube",
      backend: clis.ytdlp ? "yt-dlp" : "oembed+jina",
      ok: true,
      status: clis.ytdlp ? "ok" : "warn",
      note: clis.ytdlp
        ? "yt-dlp on PATH"
        : "oEmbed + Jina (install yt-dlp for transcripts)",
    },
    {
      channel: "v2ex",
      backend: "v2ex-api",
      ok: true,
      status: "ok",
      note: "public topics / replies API",
    },
    {
      channel: "linkedin",
      backend: "jina-reader",
      ok: true,
      status: "warn",
      note: "public pages via Jina; profile scrape MCP not wired",
    },
    {
      channel: "twitter",
      backend: "jina-reader",
      ok: false,
      status: "locked",
      note: "single public pages via Jina best-effort; search needs twitter-cli cookies",
    },
    {
      channel: "reddit",
      backend: "reddit.json+jina",
      ok: true,
      status: "warn",
      note: "public .json when allowed; else Jina — login channels locked",
    },
    {
      channel: "bilibili",
      backend: "—",
      ok: false,
      status: "off",
      note: "needs bili-cli / OpenCLI (not installed in Megamind)",
    },
    {
      channel: "xiaohongshu",
      backend: "—",
      ok: false,
      status: "locked",
      note: "needs OpenCLI / cookies",
    },
    {
      channel: "facebook",
      backend: "—",
      ok: false,
      status: "locked",
      note: "needs OpenCLI",
    },
    {
      channel: "instagram",
      backend: "—",
      ok: false,
      status: "locked",
      note: "needs OpenCLI",
    },
  ];
}

/**
 * Semantic / live web search (Exa primary). Accepts one query or 1–2 queries.
 */
export async function reachSearch(args: {
  query?: unknown;
  queries?: unknown;
  limit?: unknown;
  timeoutMs?: unknown;
  preferNumeric?: unknown;
}): Promise<ToolExecution> {
  const fromList = Array.isArray(args.queries)
    ? args.queries
        .map((q) => String(q ?? "").trim())
        .filter(Boolean)
        .slice(0, 2)
    : [];
  const single = String(args.query ?? "").trim();
  const list = fromList.length > 0 ? fromList : single ? [single] : [];

  if (list.length === 0) {
    return { output: { error: "need query or queries" }, sources: [] };
  }

  const searchOpts = {
    limit: args.limit,
    timeoutMs: args.timeoutMs,
    preferNumeric: args.preferNumeric,
  };

  const bundles = await Promise.all(
    list.map((query) => executeWebSearchTool({ query, ...searchOpts }))
  );
  const sources: ReachSource[] = [];
  const results = bundles.map((b, i) => {
    sources.push(
      ...b.sources.slice(0, 2).map((s) => ({ title: s.title, kind: "web" }))
    );
    return {
      query: list[i],
      hits: b.output.hits,
      tookMs: b.output.tookMs,
      channel: "search",
      backend: "exa|ddg",
    };
  });

  if (list.length === 1) {
    return {
      output: {
        query: list[0],
        hits: results[0]?.hits,
        tookMs: results[0]?.tookMs,
        channel: "search",
      },
      sources: sources.slice(0, 6),
    };
  }

  return {
    output: { results, channel: "search" },
    sources: sources.slice(0, 6),
  };
}

async function readViaJina(
  url: string,
  timeoutMs = 3500
): Promise<ToolExecution> {
  const text = (
    await fetchText("https://r.jina.ai/" + encodeURI(url), timeoutMs, {
      headers: { Accept: "text/plain" },
    })
  ).slice(0, 4000);
  const titleMatch = /^Title:\s*(.+)$/m.exec(text);
  return {
    output: {
      url,
      excerpt: text.slice(0, 2800),
      channel: "web",
      backend: "jina-reader",
    },
    sources: [{ title: titleMatch?.[1]?.trim() || url, kind: "web" }],
  };
}

function parseRssItems(xml: string): Array<{
  title: string;
  link?: string;
  summary?: string;
}> {
  const items: Array<{ title: string; link?: string; summary?: string }> = [];
  const blocks =
    xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ||
    xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ||
    [];
  for (const block of blocks.slice(0, 8)) {
    const title =
      stripTags(
        /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block)?.[1] || ""
      ).slice(0, 160) || "untitled";
    const link =
      /<link[^>]*href=["']([^"']+)["']/i.exec(block)?.[1] ||
      stripTags(/<link[^>]*>([\s\S]*?)<\/link>/i.exec(block)?.[1] || "") ||
      undefined;
    const summary = stripTags(
      /<(description|summary|content)[^>]*>([\s\S]*?)<\/\1>/i.exec(block)?.[2] ||
        ""
    ).slice(0, 280);
    items.push({ title, link: link || undefined, summary: summary || undefined });
  }
  return items;
}

export async function reachRss(args: {
  url?: unknown;
}): Promise<ToolExecution> {
  const url = String(args.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return { output: { error: "url must start with http(s)://" }, sources: [] };
  }
  try {
    const xml = await fetchText(url, 5000, {
      headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    });
    const items = parseRssItems(xml);
    if (items.length === 0) {
      return {
        output: { error: "no feed items parsed", url },
        sources: [],
      };
    }
    const feedTitle =
      stripTags(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(xml)?.[1] || "").slice(
        0,
        120
      ) || url;
    return {
      output: {
        url,
        feed: feedTitle,
        items,
        channel: "rss",
        backend: "native-xml",
      },
      sources: items.slice(0, 4).map((i) => ({
        title: i.title,
        kind: "rss",
      })),
    };
  } catch (err) {
    return {
      output: { error: err instanceof Error ? err.message : String(err) },
      sources: [],
    };
  }
}

async function readViaGhCli(
  owner: string,
  repo: string
): Promise<ToolExecution> {
  const { stdout } = await execFileAsync(
    "gh",
    [
      "repo",
      "view",
      `${owner}/${repo}`,
      "--json",
      "name,description,url,stargazerCount,primaryLanguage,updatedAt",
    ],
    { timeout: 8000, maxBuffer: 512_000 }
  );
  const meta = JSON.parse(stdout) as Record<string, unknown>;
  return {
    output: {
      repo: `${owner}/${repo}`,
      ...meta,
      channel: "github",
      backend: "gh",
    },
    sources: [{ title: `${owner}/${repo}`, kind: "github" }],
  };
}

async function readViaGithubApi(
  owner: string,
  repo: string
): Promise<ToolExecution> {
  const data = await fetchJson<{
    full_name?: string;
    description?: string;
    html_url?: string;
    stargazers_count?: number;
    language?: string;
    updated_at?: string;
    open_issues_count?: number;
    topics?: string[];
  }>(`https://api.github.com/repos/${owner}/${repo}`, 4000);
  return {
    output: {
      repo: data.full_name || `${owner}/${repo}`,
      description: data.description,
      url: data.html_url,
      stargazerCount: data.stargazers_count,
      language: data.language,
      updatedAt: data.updated_at,
      openIssues: data.open_issues_count,
      topics: data.topics?.slice(0, 8),
      channel: "github",
      backend: "api.github.com",
    },
    sources: [
      {
        title: `${data.full_name || `${owner}/${repo}`}${
          data.stargazers_count != null ? ` ★${data.stargazers_count}` : ""
        }`,
        kind: "github",
      },
    ],
  };
}

async function readGithubIssueOrPr(
  owner: string,
  repo: string,
  kind: "issues" | "pulls",
  num: string
): Promise<ToolExecution> {
  const data = await fetchJson<{
    title?: string;
    body?: string;
    html_url?: string;
    state?: string;
    user?: { login?: string };
  }>(`https://api.github.com/repos/${owner}/${repo}/${kind}/${num}`, 4000);
  const excerpt = (data.body || "").slice(0, 2000);
  return {
    output: {
      repo: `${owner}/${repo}`,
      number: num,
      title: data.title,
      state: data.state,
      author: data.user?.login,
      url: data.html_url,
      excerpt,
      channel: "github",
      backend: "api.github.com",
    },
    sources: [
      {
        title: `${owner}/${repo}#${num}: ${data.title || ""}`.slice(0, 120),
        kind: "github",
      },
    ],
  };
}

async function readViaYtDlp(url: string): Promise<ToolExecution> {
  const { stdout } = await execFileAsync(
    "yt-dlp",
    [
      "--skip-download",
      "--no-warnings",
      "--print",
      "%(title)s\n%(channel)s\n%(duration_string)s\n%(description).1200s",
      url,
    ],
    { timeout: 18_000, maxBuffer: 1_000_000 }
  );
  const excerpt = stdout.trim().slice(0, 2800);
  const title = excerpt.split("\n")[0] || url;
  return {
    output: {
      url,
      excerpt,
      channel: "youtube",
      backend: "yt-dlp",
    },
    sources: [{ title, kind: "youtube" }],
  };
}

async function readViaYoutubeOembed(url: string): Promise<ToolExecution> {
  const oembed = await fetchJson<{
    title?: string;
    author_name?: string;
    provider_name?: string;
  }>(
    "https://www.youtube.com/oembed?" +
      new URLSearchParams({ url, format: "json" }).toString(),
    3500
  );
  // Enrich with Jina page text when possible
  let page = "";
  try {
    const j = await readViaJina(url, 4500);
    page = String((j.output as { excerpt?: string }).excerpt || "").slice(
      0,
      1800
    );
  } catch {
    /* oEmbed alone is fine */
  }
  const title = oembed.title || url;
  const excerpt = [
    title,
    oembed.author_name ? `Channel: ${oembed.author_name}` : "",
    page,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2800);
  return {
    output: {
      url,
      title,
      author: oembed.author_name,
      excerpt,
      channel: "youtube",
      backend: "oembed+jina",
    },
    sources: [{ title, kind: "youtube" }],
  };
}

async function readV2ex(url: string): Promise<ToolExecution> {
  const topicMatch = /\/t\/(\d+)/i.exec(url);
  if (topicMatch) {
    const id = topicMatch[1];
    const topicRaw = await fetchJson<
      Array<{
        id?: number;
        title?: string;
        url?: string;
        content?: string;
        replies?: number;
        member?: { username?: string };
        node?: { name?: string; title?: string };
      }>
    >(`https://www.v2ex.com/api/topics/show.json?id=${id}`, 4000);
    const topic = Array.isArray(topicRaw) ? topicRaw[0] : topicRaw;
    let replies: Array<{ author?: string; content?: string }> = [];
    try {
      const repliesRaw = await fetchJson<
        Array<{ content?: string; member?: { username?: string } }>
      >(
        `https://www.v2ex.com/api/replies/show.json?topic_id=${id}&page=1`,
        4000
      );
      replies = (repliesRaw || []).slice(0, 8).map((r) => ({
        author: r.member?.username,
        content: (r.content || "").slice(0, 280),
      }));
    } catch {
      /* optional */
    }
    return {
      output: {
        id: topic?.id || id,
        title: topic?.title,
        url: topic?.url || url,
        content: (topic?.content || "").slice(0, 1600),
        replies_count: topic?.replies,
        author: topic?.member?.username,
        node: topic?.node?.title || topic?.node?.name,
        replies,
        channel: "v2ex",
        backend: "v2ex-api",
      },
      sources: [
        {
          title: topic?.title || `V2EX t/${id}`,
          kind: "v2ex",
        },
      ],
    };
  }

  // Hot topics listing
  if (/v2ex\.com\/?(?:\?|$)/i.test(url) || /\/\?tab=/i.test(url)) {
    const hot = await fetchJson<
      Array<{ title?: string; url?: string; replies?: number; content?: string }>
    >("https://www.v2ex.com/api/topics/hot.json", 4000);
    const items = (hot || []).slice(0, 8).map((t) => ({
      title: t.title,
      url: t.url,
      replies: t.replies,
      content: (t.content || "").slice(0, 160),
    }));
    return {
      output: { items, channel: "v2ex", backend: "v2ex-api" },
      sources: items
        .filter((i) => i.title)
        .slice(0, 4)
        .map((i) => ({ title: String(i.title), kind: "v2ex" })),
    };
  }

  return readViaJina(url);
}

async function readRedditJson(url: string): Promise<ToolExecution> {
  const clean = url.replace(/\/$/, "").split("?")[0];
  const jsonUrl = /\.json$/i.test(clean) ? clean : `${clean}.json`;
  const data = await fetchJson<unknown>(jsonUrl, 4500);
  const listing = Array.isArray(data) ? data : [data];
  const post =
    (
      listing[0] as {
        data?: { children?: Array<{ data?: Record<string, unknown> }> };
      }
    )?.data?.children?.[0]?.data || {};
  const title = String(post.title || url);
  const selftext = String(post.selftext || post.body || "").slice(0, 1800);
  const comments =
    (
      listing[1] as {
        data?: { children?: Array<{ data?: Record<string, unknown> }> };
      }
    )?.data?.children
      ?.slice(0, 5)
      .map((c) => ({
        author: c.data?.author,
        body: String(c.data?.body || "").slice(0, 240),
      }))
      .filter((c) => c.body) || [];
  return {
    output: {
      url: post.permalink
        ? `https://www.reddit.com${post.permalink}`
        : url,
      title,
      score: post.score,
      subreddit: post.subreddit,
      excerpt: selftext,
      comments,
      channel: "reddit",
      backend: "reddit.json",
    },
    sources: [{ title, kind: "reddit" }],
  };
}

/**
 * Read a URL via Agent-Reach routing across zero-config channels.
 */
export async function reachRead(args: {
  url?: unknown;
}): Promise<ToolExecution> {
  const url = String(args.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return { output: { error: "url must start with http(s)://" }, sources: [] };
  }
  if (/\.(pdf|zip|png|jpe?g|gif|mp4|mp3|webp)(\?|$)/i.test(url)) {
    return { output: { error: "unsupported file type" }, sources: [] };
  }

  const clis = await detectClis();
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();

  try {
    // RSS / Atom
    if (looksLikeFeed(url)) {
      const feed = await reachRss({ url });
      if (!(feed.output as { error?: string }).error) return feed;
    }

    // YouTube
    if (
      host.includes("youtube.com") ||
      host === "youtu.be" ||
      host.includes("youtube-nocookie.com")
    ) {
      if (clis.ytdlp) {
        try {
          return await readViaYtDlp(url);
        } catch {
          /* fall through */
        }
      }
      try {
        return await readViaYoutubeOembed(url);
      } catch {
        return await readViaJina(url);
      }
    }

    // GitHub
    if (host === "github.com" || host === "www.github.com") {
      const issue = /github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/i.exec(
        url
      );
      if (issue) {
        const kind = issue[3] === "pull" ? "pulls" : "issues";
        try {
          return await readGithubIssueOrPr(
            issue[1],
            issue[2],
            kind,
            issue[4]
          );
        } catch {
          /* Jina fallback */
        }
      }
      const repoMatch = /github\.com\/([^/]+)\/([^/#?]+)(?:\/|$)/i.exec(url);
      if (repoMatch && !/\/(blob|tree|commit)\//i.test(url)) {
        const owner = repoMatch[1];
        const repo = repoMatch[2].replace(/\.git$/, "");
        if (clis.gh) {
          try {
            return await readViaGhCli(owner, repo);
          } catch {
            /* api fallback */
          }
        }
        try {
          return await readViaGithubApi(owner, repo);
        } catch {
          /* Jina */
        }
      }
    }

    // V2EX
    if (host.includes("v2ex.com")) {
      try {
        return await readV2ex(url);
      } catch {
        /* Jina */
      }
    }

    // Reddit public JSON
    if (host.includes("reddit.com")) {
      try {
        return await readRedditJson(url);
      } catch {
        /* Jina */
      }
    }

    // LinkedIn / X / others → Jina (longer timeout for heavy pages)
    const heavy =
      host.includes("linkedin.com") ||
      host.includes("x.com") ||
      host.includes("twitter.com");
    return await readViaJina(url, heavy ? 7000 : 5000);
  } catch (err) {
    return {
      output: { error: err instanceof Error ? err.message : String(err) },
      sources: [],
    };
  }
}
