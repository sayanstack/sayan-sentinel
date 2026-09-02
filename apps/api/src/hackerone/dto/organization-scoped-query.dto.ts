import { IsString } from "class-validator";

export class OrganizationScopedQueryDto {
  @IsString()
  organizationId!: string;
}
