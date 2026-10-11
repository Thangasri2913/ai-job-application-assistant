import { Module } from '@nestjs/common';
import { ProfileSectionsController } from './profile-sections.controller.js';
import { ProfileSectionsService } from './profile-sections.service.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';

@Module({
  controllers: [ProfileController, ProfileSectionsController],
  providers: [ProfileService, ProfileSectionsService],
  exports: [ProfileService],
})
export class ProfileModule {}
