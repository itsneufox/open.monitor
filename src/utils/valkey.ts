import { GlideClient } from '@valkey/valkey-glide';

if (!process.env.VALKEY_HOSTS) {
  throw new Error('VALKEY_HOSTS is not defined in environment variables');
}
if (!process.env.VALKEY_USE_TLS) {
  throw new Error('VALKEY_USE_TLS is not defined in environment variables');
}

const addresses = process.env.VALKEY_HOSTS.split(',').map(host => {
  const [ip, port] = host.split(':');

  if (!ip || !port) {
    throw new Error(`Invalid VALKEY_HOSTS entry: ${host}`);
  }

  return { host: ip, port: parseInt(port) };
});

export let client: GlideClient;

export const valkeyReady = (async () => {
  try {
    client = await GlideClient.createClient({
      addresses: addresses,
      useTLS: process.env.VALKEY_USE_TLS === 'true',
      clientName: 'openmonitor',
    });

    await client.ping();
    console.log('Valkey client connected successfully');
    return client;
  } catch (error) {
    console.error('Failed to connect to Valkey:', error);
    throw error;
  }
})();
