// Cloudflare Pages Function: handles Board of Directors nominations from /nominate.
// Emails each nomination to the Board Co-Chair via Resend.
// Uses the same RESEND_API_KEY environment variable as /api/signup.

const TO = 'margaret.kelly.mullen@gmail.com';
const FROM = 'Kentish Town Vegbox <hello@vegbox.org.uk>'; // domain must be verified in Resend
const SUBJECT = 'Vegbox Board of Directors application';
// Nominations close at the end of Sunday 29 November 2026 (London time = UTC in November).
const CLOSES = Date.parse('2026-11-30T00:00:00Z');

export async function onRequestPost(context) {
  try {
    if (Date.now() >= CLOSES) {
      return json({ ok: false, error: 'Sorry, nominations for the 2026 AGM have now closed.' }, 403);
    }

    const form = await context.request.formData();

    // Honeypot: real people never fill this hidden field
    if (form.get('website')) return json({ ok: true });

    const data = {
      name: clean(form.get('name'), 200),
      email: clean(form.get('email'), 200),
      phone: clean(form.get('phone'), 50),
      date: clean(form.get('date'), 20),
      statement: clean(form.get('statement'), 6000),
      commit: form.get('commit') ? 'Yes' : 'No',
    };

    if (!data.name || !data.email || !data.date || !data.statement) {
      return json({ ok: false, error: 'Please fill in your name, email, date and reasons for standing.' }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return json({ ok: false, error: 'That email address does not look right.' }, 400);
    }
    if (data.commit !== 'Yes') {
      return json({ ok: false, error: 'Please tick the box to confirm you understand the commitment.' }, 400);
    }

    const apiKey = context.env.RESEND_API_KEY;
    if (!apiKey) {
      return json({ ok: false, error: 'Sorry, the form is not working at the moment. Please call Maggie on 07984 972 257.' }, 500);
    }

    const body = [
      'New Board of Directors nomination from the website (AGM 30 November 2026):',
      '',
      `Name:   ${data.name}`,
      `Email:  ${data.email}`,
      `Phone:  ${data.phone || '-'}`,
      `Date:   ${formatDate(data.date)}`,
      `Accepts 80% meeting attendance commitment: ${data.commit}`,
      '',
      'Reasons for standing, and experience/skills:',
      '',
      data.statement,
    ].join('\n');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [TO], reply_to: data.email, subject: SUBJECT, text: body }),
    });

    if (!res.ok) {
      console.log('Resend error (nominate):', await res.text());
      return json({ ok: false, error: 'Sorry, something went wrong sending your nomination. Please try again, or call Maggie on 07984 972 257.' }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    console.log('Nominate error:', e);
    return json({ ok: false, error: 'Sorry, something went wrong. Please try again, or call Maggie on 07984 972 257.' }, 500);
  }
}

// "2026-11-18" -> "18 November 2026"
function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1] || ''} ${m[1]}`;
}

function clean(v, max = 2000) {
  return (v || '').toString().trim().slice(0, max);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
