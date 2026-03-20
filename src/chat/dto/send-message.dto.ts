import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { MessageType } from '@prisma/client';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsEnum(MessageType)
  @IsOptional()
  type?: MessageType = MessageType.TEXT;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;

  @IsString()
  @IsOptional()
  referencedProductId?: string;

  @IsString()
  @IsOptional()
  referencedOrderId?: string;
}
