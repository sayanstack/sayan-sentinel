import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

/**
 * `OWNERSHIP_CONFIRMATION` exists as a schema value (a future manually-
 * confirmed path, e.g. for a repository the organization already owns via
 * an installed GitHub App) but has no verification primitive implemented
 * yet — restricting the DTO to the two methods that actually work keeps
 * the API from accepting a request it can't honor.
 */
const SUPPORTED_VERIFICATION_METHODS = ["DNS_TXT", "HTTP_WELL_KNOWN"] as const;

export class CreateTargetDto {
  @IsIn(["http", "https"])
  scheme!: "http" | "https";

  @IsString()
  @MaxLength(253)
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedPathPrefixes?: string[];

  @IsIn(SUPPORTED_VERIFICATION_METHODS)
  verificationMethod!: (typeof SUPPORTED_VERIFICATION_METHODS)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;

  /** Capped at 1 — only Tier 0 (passive probe) and Tier 1 (Nuclei scan) validation capabilities exist. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  maxTier?: number;

  @IsOptional()
  @IsString()
  repositoryId?: string;
}
