// Cloudflare Pages Function: fetches the "What's in the bag" Google Sheet
// (published to the web as CSV) and returns it as JSON for the homepage note.
//
// Sheet format – five columns with a header row:
//   Bag      | Item         | Farm          | County         | Fruit
//   Small    | New Potatoes | Nash Nursery  | Kent           |
//   Small    | Apples       | Ripple Farm   | Kent           | Yes
//   Standard | Peaches      | Bedlam Farms  | Cambridgeshire | Yes
//   Date     | 15th July    |               |                |    <- optional week label
//
// Put Yes in the Fruit column for fruit-supplement rows (they show in the
// note's footer for that bag). A row with Bag=Fruit is also accepted and
// applies its fruit to every bag size.
// Bag values: Small, Standard, Family, Mega, Fruit, Date (case-insensitive).

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ7DtjokRZ9I1T4ZU7SzOZQtJ9prdT1tFRoaW9mBADSHHA9R7CrPXy9cJ25W7KIVgjlhl-U615ubEfr/pub?gid=0&single=true&output=csv';

export async function onRequestGet() {
  if (SHEET_CSV_URL.startsWith('REPLACE')) {
    return json({ ok: false, error: 'Sheet not configured yet' }, 200);
  }
  try {
    const resp = await fetch(SHEET_CSV_URL, {
      cf: { cacheTtl: 900, cacheEverything: true },
    });
    if (!resp.ok) return json({ ok: false, error: 'Sheet unavailable' }, 502);
    const csv = await resp.text();
    const rows = parseCsv(csv);

    const SIZES = ['Small', 'Standard', 'Family', 'Mega'];
    const bags = {};
    const fruit = {};
    let date = '';
    for (let i = 1; i < rows.length; i++) { // skip header row
      const [bagRaw, item, farm, county, fruitFlag] = rows[i].map((c) => (c || '').trim());
      if (!bagRaw || !item) continue;
      const bag = bagRaw.charAt(0).toUpperCase() + bagRaw.slice(1).toLowerCase();
      if (bag === 'Date') { date = item; continue; }
      const source = farm && county ? `${farm}, ${county}` : (farm || county || '');
      const entry = { item, farm: source };
      const isFruit = /^y(es)?$/i.test(fruitFlag || '');
      if (bag === 'Fruit') {
        SIZES.forEach((s2) => (fruit[s2] = fruit[s2] || []).push(entry));
      } else if (SIZES.includes(bag)) {
        if (isFruit) (fruit[bag] = fruit[bag] || []).push(entry);
        else (bags[bag] = bags[bag] || []).push(entry);
      }
    }

    return json({ ok: true, bags, fruit, date }, 200, { 'Cache-Control': 'public, max-age=300, s-maxage=900' });
  } catch (e) {
    return json({ ok: false, error: 'Sheet unavailable' }, 502);
  }
}

// Minimal CSV parser handling quoted fields (commas inside quotes, "" escapes).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
