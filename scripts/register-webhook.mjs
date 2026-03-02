const CLIENT_ID = process.env.RINGCENTRAL_CLIENT_ID;
const CLIENT_SECRET = process.env.RINGCENTRAL_CLIENT_SECRET;
const JWT_TOKEN = process.env.RINGCENTRAL_JWT;

const tokenRes = await fetch('https://platform.ringcentral.com/restapi/oauth/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
  },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: JWT_TOKEN
  })
});
const { access_token } = await tokenRes.json();

const res = await fetch('https://platform.ringcentral.com/restapi/v1.0/subscription', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    eventFilters: [
      '/restapi/v1.0/account/~/extension/~/message-store/instant?type=SMS'
    ],
    deliveryMode: {
      transportType: 'WebHook',
      address: 'https://your-nextjs-domain.com/api/messages/webhook'
    },
    expiresIn: 630720000
  })
});

const data = await res.json();
console.log('Full response:', JSON.stringify(data, null, 2));