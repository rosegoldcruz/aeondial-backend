const BACKEND_URL = process.env.BACKEND_URL;
const ORG_ID = process.env.ORG_ID || 'test-org';
const CAMPAIGN_ID = process.env.CAMPAIGN_ID || 'test-campaign';
const AGENT_ID = process.env.AGENT_ID || 'ai-worker-test';

if (!BACKEND_URL) {
  throw new Error('BACKEND_URL is required (example: http://localhost:4000)');
}

const headers = {
  'Content-Type': 'application/json',
  'x-org-id': ORG_ID,
  'x-role': 'agent',
  'x-user-id': AGENT_ID,
};

async function run() {
  const initialGet = await fetch(
    `${BACKEND_URL}/ai/settings?org_id=${encodeURIComponent(ORG_ID)}&campaign_id=${encodeURIComponent(CAMPAIGN_ID)}`,
    { headers },
  );
  const initialGetBody = await initialGet.json();
  console.log('GET #1 status:', initialGet.status);
  console.log('GET #1 body:', initialGetBody);

  const post = await fetch(`${BACKEND_URL}/ai/events`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      org_id: ORG_ID,
      campaign_id: CAMPAIGN_ID,
      agent_id: AGENT_ID,
      type: 'summary',
      payload: {
        summary: 'Phase 4 test event',
      },
    }),
  });
  const postBody = await post.json();
  console.log('POST status:', post.status);
  console.log('POST body:', postBody);

  const confirmGet = await fetch(
    `${BACKEND_URL}/ai/settings?org_id=${encodeURIComponent(ORG_ID)}&campaign_id=${encodeURIComponent(CAMPAIGN_ID)}`,
    { headers },
  );
  const confirmGetBody = await confirmGet.json();
  console.log('GET #2 status:', confirmGet.status);
  console.log('GET #2 body:', confirmGetBody);
}

run().catch((error) => {
  console.error('test:ai failed:', error);
  process.exit(1);
});
