import http from 'http';

http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
  res.end(JSON.stringify({
    hosts: [{
      id: 'test-host',
      address: '0x4594F755F593B517Bb3194F4DeC20C48a3f04504',
      url: 'ws://localhost:8080',
      models: ['gpt-3.5', 'gpt-4'],
      pricePerToken: '1000000000',
      available: true
    }]
  }));
}).listen(3001, () => console.log('Mock discovery on :3001'));