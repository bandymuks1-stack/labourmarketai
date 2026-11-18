/**
 * The crawlers that must find metadata in `<head>` (`htmlLimitedBots`).
 *
 * Next streams metadata into the body when it resolves after the head is sent,
 * and a script moves it later. A crawler that runs no script keeps it in the
 * body, where a canonical does not count. Measured 2026-11-04: the job board's
 * canonical reached the body for OAI-SearchBot, PerplexityBot and
 * Claude-SearchBot. Googlebot renders, but its first read is the raw HTML.
 *
 * Setting this REPLACES Next's own list, so that list is kept verbatim first
 * (`HTML_LIMITED_BOT_UA_RE`, next@15.5.24). Only these crawlers wait for the
 * metadata reads; people still get the streamed page.
 */
export const HTML_LIMITED_BOTS =
  /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight|Googlebot|OAI-SearchBot|ChatGPT-User|GPTBot|PerplexityBot|Perplexity-User|ClaudeBot|Claude-SearchBot|Claude-User|DuckAssistBot/i;
