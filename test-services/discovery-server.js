// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import http from 'http';

const hosts = {
  hosts: [{
    id: 'host-1',
    address: '0x4594F755F593B517Bb3194F4DeC20C48a3f04504',
    url: 'ws://localhost:8080',
    models: ['gpt-3.5', 'gpt-4'],
    pricePerToken: '10000000000000', // 10000 gwei per token for meaningful payments
    available: true
  }]
};

http.createServer((req, res) => {
  if (req.url === '/hosts' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(hosts));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(3003, () => console.log('Discovery server running on port 3003'));