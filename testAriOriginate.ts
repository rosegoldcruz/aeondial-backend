/// <reference types="node" />
import 'dotenv/config';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

const ORG_ID = process.env.TEST_ORG_ID || 'aeon-dev';
const AGENT_ID = process.env.TEST_AGENT_ID || 'agent-1000';
const CAMPAIGN_ID = process.env.TEST_CAMPAIGN_ID || 'camp-dev-1';
const CONTACT_ID = process.env.TEST_CONTACT_ID || 'contact-1000';
const TO_NUMBER = process.env.TEST_TO_NUMBER || '<YOUR_TEST_E164_NUMBER>';

async function run() {
  const url = `${BACKEND_URL}/telephony/calls/originate`;

  console.log('--- ARI Originate Test ---');
  console.log(`Backend : ${BACKEND_URL}`);
  console.log(`Endpoint: POST ${url}`);
  console.log(`org_id  : ${ORG_ID}`);
  console.log(`to      : ${TO_NUMBER}`);
  console.log('');

  const body = {
    org_id: ORG_ID,
    agent_id: AGENT_ID,
    campaign_id: CAMPAIGN_ID,
    contact_id: CONTACT_ID,
    to_number: TO_NUMBER,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-org-id': ORG_ID,
      'x-user-id': AGENT_ID,
      'x-role': 'agent',
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text();
  let responseJson: unknown;
  try {
    responseJson = JSON.parse(responseText);
  } catch {
    responseJson = responseText;
  }

  console.log(`Status  : ${res.status} ${res.statusText}`);
  console.log('Response:', JSON.stringify(responseJson, null, 2));
  console.log('');
  console.log(
    'If ARI is reachable, Asterisk should attempt an outbound call and a row should exist in calls.',
  );

  if (!res.ok) {
    process.exit(1);
  }
}

run().catch((err: unknown) => {
  console.error('test:ari failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
