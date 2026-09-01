import { IsString, MaxLength } from "class-validator";

export class QuickStartTargetDto {
  @IsString()
  @MaxLength(2048)
  host!: string;
}
