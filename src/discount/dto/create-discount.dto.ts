import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional, Min, IsBoolean, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountType, DiscountScopeType, TargetAudience, DiscountStatus } from '@prisma/client';

export class CreateDiscountDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(DiscountType)
  type: DiscountType;

  @IsEnum(DiscountScopeType)
  scope: DiscountScopeType;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  value: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minOrderValue?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxDiscountAmount?: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  usageLimit: number;

  @IsBoolean()
  @IsOptional()
  isPrivate?: boolean;

  @IsEnum(TargetAudience)
  @IsOptional()
  targetAudience?: TargetAudience;

  @IsString()
  @IsOptional()
  productId?: string; // UUID string if targeting product

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  categoryId?: number; // if targeting category
}
