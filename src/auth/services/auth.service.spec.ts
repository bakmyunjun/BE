import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException, ConflictException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { PrismaService } from "../../database/prisma.service";
import { LoginDto, RegisterDto } from "../dto/auth.dto";

describe("AuthService", () => {
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
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === "JWT_ACCESS_SECRET") return "test-access-secret";
      if (key === "JWT_REFRESH_SECRET") return "test-refresh-secret";
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

  describe("login", () => {
    it("사용자를 찾을 수 없으면 UnauthorizedException을 던져야 함", async () => {
      const loginDto: LoginDto = {
        email: "test@example.com",
        password: "password123",
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it("EMAIL provider가 아니면 UnauthorizedException을 던져야 함", async () => {
      const loginDto: LoginDto = {
        email: "test@example.com",
        password: "password123",
      };

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: "user123",
        email: "test@example.com",
        provider: "GITHUB",
      });

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe("register", () => {
    it("이미 존재하는 이메일이면 ConflictException을 던져야 함", async () => {
      const registerDto: RegisterDto = {
        email: "existing@example.com",
        password: "password123",
      };

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: "user123",
        email: "existing@example.com",
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe("refresh", () => {
    it("유효하지 않은 토큰이면 UnauthorizedException을 던져야 함", async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error("Invalid token");
      });

      await expect(service.refresh("invalid-token")).rejects.toThrow(
        UnauthorizedException
      );
    });
  });
});
