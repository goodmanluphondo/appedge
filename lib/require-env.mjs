export function requireEnv(name, value) {
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is not set. Copy .env.example to .env.local and provide its value.`);
  }

  return value;
}
