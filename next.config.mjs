const isProd=process.env.NODE_ENV==="production";

const csp=[
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.neon.tech",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  ...(isProd?["upgrade-insecure-requests"]:[])
].join("; ");

const securityHeaders=[
  {key:"Content-Security-Policy",value:csp},
  {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
  {key:"X-Content-Type-Options",value:"nosniff"},
  {key:"X-Frame-Options",value:"DENY"},
  {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()"},
  {key:"Cross-Origin-Opener-Policy",value:"same-origin"},
  {key:"Cross-Origin-Resource-Policy",value:"same-origin"},
  ...(isProd?[{key:"Strict-Transport-Security",value:"max-age=31536000; includeSubDomains"}]:[])
];

const nextConfig={
  poweredByHeader:false,
  async headers(){
    return [{
      source:"/(.*)",
      headers:securityHeaders
    }];
  }
};

export default nextConfig;
