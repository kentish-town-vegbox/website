// Cloudflare Pages Function: fetches the co-op's Substack RSS feed and
// returns the latest posts as JSON for the News page.
// Cached for an hour so Substack isn't hit on every page view.

const FEED_URL = 'https://kentishtownvegbox.substack.com/feed';
const MAX_POSTS = 9;

export async function onRequestGet() {
  try {
    const resp = await fetch(FEED_URL, {
      headers: { 'User-Agent': 'KentishTownVegbox-website' },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!resp.ok) {
      return json({ ok: false, error: 'Feed unavailable' }, 502);
    }
    const xml = await resp.text();

    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(xml)) !== null && items.length < MAX_POSTS) {
      const block = m[1];
      items.push({
        title: tag(block, 'title'),
        link: tag(block, 'link'),
        date: tag(block, 'pubDate'),
        excerpt: tag(block, 'description').replace(/<[^>]+>/g, '').trim(),
        image: attr(block, /<enclosure[^>]*\burl="([^"]+)"/),
      });
    }

    return json({ ok: true, items }, 200, { 'Cache-Control': 'public, max-age=900, s-maxage=3600' });
  } catch (e) {
    return json({ ok: false, error: 'Feed unavailable' }, 502);
  }
}

function tag(block, name) {
  const m = block.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'));
  if (!m) return '';
  return decode(m[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1').trim());
}

function attr(block, re) {
  const m = block.match(re);
  return m ? decode(m[1]) : '';
}

function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8217;/g, '\u2019')
    .replace(/&#8216;/g, '\u2018')
    .replace(/&#8220;/g, '\u201C')
    .replace(/&#8221;/g, '\u201D')
    .replace(/&#8211;/g, '\u2013')
    .replace(/&nbsp;/g, ' ');
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
