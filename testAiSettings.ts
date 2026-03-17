const BACKEND_URL = process.env.BACKEND_URL;

if (!BACKEND_URL) {
  throw new Error('BACKEND_URL is required (example: http://localhost:4000)');
}

const TENANT_ID = 'test-tenant';

async function run() {
  const initialGet = await fetch(
    `${BACKEND_URL}/settings/ai?tenantId=${encodeURIComponent(TENANT_ID)}`,
  );
  const initialGetBody = await initialGet.json();
  console.log('GET #1 status:', initialGet.status);
  console.log('GET #1 body:', initialGetBody);

  const post = await fetch(`${BACKEND_URL}/settings/ai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      llm_provider: 'openai',
      tts_provider: 'elevenlabs',
      stt_provider: 'openai',
    }),
  });
  const postBody = await post.json();
  console.log('POST status:', post.status);
  console.log('POST body:', postBody);

  const confirmGet = await fetch(
    `${BACKEND_URL}/settings/ai?tenantId=${encodeURIComponent(TENANT_ID)}`,
  );
  const confirmGetBody = await confirmGet.json();
  console.log('GET #2 status:', confirmGet.status);
  console.log('GET #2 body:', confirmGetBody);
}

run().catch((error) => {
  console.error('test:ai failed:', error);
  process.exit(1);
});
