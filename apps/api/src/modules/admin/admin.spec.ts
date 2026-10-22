import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { UsersService } from '../users/users.service';
import { RefreshTokenRepository } from '../auth/refresh-token.repository';
import { AuditLogRepository } from './audit-log.repository';

describe('AdminService', () => {
  let service: AdminService;
  let usersService: Partial<UsersService>;
  let refreshTokenRepository: Partial<RefreshTokenRepository>;
  let auditLogRepository: Partial<AuditLogRepository>;

  const adminId = 'admin-1';
  const userId = 'user-1';

  const mockPendingUser = {
    id: userId,
    email: 'user@example.com',
    role: 'USER',
    status: 'PENDING',
  };

  const mockActiveUser = {
    id: userId,
    email: 'user@example.com',
    role: 'USER',
    status: 'ACTIVE',
  };

  const mockRejectedUser = {
    id: userId,
    email: 'user@example.com',
    role: 'USER',
    status: 'REJECTED',
  };

  const mockSuspendedUser = {
    id: userId,
    email: 'user@example.com',
    role: 'USER',
    status: 'SUSPENDED',
  };

  beforeEach(async () => {
    usersService = {
      getUserById: jest.fn(),
      updateUser: jest.fn(),
      getAllUsers: jest.fn(),
    };

    refreshTokenRepository = {
      revokeAllForUser: jest.fn(),
    };

    auditLogRepository = {
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: UsersService, useValue: usersService },
        { provide: RefreshTokenRepository, useValue: refreshTokenRepository },
        { provide: AuditLogRepository, useValue: auditLogRepository },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe('approveUser', () => {
    it('should approve user with PENDING status', async () => {
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockPendingUser);
      (usersService.updateUser as jest.Mock).mockResolvedValue({
        ...mockPendingUser,
        status: 'ACTIVE',
      });

      await service.approveUser(adminId, userId);

      expect(usersService.updateUser).toHaveBeenCalledWith(userId, {
        status: 'ACTIVE',
        approvedAt: expect.any(Date),
        approvedBy: { connect: { id: adminId } },
      });
      expect(auditLogRepository.create).toHaveBeenCalledWith(adminId, userId, 'APPROVE');
    });

    it('should reject approval of non-PENDING user', async () => {
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockActiveUser);

      await expect(service.approveUser(adminId, userId)).rejects.toThrow(
        'Hanya user dengan status PENDING yang bisa di-approve',
      );
    });

    it('should prevent admin from approving own account', async () => {
      await expect(service.approveUser(adminId, adminId)).rejects.toThrow(
        'Tidak bisa approve akun sendiri',
      );
    });

    it('should not expose passwordHash in approve response', async () => {
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockPendingUser);
      (usersService.updateUser as jest.Mock).mockResolvedValue({
        ...mockPendingUser,
        status: 'ACTIVE',
      });

      const result = await service.approveUser(adminId, userId);

      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('rejectUser', () => {
    it('should reject user with PENDING status and revoke tokens', async () => {
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockPendingUser);
      (usersService.updateUser as jest.Mock).mockResolvedValue({
        ...mockPendingUser,
        status: 'REJECTED',
      });

      await service.rejectUser(adminId, userId);

      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(userId);
      expect(usersService.updateUser).toHaveBeenCalledWith(userId, {
        status: 'REJECTED',
      });
      expect(auditLogRepository.create).toHaveBeenCalledWith(adminId, userId, 'REJECT');
    });

    it('should reject rejection of non-PENDING user', async () => {
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockActiveUser);

      await expect(service.rejectUser(adminId, userId)).rejects.toThrow(
        'Hanya user dengan status PENDING yang bisa di-reject',
      );
    });

    it('should prevent admin from rejecting own account', async () => {
      await expect(service.rejectUser(adminId, adminId)).rejects.toThrow(
        'Tidak bisa reject akun sendiri',
      );
    });

    it('should not expose passwordHash in reject response', async () => {
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockPendingUser);
      (usersService.updateUser as jest.Mock).mockResolvedValue({
        ...mockPendingUser,
        status: 'REJECTED',
      });

      const result = await service.rejectUser(adminId, userId);

      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('suspendUser', () => {
    it('should suspend user with ACTIVE status and revoke tokens', async () => {
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockActiveUser);
      (usersService.updateUser as jest.Mock).mockResolvedValue({
        ...mockActiveUser,
        status: 'SUSPENDED',
      });

      await service.suspendUser(adminId, userId);

      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(userId);
      expect(usersService.updateUser).toHaveBeenCalledWith(userId, {
        status: 'SUSPENDED',
      });
      expect(auditLogRepository.create).toHaveBeenCalledWith(adminId, userId, 'SUSPEND');
    });

    it('should reject suspension of non-ACTIVE user', async () => {
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockPendingUser);

      await expect(service.suspendUser(adminId, userId)).rejects.toThrow(
        'Hanya user dengan status ACTIVE yang bisa di-suspend',
      );
    });

    it('should prevent admin from suspending own account', async () => {
      await expect(service.suspendUser(adminId, adminId)).rejects.toThrow(
        'Tidak bisa suspend akun sendiri',
      );
    });

    it('should not expose passwordHash in suspend response', async () => {
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockActiveUser);
      (usersService.updateUser as jest.Mock).mockResolvedValue({
        ...mockActiveUser,
        status: 'SUSPENDED',
      });

      const result = await service.suspendUser(adminId, userId);

      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('reactivateUser', () => {
    it('should reactivate user with SUSPENDED status', async () => {
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockSuspendedUser);
      (usersService.updateUser as jest.Mock).mockResolvedValue({
        ...mockSuspendedUser,
        status: 'ACTIVE',
      });

      await service.reactivateUser(adminId, userId);

      expect(usersService.updateUser).toHaveBeenCalledWith(userId, {
        status: 'ACTIVE',
      });
      expect(auditLogRepository.create).toHaveBeenCalledWith(adminId, userId, 'REACTIVATE');
    });

    it('should reactivate user with REJECTED status', async () => {
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockRejectedUser);
      (usersService.updateUser as jest.Mock).mockResolvedValue({
        ...mockRejectedUser,
        status: 'ACTIVE',
      });

      await service.reactivateUser(adminId, userId);

      expect(usersService.updateUser).toHaveBeenCalledWith(userId, {
        status: 'ACTIVE',
      });
      expect(auditLogRepository.create).toHaveBeenCalledWith(adminId, userId, 'REACTIVATE');
    });

    it('should reject reactivation of PENDING or ACTIVE user', async () => {
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockPendingUser);

      await expect(service.reactivateUser(adminId, userId)).rejects.toThrow(
        'Hanya user dengan status SUSPENDED atau REJECTED yang bisa di-reactivate',
      );
    });

    it('should prevent admin from reactivating own account', async () => {
      await expect(service.reactivateUser(adminId, adminId)).rejects.toThrow(
        'Tidak bisa reactivate akun sendiri',
      );
    });

    it('should not expose passwordHash in reactivate response', async () => {
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockSuspendedUser);
      (usersService.updateUser as jest.Mock).mockResolvedValue({
        ...mockSuspendedUser,
        status: 'ACTIVE',
      });

      const result = await service.reactivateUser(adminId, userId);

      expect(result).not.toHaveProperty('passwordHash');
    });
  });

  describe('getStats', () => {
    it('should return user count by status', async () => {
      (usersService.getAllUsers as jest.Mock).mockResolvedValue([
        mockPendingUser,
        mockActiveUser,
        mockSuspendedUser,
      ]);

      const stats = await service.getStats();

      expect(stats).toEqual({
        PENDING: 1,
        ACTIVE: 1,
        REJECTED: 0,
        SUSPENDED: 1,
      });
    });
  });
});
