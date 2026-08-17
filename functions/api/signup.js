// Cloudflare Pages Function: handles sign-up form submissions.
// Sends a notification to info@vegbox.org.uk and a confirmation to the new member.
// Requires environment variable RESEND_API_KEY (set in Cloudflare dashboard:
// Workers & Pages -> your project -> Settings -> Environment variables).

const ORG_EMAIL = 'info@vegbox.org.uk';
const FROM = 'Kentish Town Vegbox <hello@vegbox.org.uk>'; // domain must be verified in Resend
const GOCARDLESS_URL = 'https://pay.gocardless.com/AL00005C9AHEN2';

export async function onRequestPost(context) {
  try {
    const form = await context.request.formData();

    // Honeypot: real people never fill this hidden field
    if (form.get('website')) {
      return json({ ok: true }); // silently accept bot submissions
    }

    const data = {
      name: clean(form.get('name')),
      email: clean(form.get('email')),
      phone: clean(form.get('phone')),
      address: clean(form.get('address')),
      bag: clean(form.get('bag')),
      collection: clean(form.get('collection')),
      lowincome: form.get('lowincome') ? 'Yes' : 'No',
      holiday: form.get('holiday') ? 'Yes' : 'No',
      hear: clean(form.get('hear')),
      hearother: clean(form.get('hearother')),
      notes: clean(form.get('notes')),
    };

    if (!data.name || !data.email || !data.bag) {
      return json({ ok: false, error: 'Please fill in your name, email and bag choice.' }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return json({ ok: false, error: 'That email address does not look right.' }, 400);
    }

    const apiKey = context.env.RESEND_API_KEY;
    if (!apiKey) {
      return json({ ok: false, error: 'Email service is not configured yet.' }, 500);
    }

    // 1) Notification to the co-op
    const orgBody = [
      'New Vegbox sign-up from the website:',
      '',
      `Name:               ${data.name}`,
      `Email:              ${data.email}`,
      `Mobile:             ${data.phone || '-'}`,
      `Address / postcode: ${data.address || '-'}`,
      `Bag:                ${data.bag}`,
      `Collection point:   ${data.collection || 'Not chosen yet'}`,
      `Low-income rate:    ${data.lowincome}`,
      `Holiday policy:     ${data.holiday === 'Yes' ? 'Accepted' : 'NOT accepted'}`,
      `Heard about us via: ${data.hear ? (data.hear === 'Other' && data.hearother ? `Other – ${data.hearother}` : data.hear) : '-'}`,
      '',
      'Notes:',
      data.notes || '-',
    ].join('\n');

    // 2) Confirmation to the new member
    const memberBody = [
      `Hi ${data.name.split(' ')[0]},`,
      '',
      'We are excited to have you join our community-run veg box co-operative.',
      '',
      'To complete your registration, please set up your Direct Debit via GoCardless so we can start packing your weekly veg bag:',
      '',
      `  ${GOCARDLESS_URL}`,
      '',
      'Once your Direct Debit is set up, we will send you a welcome email with all the collection details.',
      '',
      'Please double-check the details you entered:',
      `  Name:              ${data.name}`,
      `  Email:             ${data.email}`,
      `  Mobile:            ${data.phone || '-'}`,
      `  Address:           ${data.address || '-'}`,
      `  Bag:               ${data.bag}`,
      `  Collection point:  ${data.collection || 'Not chosen yet'}`,
      `  Holiday policy:    ${data.holiday === 'Yes' ? 'Accepted' : '-'}`,
      '',
      'If anything is wrong, or you have any questions, please email us at info@vegbox.org.uk or call 07815 771 939.',
      '',
      'We are looking forward to sharing fresh, seasonal UK-grown produce with you, connecting you to local farmers, and welcoming you to our community.',
      '',
      'Warm regards,',
      'The Kentish Town Vegbox Board',
      'A not-for-profit community co-operative, est. 2012',
    ].join('\n');

    const send = (payload) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

    const [orgRes, memberRes] = await Promise.all([
      send({
        from: FROM,
        to: [ORG_EMAIL],
        reply_to: data.email,
        subject: `New sign-up: ${data.name} (${data.bag})`,
        text: orgBody,
      }),
      send({
        from: FROM,
        to: [data.email],
        reply_to: ORG_EMAIL,
        subject: 'Thank you for signing up with Kentish Town Vegbox!',
        text: memberBody,
      }),
    ]);

    if (!orgRes.ok) {
      const err = await orgRes.text();
      console.log('Resend error (org):', err);
      return json({ ok: false, error: 'Sorry, something went wrong sending your sign-up. Please email us directly at info@vegbox.org.uk.' }, 502);
    }
    if (!memberRes.ok) {
      console.log('Resend error (member):', await memberRes.text());
      // Org email went through, so the sign-up is captured; do not fail the whole request.
    }

    return json({ ok: true });
  } catch (e) {
    console.log('Signup error:', e);
    return json({ ok: false, error: 'Sorry, something went wrong. Please email us at info@vegbox.org.uk.' }, 500);
  }
}

function clean(v) {
  return (v || '').toString().trim().slice(0, 2000);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
