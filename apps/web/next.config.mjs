/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // livekit-server-sdk is Node-only; keep it out of any client bundle.
  serverExternalPackages: ["livekit-server-sdk"],
};

export default nextConfig;
