import { IsString, MinLength } from "class-validator";

export class AutoConfigureCloudflareDto {
  @IsString()
  @MinLength(10)
  apiToken!: string;
}
