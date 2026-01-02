import http from 'http';

const steps = [
  { type: 'tap', description: 'Tap Test', coordinates: { x: 100, y: 200 } },
  { type: 'input', description: 'Type hello', value: 'hello world' },
];

const data = JSON.stringify({ steps });

const opts = {
  hostname: 'localhost',
  port: 3001,
  path: '/recording/replay',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
};

const req = http.request(opts, (res) => {
  let body = '';
  res.on('data', (d) => body += d);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log(body);
  });
});

req.on('error', (e) => console.error('Request error', e));
req.write(data);
req.end();
