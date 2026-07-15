const http = require('http');
setTimeout(() => {
    const req = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/auth/signup',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
            console.log('--- RESPONSE RESULT ---');
            console.log('Status Code:', res.statusCode);
            console.log('Body Length:', data.length);
            console.log('Body Snippet:', data.substring(0, 1000));
            process.exit(0);
        });
    });
    req.on('error', (e) => {
        console.error('Request Error:', e);
        process.exit(1);
    });
    req.write(JSON.stringify({ email: 'tester123@tcnp.org', password: 'password123', full_name: 'Test User', role: 'delta_oscar', phone: '12345' }));
    req.end();
}, 6000);
