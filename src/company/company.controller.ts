import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CompanyService } from './company.service.js';
import {
  UpdateCompanyProfileDto,
  UpsertCompanyProfileDto,
} from './company.dto.js';
import { auditContext } from '../common/audit-context.js';
import { UserRole } from '../users/user.entity.js';
import { Roles } from '../auth/decorators/auth.decorators.js';

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
Roles(UserRole.ADMIN, UserRole.HR)
@Controller('company-profile')
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get()
  get() {
    return this.company.get();
  }

  @Put()
  upsert(@Body() dto: UpsertCompanyProfileDto, @Req() req: any) {
    return this.company.upsert(dto, auditContext(req));
  }

  @Patch()
  update(@Body() dto: UpdateCompanyProfileDto, @Req() req: any) {
    return this.company.update(dto, auditContext(req));
  }

  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req: any, file: any, cb: any) =>
        LOGO_TYPES.includes(file.mimetype)
          ? cb(null, true)
          : cb(
              new BadRequestException('Use a PNG, JPG, WEBP or SVG image'),
              false,
            ),
    }),
  )
  uploadLogo(@UploadedFile() file: any, @Req() req: any) {
    return this.company.uploadLogo(file, auditContext(req));
  }

  @Delete('logo')
  removeLogo(@Req() req: any) {
    return this.company.removeLogo(auditContext(req));
  }
}
