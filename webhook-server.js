const http = require('http');
const { URL } = require('url');
const { bookAppointment } = require('./booking-script');

const PORT = process.env.PORT || 3000;

function sendJson(res, statusCode, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function validateBookingPayload(body) {
  const errors = [];

  if (!body) {
    errors.push('Missing request body');
    return errors;
  }

  // New flat schema:
  // {
  //   date: '02-02-2026',
  //   time: '02:00 PM',
  //   email: 'user@example.com',
  //   phone: '+15199804247',
  //   service: 'Curly Cut',
  //   employee: 'First Available',
  //   firstName: 'John',
  //   lastName: 'Doe'
  // }

  if (!body.date) errors.push('Missing field: date');
  if (!body.time) errors.push('Missing field: time');
  if (!body.email) errors.push('Missing field: email');
  if (!body.phone) errors.push('Missing field: phone');
  if (!body.service) errors.push('Missing field: service');
  if (!body.employee) errors.push('Missing field: employee');
  if (!body.firstName) errors.push('Missing field: firstName');
  if (!body.lastName) errors.push('Missing field: lastName');

  return errors;
}

function normalizeDateToDdMmYyyy(dateStr) {
  // Expecting incoming like '02-02-2026' or '02/02/2026'; convert to '02/02/2026'.
  if (typeof dateStr !== 'string') return dateStr;
  const cleaned = dateStr.replace(/\./g, '-').replace(/\//g, '-');
  const parts = cleaned.split('-');
  if (parts.length !== 3) return dateStr;
  const [d, m, y] = parts;
  if (!d || !m || !y) return dateStr;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

function normalizePhone(phone) {
  if (typeof phone !== 'string') return phone;
  // Strip non-digits; the site previously accepted a plain 10-digit string.
  const digits = phone.replace(/\D/g, '');
  return digits || phone;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Simple health check
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }

  if (req.method !== 'POST' || url.pathname !== '/webhook/booking') {
    return sendJson(res, 404, { error: 'Not found' });
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk.toString('utf8');
    // Basic protection against very large payloads
    if (body.length > 1_000_000) {
      req.destroy();
    }
  });

  req.on('end', async () => {
    let parsed;
    try {
      parsed = body ? JSON.parse(body) : null;
    } catch (err) {
      return sendJson(res, 400, { error: 'Invalid JSON', details: err.message });
    }

    const errors = validateBookingPayload(parsed);
    if (errors.length > 0) {
      return sendJson(res, 400, { error: 'Invalid payload', details: errors });
    }

    // Map incoming flat JSON to the booking config overrides expected by booking-script.js
    const normalizedDate = normalizeDateToDdMmYyyy(parsed.date);
    const normalizedPhone = normalizePhone(parsed.phone);

    const configOverrides = {
      date: normalizedDate,
      timePreference: 'Any time',
      service: parsed.service,
      employee: parsed.employee || 'First Available',
      specificTime: parsed.time || null, // Pass the specific time to select (e.g., "02:00 PM")
      timeSlotIndex: 0, // Fallback if specific time not found
      customerInfo: {
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        email: parsed.email,
        phone: normalizedPhone,
        notes: ''
      },
      // Allow overriding headless/slowMo through payload or env
      headless: typeof parsed.headless === 'boolean' ? parsed.headless : process.env.HEADLESS === 'true',
      slowMo: parsed.slowMo != null ? parsed.slowMo : Number(process.env.SLOW_MO || 300),
    };

    console.log('Incoming booking request:', JSON.stringify(parsed, null, 2));

    try {
      await bookAppointment(configOverrides);
      return sendJson(res, 200, { status: 'success' });
    } catch (err) {
      console.error('Booking automation failed:', err);
      return sendJson(res, 200, {
        status: 'failed',
        message: 'Booking automation failed',
        details: err.message
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
  console.log('POST booking requests to /webhook/booking with JSON body');
});
