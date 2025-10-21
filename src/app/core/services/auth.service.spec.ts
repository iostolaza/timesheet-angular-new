// file: src/app/core/services/auth.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signIn } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import { of, throwError } from 'rxjs';
import outputs from '../../../../amplify_outputs.json';
import { User } from '../models/financial.model';

// Mock the global generateClient and fetchAuthSession to avoid window access
jest.mock('aws-amplify/data', () => ({
  generateClient: jest.fn(),
}));
jest.mock('aws-amplify/auth', () => ({
  fetchAuthSession: jest.fn(),
  signIn: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    spyOn(Amplify, 'configure').and.callThrough();
    spyOn(Amplify, 'getConfig').and.returnValue({
      Auth: { Cognito: { userPoolId: 'test-user-pool' } }
    });

    // Mock generateClient return value
    (generateClient as jest.Mock).mockReturnValue({
      models: {
        User: {
          get: () => ({ data: null, errors: [] }),
          create: () => ({ data: {}, errors: [] })
        }
      }
    });

    TestBed.configureTestingModule({
      providers: [AuthService],
    });
    service = TestBed.inject(AuthService);
  });

  it('should check Admin role', async () => {
    (fetchAuthSession as jest.Mock).mockResolvedValue({
      tokens: { idToken: { payload: { 'cognito:groups': ['Admin'] } } }
    });
    expect(await service.isAdmin()).toBe(true);
    expect(await service.isManager()).toBe(false);
  });

  it('should check Manager role', async () => {
    (fetchAuthSession as jest.Mock).mockResolvedValue({
      tokens: { idToken: { payload: { 'cognito:groups': ['Manager'] } } }
    });
    expect(await service.isAdmin()).toBe(false);
    expect(await service.isManager()).toBe(true);
  });

  it('should return empty groups on error', async () => {
    (fetchAuthSession as jest.Mock).mockRejectedValue(new Error('Session error'));
    expect(await service.getUserGroups()).toEqual([]);
  });

  it('should create user if not exists', async () => {
    (fetchAuthSession as jest.Mock).mockResolvedValue({
      tokens: { idToken: { payload: { 'sub': '123', 'email': 'test@test.com', 'cognito:groups': ['Admin'] } } }
    });
    const user: User = { id: '123', email: 'test@test.com', name: 'Default User', role: 'Admin' as 'Admin', rate: 25.0, groups: ['Admin'] };
    await service.createUserIfNotExists(user);
    expect(generateClient).toHaveBeenCalled();
  });
});