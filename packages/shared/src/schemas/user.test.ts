import { describe, it, expect } from 'vitest';
import { CreateUserSchema, UserRoleEnum, UserStatusEnum } from './user';

describe('User Schemas', () => {
  describe('CreateUserSchema', () => {
    it('should validate correct email', () => {
      const result = CreateUserSchema.safeParse({
        email: 'user@example.com',
        password: 'ValidPass123!',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = CreateUserSchema.safeParse({
        email: 'invalid-email',
        password: 'ValidPass123!',
      });
      expect(result.success).toBe(false);
    });

    it('should enforce password strength rules', () => {
      // Missing uppercase
      expect(
        CreateUserSchema.safeParse({
          email: 'user@example.com',
          password: 'validpass123!',
        }).success
      ).toBe(false);

      // Missing number
      expect(
        CreateUserSchema.safeParse({
          email: 'user@example.com',
          password: 'ValidPass!',
        }).success
      ).toBe(false);

      // Too short
      expect(
        CreateUserSchema.safeParse({
          email: 'user@example.com',
          password: 'Short1!',
        }).success
      ).toBe(false);
    });

    it('should accept valid password with all requirements', () => {
      const result = CreateUserSchema.safeParse({
        email: 'user@example.com',
        password: 'ValidPassword123',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Enums', () => {
    it('should validate UserRoleEnum', () => {
      expect(UserRoleEnum.safeParse('ADMIN').success).toBe(true);
      expect(UserRoleEnum.safeParse('USER').success).toBe(true);
      expect(UserRoleEnum.safeParse('SUPERUSER').success).toBe(false);
    });

    it('should validate UserStatusEnum', () => {
      expect(UserStatusEnum.safeParse('ACTIVE').success).toBe(true);
      expect(UserStatusEnum.safeParse('PENDING').success).toBe(true);
      expect(UserStatusEnum.safeParse('INACTIVE').success).toBe(false);
    });
  });
});
