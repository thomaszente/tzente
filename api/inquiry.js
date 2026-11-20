// Sends the site's two contact forms by email, through Resend.
//
// Needs two environment variables in the Vercel project:
//   RESEND_API_KEY  the Resend API key (the same one the press kit uses works)
//   BOOKING_FROM    the sender address, e.g. "Thomas Zente <bookings@yourdomain.com>"
// Optional overrides for where messages go:
//   INQUIRY_TO        project inquiries   (default thomaszente@gmail.com)
//   ZENTI_BOOKING_TO  ZENTI bookings      (default zentimusic@gmail.com)
//
// If the variables are missing or sending fails, the page falls back to
// handing the visitor a ready-written email, so nothing is ever lost.

const TO = {
  project: process.env.INQUIRY_TO || 'thomaszente@gmail.com',
  zenti: process.env.ZENTI_BOOKING_TO || 'zentimusic@gmail.com'
};

const line = (v, max) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim().slice(0, max);
const block = (v, max) => String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, max);
const isEmail = s => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const key = process.env.RESEND_API_KEY;
  const from = process.env.BOOKING_FROM;
  if (!key || !from) return res.status(503).json({ ok: false, error: 'not_configured' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (_) { b = {}; } }
  b = b || {};

  // Hidden field that people never see; bots fill it in. Pretend success.
  if (line(b.website, 200)) return res.status(200).json({ ok: true });

  const kind = b.kind === 'zenti' ? 'zenti' : 'project';
  const name = line(b.name, 120);
  const email = line(b.email, 200);
  if (!name || !isEmail(email)) return res.status(400).json({ ok: false, error: 'invalid' });

  const fields = kind === 'zenti'
    ? [['Event or venue', b.event], ['Date', b.date], ['City', b.city]]
    : [['Company or venue', b.org], ['Project type', b.type], ['Timing', b.when]];
  const details = fields
    .map(([label, value]) => [label, line(value, 200)])
    .filter(([, value]) => value)
    .map(([label, value]) => label + ': ' + value);

  const type = line(b.type, 120);
  const subject = kind === 'zenti'
    ? 'ZENTI booking inquiry from ' + name
    : 'Project inquiry from ' + name + (type ? ' · ' + type : '');

  const text = [
    'From: ' + name + ' <' + email + '>',
    ...details,
    '',
    block(b.message, 5000) || '(No message)',
    '',
    'Sent from the contact form on tzente.vercel.app. Reply to this email to answer ' + name + ' directly.'
  ].join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [TO[kind]], reply_to: email, subject, text })
    });
    if (!r.ok) {
      console.error('Resend refused the message', r.status, await r.text());
      return res.status(502).json({ ok: false, error: 'send_failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Could not reach Resend', err);
    return res.status(502).json({ ok: false, error: 'send_failed' });
  }
};
