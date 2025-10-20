// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

const http = require('http');

const hosts = [{
  id: 'host-1',
  address: '0x4594F755F593B517Bb3194F4DeC20C48a3f04504',
  url: 'ws://localhost:8080',
  models: ['gpt-3.5', 'gpt-4'],
  pricePerToken: '1000000000',
  available: true
}];

http.createServer((req, res) => {
  console.log('Request:', req.url);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.url === '/hosts' || req.url === '/api/hosts') {
    res.end(JSON.stringify({ hosts }));
  } else {
    res.end(JSON.stringify({ hosts }));
  }
}).listen(3003, () => {
  console.log('Discovery server on port 3003');
});
