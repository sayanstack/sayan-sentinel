const API_BASE_URL = "https://api.hackerone.com/v1";
const MAX_SCOPE_PAGES = 40;
const PAGE_SIZE = 100;

export class HackerOneApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HackerOneApiError";
  }
}

export interface HackerOneProgramSummary {
  handle: string;
  name: string;
  submissionState: string | null;
  offersBounties: boolean;
}

export interface HackerOneStructuredScope {
  id: string;
  assetType: string;
  assetIdentifier: string;
  eligibleForSubmission: boolean;
  eligibleForBounty: boolean;
  instruction: string | null;
  maxSeverity: string | null;
}

interface JsonApiResource<TAttributes> {
  id: string;
  type: string;
  attributes: TAttributes;
}

interface JsonApiCollection<TAttributes> {
  data: JsonApiResource<TAttributes>[];
  links?: { next?: string };
}

interface ProgramAttributes {
  handle: string;
  name: string;
  submission_state?: string;
  offers_bounties?: boolean;
}

interface StructuredScopeAttributes {
  asset_type: string;
  asset_identifier: string;
  eligible_for_submission: boolean;
  eligible_for_bounty: boolean;
  instruction: string | null;
  max_severity: string | null;
}

/**
 * Thin wrapper around HackerOne's Hacker API (https://api.hackerone.com/v1).
 * Auth is HTTP Basic using the API token *identifier* as the username and
 * the token *value* as the password — HackerOne's own docs describe it
 * exactly that way (not the account's login username/password). The exact
 * `asset_type` enum values below were sourced from HackerOne's public
 * documentation, not confirmed against a live account with a real token —
 * `parseScopeAsset` treats anything it doesn't recognize as "not
 * auto-scannable" rather than guessing, and callers surface unrecognized
 * types back to the user instead of silently mis-mapping them.
 */
export class HackerOneClient {
  constructor(
    private readonly apiTokenIdentifier: string,
    private readonly apiTokenValue: string,
  ) {}

  private authHeader(): string {
    const credentials = Buffer.from(`${this.apiTokenIdentifier}:${this.apiTokenValue}`).toString(
      "base64",
    );
    return `Basic ${credentials}`;
  }

  private async request<TAttributes>(path: string): Promise<JsonApiCollection<TAttributes>> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: this.authHeader(), Accept: "application/json" },
    });
    if (!response.ok) {
      throw new HackerOneApiError(
        response.status,
        `HackerOne API request to ${path} failed with status ${response.status}`,
      );
    }
    return (await response.json()) as JsonApiCollection<TAttributes>;
  }

  /** Also serves as the credential-verification call — an invalid token fails this with 401. */
  async listPrograms(): Promise<HackerOneProgramSummary[]> {
    const page = await this.request<ProgramAttributes>(`/hackers/programs?page[size]=${PAGE_SIZE}`);
    return page.data.map((resource) => ({
      handle: resource.attributes.handle,
      name: resource.attributes.name,
      submissionState: resource.attributes.submission_state ?? null,
      offersBounties: resource.attributes.offers_bounties ?? false,
    }));
  }

  /** Pages through every structured scope entry for a program — capped at MAX_SCOPE_PAGES * PAGE_SIZE entries so a pagination bug can never turn into an infinite loop against a real account. */
  async getStructuredScopes(programHandle: string): Promise<HackerOneStructuredScope[]> {
    const scopes: HackerOneStructuredScope[] = [];
    let pageNumber = 1;

    while (pageNumber <= MAX_SCOPE_PAGES) {
      const page = await this.request<StructuredScopeAttributes>(
        `/hackers/programs/${encodeURIComponent(programHandle)}/structured_scopes?page[number]=${pageNumber}&page[size]=${PAGE_SIZE}`,
      );
      for (const resource of page.data) {
        scopes.push({
          id: resource.id,
          assetType: resource.attributes.asset_type,
          assetIdentifier: resource.attributes.asset_identifier,
          eligibleForSubmission: resource.attributes.eligible_for_submission,
          eligibleForBounty: resource.attributes.eligible_for_bounty,
          instruction: resource.attributes.instruction,
          maxSeverity: resource.attributes.max_severity,
        });
      }
      if (page.data.length < PAGE_SIZE) break;
      pageNumber += 1;
    }

    return scopes;
  }
}
