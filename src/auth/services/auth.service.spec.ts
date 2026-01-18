import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    oAuthAccount: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    oAuthState: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
      if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('refresh', () => {
    it('유효하지 않은 토큰이면 UnauthorizedException을 던져야 함', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refresh('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('findOrCreateOAuthUser', () => {
    const mockUserId = BigInt(1);
    const mockProviderId = '12345';
    const mockEmail = 'test@example.com';
    const mockNickname = 'testuser';

    beforeEach(() => {
      mockJwtService.signAsync.mockResolvedValue('mock-token');
    });

    it('기존 OAuth 계정이 있으면 사용자 정보를 업데이트해야 함', async () => {
      const mockUser = {
        id: mockUserId,
        email: mockEmail,
        nickname: mockNickname,
      };

      const mockOAuthAccount = {
        id: BigInt(1),
        userId: mockUserId,
        provider: 'GITHUB',
        providerUserId: mockProviderId,
        providerEmail: mockEmail,
        user: mockUser,
      };

      mockPrismaService.oAuthAccount.findUnique.mockResolvedValue(
        mockOAuthAccount,
      );
      mockPrismaService.user.update.mockResolvedValue(mockUser);
      mockPrismaService.oAuthAccount.update.mockResolvedValue(mockOAuthAccount);

      const result = await service.findOrCreateOAuthUser(
        'GITHUB',
        mockProviderId,
        mockEmail,
        mockNickname,
      );

      expect(result).toHaveProperty('user');
      expect(result.user).toHaveProperty('id');
      expect(result.user).toHaveProperty('email');
      expect(result.user).toHaveProperty('nickname');
      expect(mockPrismaService.oAuthAccount.findUnique).toHaveBeenCalledWith({
        where: {
          provider_providerUserId: {
            provider: 'GITHUB',
            providerUserId: mockProviderId,
          },
        },
        include: {
          user: true,
        },
      });
      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });

    it('OAuth 계정이 없고 이메일로 기존 사용자를 찾으면 OAuth 계정을 연결해야 함', async () => {
      const mockUser = {
        id: mockUserId,
        email: mockEmail,
        nickname: mockNickname,
      };

      mockPrismaService.oAuthAccount.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.oAuthAccount.upsert.mockResolvedValue({
        id: BigInt(1),
        userId: mockUserId,
        provider: 'GITHUB',
        providerUserId: mockProviderId,
        providerEmail: mockEmail,
        user: mockUser,
      });

      const result = await service.findOrCreateOAuthUser(
        'GITHUB',
        mockProviderId,
        mockEmail,
        mockNickname,
      );

      expect(result).toHaveProperty('user');
      expect(result.user).toHaveProperty('id');
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: mockEmail },
      });
      expect(mockPrismaService.oAuthAccount.upsert).toHaveBeenCalledWith({
        where: {
          provider_providerUserId: {
            provider: 'GITHUB',
            providerUserId: mockProviderId,
          },
        },
        update: {
          providerEmail: mockEmail,
        },
        create: {
          userId: mockUserId,
          provider: 'GITHUB',
          providerUserId: mockProviderId,
          providerEmail: mockEmail,
        },
        include: { user: true },
      });
    });

    it('OAuth 계정이 없고 새 사용자를 생성해야 함', async () => {
      const mockUser = {
        id: mockUserId,
        email: mockEmail,
        nickname: mockNickname,
      };

      mockPrismaService.oAuthAccount.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);

      const result = await service.findOrCreateOAuthUser(
        'GITHUB',
        mockProviderId,
        mockEmail,
        mockNickname,
      );

      expect(result).toHaveProperty('user');
      expect(result.user).toHaveProperty('id');
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: {
          email: mockEmail,
          nickname: mockNickname,
          oauthAccounts: {
            create: {
              provider: 'GITHUB',
              providerUserId: mockProviderId,
              providerEmail: mockEmail,
            },
          },
        },
      });
    });

    it('이메일이 없어도 사용자를 생성해야 함', async () => {
      const mockUser = {
        id: mockUserId,
        email: null,
        nickname: mockNickname,
      };

      mockPrismaService.oAuthAccount.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);

      const result = await service.findOrCreateOAuthUser(
        'KAKAO',
        mockProviderId,
        null,
        mockNickname,
      );

      expect(result).toHaveProperty('user');
      expect(result.user).toHaveProperty('id');
      expect(mockPrismaService.user.create).toHaveBeenCalled();
    });
  });

  describe('generateOAuthState', () => {
    it('State와 code_challenge를 생성해야 함', async () => {
      const mockStateRecord = {
        id: BigInt(1),
        state: 'mock-state',
        codeVerifier: 'mock-verifier',
        provider: 'GITHUB',
        redirectUri: null,
        expiresAt: new Date(),
        usedAt: null,
        createdAt: new Date(),
      };

      mockPrismaService.oAuthState.create.mockResolvedValue(mockStateRecord);

      const result = await service.generateOAuthState('GITHUB');

      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('codeChallenge');
      expect(result.state).toBeTruthy();
      expect(result.codeChallenge).toBe(''); // PKCE 제거됨
      expect(mockPrismaService.oAuthState.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          state: expect.any(String),
          provider: 'GITHUB',
          redirectUri: undefined,
          expiresAt: expect.any(Date),
        }),
      });
      expect(mockPrismaService.oAuthState.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            codeVerifier: expect.anything(),
          }),
        }),
      );
    });

    it('redirectUri와 함께 State를 생성해야 함', async () => {
      const redirectUri = 'http://localhost:3000/auth/callback';
      const mockStateRecord = {
        id: BigInt(1),
        state: 'mock-state',
        codeVerifier: 'mock-verifier',
        provider: 'GITHUB',
        redirectUri,
        expiresAt: new Date(),
        usedAt: null,
        createdAt: new Date(),
      };

      mockPrismaService.oAuthState.create.mockResolvedValue(mockStateRecord);

      const result = await service.generateOAuthState('GITHUB', redirectUri);

      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('codeChallenge');
      expect(result.codeChallenge).toBe(''); // PKCE 제거됨
      expect(mockPrismaService.oAuthState.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          state: expect.any(String),
          provider: 'GITHUB',
          redirectUri,
          expiresAt: expect.any(Date),
        }),
      });
    });
  });

  describe('getOAuthStateData', () => {
    it('State 데이터를 조회해야 함', async () => {
      const state = 'test-state';
      const mockStateData = {
        redirectUri: 'http://localhost:3000/auth/callback',
      };

      mockPrismaService.oAuthState.findUnique.mockResolvedValue(mockStateData);

      const result = await service.getOAuthStateData(state);

      expect(result).toEqual(mockStateData);
      expect(mockPrismaService.oAuthState.findUnique).toHaveBeenCalledWith({
        where: { state },
        select: { redirectUri: true },
      });
    });

    it('존재하지 않는 State는 null을 반환해야 함', async () => {
      const state = 'non-existent-state';

      mockPrismaService.oAuthState.findUnique.mockResolvedValue(null);

      const result = await service.getOAuthStateData(state);

      expect(result).toBeNull();
    });
  });
});
