import { IsString, MinLength } from "class-validator";

export class ConnectHackerOneDto {
  @IsString()
  organizationId!: string;

  @IsString()
  @MinLength(1)
  apiTokenIdentifier!: string;

  @IsString()
  @MinLength(1)
  apiTokenValue!: string;
}
