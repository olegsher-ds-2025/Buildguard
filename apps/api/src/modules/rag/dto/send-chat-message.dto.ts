import { IsString, MinLength } from "class-validator";

export class SendChatMessageDto {
  @IsString()
  @MinLength(1)
  content!: string;
}
