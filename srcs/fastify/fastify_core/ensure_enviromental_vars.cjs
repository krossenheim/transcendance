const requiredEnvVars = [
  'TR_NETWORK_SUBNET',
  'FASTIFY_PORT',
  'FASTIFY_BIND_TO',
];

for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    throw new Error(`Environment variable ${varName} is not defined!`);
  }
}