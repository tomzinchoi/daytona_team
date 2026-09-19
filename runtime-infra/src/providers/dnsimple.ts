import type { Config } from '../config.js';
import type { ProviderReport } from '../contracts.js';
import { RuntimeFailure, type NetworkProvider, type PromotionRequest } from './provider.js';

export class DnsimpleProvider implements NetworkProvider {
  constructor(private readonly config: Config, private readonly request: typeof fetch = fetch) {}
  getCapabilities(): ProviderReport['capabilities'] { return { benchmark: false, promotion: false, environment: this.config.DNSIMPLE_ENVIRONMENT, integration: 'identity-check-only' }; }
  async getStatus(): Promise<ProviderReport> {
    const report = (status: ProviderReport['status'], reason: string): ProviderReport => ({ id: 'dnsimple', kind: 'network', status, reason, capabilities: this.getCapabilities() });
    if (!this.config.DNSIMPLE_TOKEN || !this.config.DNSIMPLE_ACCOUNT_ID) return report('NOT_CONFIGURED', 'DNSIMPLE_TOKEN and DNSIMPLE_ACCOUNT_ID are not configured.');
    if (this.config.DNSIMPLE_ENVIRONMENT !== 'sandbox') return report('ERROR', 'Production DNS is disabled in this MVP. Use the DNSimple sandbox.');
    try {
      const response = await this.request('https://api.sandbox.dnsimple.com/v2/whoami', { headers: { Authorization: `Bearer ${this.config.DNSIMPLE_TOKEN}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!response.ok) return report('ERROR', 'DNSimple sandbox identity check failed.');
      const body = await response.json() as { data?: { account?: { id?: number } } };
      if (String(body.data?.account?.id) !== this.config.DNSIMPLE_ACCOUNT_ID) return report('ERROR', 'Use an account token matching DNSIMPLE_ACCOUNT_ID.');
      return report('LIVE', 'DNSimple sandbox account verified; production promotion is not implemented.');
    } catch { return report('ERROR', 'DNSimple sandbox identity check could not be completed.'); }
  }
  async promote(_request: PromotionRequest): Promise<never> {
    throw new RuntimeFailure('PROMOTION_NOT_IMPLEMENTED', 'Promotion requires a deployed endpoint and an explicit DNS record change. This adapter does not write DNS.');
  }
}
