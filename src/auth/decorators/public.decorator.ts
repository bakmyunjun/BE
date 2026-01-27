import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const IS_DEV_PUBLIC_KEY = 'isDevPublic';
export const DevPublic = () => SetMetadata(IS_DEV_PUBLIC_KEY, true);
