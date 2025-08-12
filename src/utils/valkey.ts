import { GlideClient } from "@valkey/valkey-glide";

if (process.env.VALKEY_HOSTS == undefined) throw new Error("VALKEY_HOSTS is not defined in environment variables");
if (process.env.VALKEY_USE_TLS == undefined) throw new Error("VALKEY_USE_TLS is not defined in environment variables");

const addresses = process.env.VALKEY_HOSTS.split(",").map((host) => {
    const [ip, port] = host.split(":");

    if (ip == null || port == null) 
        throw new Error(`Invalid VALKEY_HOSTS entry (No IP or port found): ${host}`);
    
    return { host: ip, port: parseInt(port) };
});

export let client: GlideClient;

(async () => {
    try {
        client = await GlideClient.createClient({
            addresses: addresses,
            useTLS: process.env.VALKEY_USE_TLS === "true",
            clientName: "openmonitor",
        });
        console.log('Valkey client connected successfully');
    } catch (error) {
        console.error('Failed to connect to Valkey:', error);
        process.exit(1);
    }
})();