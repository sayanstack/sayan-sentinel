/**
 * Where to send a user to actually add a DNS record for each provider
 * `detectProvider` (apps/api) can recognize. None of these support a
 * true OAuth "authorize and come back" redirect for an arbitrary
 * third-party app like Sentinel — Cloudflare, GoDaddy, Namecheap, etc.
 * only offer that to approved platform partners, not via their public
 * developer APIs — so the honest equivalent is a direct link to the
 * right dashboard, not a silent auto-redirect. Cloudflare is the one
 * exception with a real "skip the dashboard entirely" path: see
 * `autoConfigureCloudflare` in `@/lib/api`.
 */
export const PROVIDER_DASHBOARD_URLS: Record<string, string> = {
  Cloudflare: "https://dash.cloudflare.com/",
  "AWS Route 53": "https://console.aws.amazon.com/route53/v2/hostedzones",
  GoDaddy: "https://dcc.godaddy.com/manage/dns",
  Namecheap: "https://ap.www.namecheap.com/domains/list/",
  "Google Domains": "https://domains.google.com/registrar",
  DNSimple: "https://dnsimple.com/domains",
  DigitalOcean: "https://cloud.digitalocean.com/networking/domains",
  "Name.com": "https://www.name.com/account/domain",
  "Oracle Dyn": "https://cp.dyn.com/",
  UltraDNS: "https://portal.ultradns.com/",
  Porkbun: "https://porkbun.com/account/domainsSpeedy",
  Bluehost: "https://my.bluehost.com/hosting/dns",
  HostGator: "https://portal.hostgator.com/",
  Vercel: "https://vercel.com/dashboard/domains",
  Netlify: "https://app.netlify.com/",
  "GitHub Pages": "https://github.com/settings/pages",
  "Cloudflare Pages": "https://dash.cloudflare.com/",
  Heroku: "https://dashboard.heroku.com/apps",
  Shopify: "https://admin.shopify.com/",
  Render: "https://dashboard.render.com/",
  Railway: "https://railway.app/dashboard",
  "Fly.io": "https://fly.io/dashboard",
  "Microsoft Azure": "https://portal.azure.com/",
  Wix: "https://www.wix.com/my-account/domains",
  Squarespace: "https://account.squarespace.com/domains",
  Webflow: "https://webflow.com/dashboard",
  AWS: "https://console.aws.amazon.com/",
};

export function providerDashboardUrl(providerName: string | null): string | null {
  if (!providerName) return null;
  return PROVIDER_DASHBOARD_URLS[providerName] ?? null;
}
