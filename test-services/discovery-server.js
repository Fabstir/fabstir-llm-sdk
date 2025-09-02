import http from 'http';

const hosts = {
  hosts: [{
    id: 'host-1',
    address: '0x4594F755F593B517Bb3194F4DeC20C48a3f04504',
    url: 'ws://localhost:8080',
    models: ['gpt-3.5', 'gpt-4'],
    pricePerToken: '1000000000',
    available: true
  }, {
    id: 'host-2',
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb3',
    url: 'ws://localhost:8081',
    models: ['gpt-3.5'],
    pricePerToken: '500000000',
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