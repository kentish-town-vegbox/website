// Cloudflare Pages Function: handles member survey submissions from /survey.
// Forwards each (anonymous) response to a Google Apps Script web app attached to
// the responses Google Sheet, which appends a row and saves any photo to Drive.
// Set-up instructions: tools/survey-sheet/README.md
//
// Requires two environment variables (Cloudflare dashboard: Workers & Pages ->
// kentishtownvegbox -> Settings -> Variables and Secrets):
//   SURVEY_SCRIPT_URL  the Apps Script web app URL (ends in /exec)
//   SURVEY_SECRET      the shared secret printed by setup() in the Apps Script

// [form field name, column heading in the Sheet] – order here is the column order.
const COLUMNS = [
  ["q1_bag", "1. Bag type"],
  ["q2_length", "2. Length of membership"],
  ["q3_collection", "3. Collection point"],
  ["q4_collection_rating", "4. Collection point rating (1-5)"],
  ["q5_collection_improve", "5. Collection point improvements"],
  ["q6_diet", "6. Typical diet"],
  ["q7_experience", "7. Experience of being a member"],
  ["q8_cooking", "8. Changed how you cook and eat"],
  ["q9_nps", "9. Likely to recommend (0-10)"],
  ["q10_veg_quality", "10. Veg quality (1-5)"],
  ["q10_veg_quantity", "10. Veg quantity (1-5)"],
  ["q10_veg_variety", "10. Veg variety/range (1-5)"],
  ["q10_veg_value", "10. Veg value for money (1-5)"],
  ["q11_fruit_quality", "11. Fruit quality (1-5)"],
  ["q11_fruit_quantity", "11. Fruit quantity (1-5)"],
  ["q11_fruit_variety", "11. Fruit variety/range (1-5)"],
  ["q11_fruit_value", "11. Fruit value for money (1-5)"],
  ["q12_onions_amount", "12A. Onions - amount now"],
  ["q12_onions_freq", "12B. Onions - future frequency"],
  ["q12_potatoes_amount", "12A. Potatoes - amount now"],
  ["q12_potatoes_freq", "12B. Potatoes - future frequency"],
  ["q12_mushrooms_amount", "12A. Mushrooms - amount now"],
  ["q12_mushrooms_freq", "12B. Mushrooms - future frequency"],
  ["q12_carrots_amount", "12A. Carrots - amount now"],
  ["q12_carrots_freq", "12B. Carrots - future frequency"],
  ["q12_other_root_amount", "12A. Other root veg - amount now"],
  ["q12_other_root_freq", "12B. Other root veg - future frequency"],
  ["q12_leafy_greens_amount", "12A. Leafy greens - amount now"],
  ["q12_leafy_greens_freq", "12B. Leafy greens - future frequency"],
  ["q12_salad_bags_amount", "12A. Salad bags - amount now"],
  ["q12_salad_bags_freq", "12B. Salad bags - future frequency"],
  ["q12_cabbage_cauli_amount", "12A. Cabbages and cauliflower - amount now"],
  ["q12_cabbage_cauli_freq", "12B. Cabbages and cauliflower - future frequency"],
  ["q12_squash_amount", "12A. Squash and pumpkin - amount now"],
  ["q12_squash_freq", "12B. Squash and pumpkin - future frequency"],
  ["q12_leeks_amount", "12A. Leeks - amount now"],
  ["q12_leeks_freq", "12B. Leeks - future frequency"],
  ["q12_summer_veg_amount", "12A. Summer veg - amount now"],
  ["q12_summer_veg_freq", "12B. Summer veg - future frequency"],
  ["q13_favourite", "13. Favourite vegetable"],
  ["q14_never_eat", "14. Vegetable never eaten"],
  ["q15_unused", "15. Veg unused in a typical week"],
  ["q16_topup", "16. Buy extra elsewhere"],
  ["q16_topup_what", "16. What and how much"],
  ["q17_staples_variety", "17. Staples or variety"],
  ["q18_items_amounts", "18. More items or larger amounts"],
  ["q19_winter_sourcing", "19. Late winter/spring sourcing"],
  ["q20_less_common", "20. Less common veg happy to receive"],
  ["q20_other", "20. Other less common veg"],
  ["q21_comments", "21. Other comments"],
];

const MAX_TEXT = 4000;
const MAX_PHOTO_B64 = 8 * 1024 * 1024; // ~6 MB image once decoded
const PHOTO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif' };

export async function onRequestPost(context) {
  try {
    let body;
    try {
      body = await context.request.json();
    } catch (e) {
      return json({ ok: false, error: 'Sorry, we could not read your answers. Please try again.' }, 400);
    }

    // Honeypot: real people never fill this hidden field
    if (body.website) return json({ ok: true });

    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const row = COLUMNS.map(([key]) => clean(answers[key]));

    let photo = null;
    const p = body.photo;
    if (p && typeof p.data === 'string' && p.data) {
      const type = String(p.type || '').toLowerCase();
      if (!PHOTO_EXT[type] || !/^[A-Za-z0-9+/]+=*$/.test(p.data)) {
        return json({ ok: false, error: 'Sorry, we can only accept JPEG, PNG, WebP, GIF or HEIC pictures.' }, 400);
      }
      if (p.data.length > MAX_PHOTO_B64) {
        return json({ ok: false, error: 'Sorry, that picture is too large. Please choose a smaller one.' }, 413);
      }
      photo = { type, ext: PHOTO_EXT[type], data: p.data };
    }

    if (!photo && row.every((v) => !v)) {
      return json({ ok: false, error: 'Please answer at least one question before sending.' }, 400);
    }

    const url = context.env.SURVEY_SCRIPT_URL;
    const secret = context.env.SURVEY_SECRET;
    if (!url || !secret) {
      return json({ ok: false, error: 'The survey is not switched on yet. Please try again later.' }, 500);
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, headers: COLUMNS.map(([, heading]) => heading), row, photo }),
    });
    const text = await res.text();
    let result = null;
    try { result = JSON.parse(text); } catch (e) { /* Apps Script returned an HTML error page */ }
    if (!res.ok || !result || !result.ok) {
      console.log('Survey sheet error:', res.status, result ? result.error : text.slice(0, 300));
      return json({ ok: false, error: 'Sorry, something went wrong saving your answers. Please try again, or email us at info@vegbox.org.uk.' }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    console.log('Survey error:', e);
    return json({ ok: false, error: 'Sorry, something went wrong. Please try again, or email us at info@vegbox.org.uk.' }, 500);
  }
}

function clean(v) {
  if (Array.isArray(v)) v = v.map((x) => String(x).trim()).filter(Boolean).join('; ');
  v = (v == null ? '' : String(v)).trim().slice(0, MAX_TEXT);
  // Stop answers such as "=1+1" or "- more leeks" being read as spreadsheet formulas:
  // a leading space makes Sheets keep them as plain text
  if (/^[=+\-@]/.test(v)) v = ' ' + v;
  return v;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
