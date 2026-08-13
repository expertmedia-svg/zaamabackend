import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminLoginDto, UpdateReportDto } from './admin.dto';
import { AdminGuard, type AdminRequest } from './admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('auth/login')
  login(@Body() dto: AdminLoginDto, @Req() request: Request) {
    return this.adminService.login(dto.email.toLowerCase(), dto.password, request.ip);
  }

  @UseGuards(AdminGuard)
  @Get('stats')
  stats() {
    return this.adminService.stats();
  }

  @UseGuards(AdminGuard)
  @Get('reports')
  reports() {
    return this.adminService.reports();
  }

  @UseGuards(AdminGuard)
  @Patch('reports/:id')
  updateReport(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: UpdateReportDto,
  ) {
    return this.adminService.updateReport(request.admin.id, id, dto.status, request.ip);
  }
}
