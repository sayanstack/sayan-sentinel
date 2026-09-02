import { IsString, MinLength } from "class-validator";

export class SyncHackerOneScopeDto {
  @IsString()
  organizationId!: string;

  @IsString()
  @MinLength(1)
  programHandle!: string;
}
