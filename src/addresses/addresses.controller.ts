import { Controller, Get, Post, Body, Patch, Param, Delete, Put, UseGuards, Query } from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('addresses')
export class AddressesController {
    constructor(private readonly addressesService: AddressesService) {}

    @Post()
    create(@CurrentUser() user: any, @Body() createAddressDto: CreateAddressDto) {
        return this.addressesService.create(user.id, createAddressDto);
    }

    @Get()
    findAll(@CurrentUser() user: any, @Query('includeDeleted') includeDeleted?: string) {
        const withDeleted = includeDeleted === 'true';
        return this.addressesService.findAll(user.id, withDeleted);
    }

    @Put(':id')
    update(
        @CurrentUser() user: any,
        @Param('id') id: string,
        @Body() updateAddressDto: UpdateAddressDto,
    ) {
        return this.addressesService.update(user.id, id, updateAddressDto);
    }

    @Patch(':id/set-default')
    setDefault(@CurrentUser() user: any, @Param('id') id: string) {
        return this.addressesService.setDefault(user.id, id);
    }

    @Delete(':id')
    remove(@CurrentUser() user: any, @Param('id') id: string) {
        return this.addressesService.remove(user.id, id);
    }
}
