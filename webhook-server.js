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

  if (!body.date) errors.push('Missing field: date');
  if (!body.timePreference) errors.push('Missing field: timePreference');
  if (!body.service) errors.push('Missing field: service');
  if (!body.employee) errors.push('Missing field: employee');

  if (!body.customerInfo) {
    errors.push('Missing field: customerInfo');
  } else {
    const { firstName, lastName, email, phone } = body.customerInfo;
    if (!firstName) errors.push('Missing customerInfo.firstName');
    if (!lastName) errors.push('Missing customerInfo.lastName');
    if (!email) errors.push('Missing customerInfo.email');
    if (!phone) errors.push('Missing customerInfo.phone');
  }

  return errors;
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

    // Map incoming JSON to the booking config overrides
    const configOverrides = {
      date: parsed.date,
      timePreference: parsed.timePreference,
      service: parsed.service,
      employee: parsed.employee,
      timeSlotIndex: typeof parsed.timeSlotIndex === 'number' ? parsed.timeSlotIndex : undefined,
      customerInfo: parsed.customerInfo,
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
      return sendJson(res, 500, { status: 'error', message: 'Booking automation failed', details: err.message });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
  console.log('POST booking requests to /webhook/booking with JSON body');
});
