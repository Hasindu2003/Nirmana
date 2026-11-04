const VERCEL_TOKEN = process.env.VERCEL_TOKEN || process.argv[2];
if (!VERCEL_TOKEN) {
  console.error('Please provide VERCEL_TOKEN via environment variable or argument.');
  process.exit(1);
}
const PROJECT_ID = 'prj_q073xyZrvlezMQ4piiROeyUsBfaW';
const TEAM_ID = 'team_BmcXvGZbCkXthxRo9tBDtYC7';

const envVars = [
  {
    key: 'DATABASE_URL',
    value: 'postgresql://neondb_owner:npg_rq9d6tZjMcwb@ep-dry-hall-aonqkkse-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
    type: 'encrypted',
    target: ['production', 'preview', 'development'],
  },
  {
    key: 'DATABASE_URL_UNPOOLED',
    value: 'postgresql://neondb_owner:npg_rq9d6tZjMcwb@ep-dry-hall-aonqkkse.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
    type: 'encrypted',
    target: ['production', 'preview', 'development'],
  },
  {
    key: 'DB_DIALECT',
    value: 'postgres',
    type: 'plain',
    target: ['production', 'preview', 'development'],
  },
  {
    key: 'NODE_ENV',
    value: 'production',
    type: 'plain',
    target: ['production', 'preview', 'development'],
  },
  {
    key: 'JWT_SECRET',
    value: 'nirmana_jwt_signing_token_secret_key_2024',
    type: 'encrypted',
    target: ['production', 'preview', 'development'],
  },
  {
    key: 'SESSION_SECRET',
    value: 'nirmana_super_secure_session_secret_key_2024',
    type: 'encrypted',
    target: ['production', 'preview', 'development'],
  },
  {
    key: 'NEON_BRANCH',
    value: 'production',
    type: 'plain',
    target: ['production', 'preview', 'development'],
  },
  {
    key: 'AWS_ACCESS_KEY_ID',
    value: 'nak_live_db1f0eaeb3014f1d8952689759d15a32',
    type: 'encrypted',
    target: ['production', 'preview', 'development'],
  },
  {
    key: 'AWS_SECRET_ACCESS_KEY',
    value: 'nsk_live_bc1fe15ba456e22d8b764160b35af8aa30a0377c85ae7a4f113d916096d71ec8',
    type: 'encrypted',
    target: ['production', 'preview', 'development'],
  },
  {
    key: 'AWS_ENDPOINT_URL_S3',
    value: 'https://br-plain-king-ao4swsb5.storage.c-2.ap-southeast-1.aws.neon.tech',
    type: 'plain',
    target: ['production', 'preview', 'development'],
  },
  {
    key: 'AWS_REGION',
    value: 'ap-southeast-1',
    type: 'plain',
    target: ['production', 'preview', 'development'],
  },
  {
    key: 'NEON_AUTH_BASE_URL',
    value: 'https://ep-dry-hall-aonqkkse.neonauth.c-2.ap-southeast-1.aws.neon.tech/neondb/auth',
    type: 'plain',
    target: ['production', 'preview', 'development'],
  },
  {
    key: 'NEON_AUTH_JWKS_URL',
    value: 'https://ep-dry-hall-aonqkkse.neonauth.c-2.ap-southeast-1.aws.neon.tech/neondb/auth/.well-known/jwks.json',
    type: 'plain',
    target: ['production', 'preview', 'development'],
  },
  {
    key: 'NEON_FUNCTION_HELLO_BASE_URL',
    value: 'https://br-plain-king-ao4swsb5-hello.compute.c-2.ap-southeast-1.aws.neon.tech',
    type: 'plain',
    target: ['production', 'preview', 'development'],
  },
  {
    key: 'NEON_REALTIME_URL',
    value: 'wss://ep-dry-hall-aonqkkse.rt.c-2.ap-southeast-1.aws.neon.tech/',
    type: 'plain',
    target: ['production', 'preview', 'development'],
  },
  {
    key: 'NEON_REALTIME_SECRET',
    value: 'nrt_live_1UIiTJEx1anZ_Qw8RKG2Xo2GddfBPAe1BLIW29FNKCvs',
    type: 'encrypted',
    target: ['production', 'preview', 'development'],
  },
];

async function addEnvVars() {
  console.log('--- 1. Fetching existing env vars on Vercel ---');
  const getUrl = `https://api.vercel.com/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`;
  const getRes = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  const getData = await getRes.json();
  const existingMap = new Map();
  if (getData.envs) {
    getData.envs.forEach(e => existingMap.set(e.key, e.id));
  }
  console.log(`Found ${existingMap.size} existing env vars on Vercel.`);

  console.log('\n--- 2. Setting / Updating all 16 environment variables ---');
  for (const env of envVars) {
    if (existingMap.has(env.key)) {
      const envId = existingMap.get(env.key);
      const editUrl = `https://api.vercel.com/v9/projects/${PROJECT_ID}/env/${envId}?teamId=${TEAM_ID}`;
      const editRes = await fetch(editUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          value: env.value,
          target: env.target,
        }),
      });
      const editData = await editRes.json();
      console.log(`✓ Updated existing: ${env.key}`);
    } else {
      const postUrl = `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`;
      const postRes = await fetch(postUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(env),
      });
      const postData = await postRes.json();
      if (postRes.ok) {
        console.log(`✓ Added new: ${env.key}`);
      } else {
        console.error(`✗ Error adding ${env.key}:`, postData);
      }
    }
  }

  console.log('\n--- 3. Triggering Redeployment on Vercel ---');
  const deployUrl = `https://api.vercel.com/v13/deployments?teamId=${TEAM_ID}`;
  const deployBody = {
    name: 'nirmana_printing',
    project: PROJECT_ID,
    target: 'production',
    gitSource: {
      type: 'github',
      repo: 'Nirmana',
      ref: 'main',
      sha: '8645d746e40b027eab7d3d7c8f24232e9eb34541',
      repoId: 1434338343,
    },
  };

  const deployRes = await fetch(deployUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(deployBody),
  });

  const deployData = await deployRes.json();
  console.log('\n--- 4. Deployment Triggered! ---');
  console.log('Deployment ID:', deployData.id);
  console.log('Status:       ', deployData.readyState || deployData.status);
  console.log('Deployment URL: https://' + deployData.url);
  console.log('Primary Domain: https://nirmanaprinting-eta.vercel.app');
}

addEnvVars().catch(console.error);
