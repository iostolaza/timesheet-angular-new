// file: src/app/core/services/financial.service.integration.spec.ts
import { TestBed } from '@angular/core/testing';
import { FinancialService } from './financial.service';
import { AuthService } from './auth.service';
import { CognitoGroupService } from './cognito-group.service';
import { Amplify } from 'aws-amplify';
import outputs from '../../../../amplify_outputs.json';
import { Account } from '../models/financial.model';

describe('FinancialService (integration)', () => {
  let service: FinancialService;
  let authService: AuthService;
  let cognitoGroupService: CognitoGroupService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FinancialService, AuthService, CognitoGroupService],
    });
    service = TestBed.inject(FinancialService);
    authService = TestBed.inject(AuthService);
    cognitoGroupService = TestBed.inject(CognitoGroupService);
    Amplify.configure(outputs);
    jest.spyOn(authService, 'isAdmin').mockResolvedValue(true);
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue({
      id: '0919b9ce-e071-7083-e9c8-e7e93bb2c09f',
      email: 'neo.carbon@gmail.com',
      name: 'Default User',
      role: 'Admin',
      rate: 25,
    });
    jest.spyOn(cognitoGroupService, 'createGroup').mockResolvedValue();
    jest.spyOn(cognitoGroupService, 'addUserToGroup').mockResolvedValue();
  });

  it('creates an account and charge code', async () => {
    const accountInput: Omit<Account, 'id' | 'accountNumber'> = {
      name: 'Test',
      balance: 100,
      startingBalance: 100,
      endingBalance: 100,
      details: null,
      date: '2025-10-20',
      type: 'Asset',
      chargeCodes: [],
    };
    jest.spyOn(service, 'updateAccount').mockResolvedValue({
      ...accountInput,
      id: 'a1',
      accountNumber: '1234567890123456',
    });
    jest.spyOn(service, 'getAccount').mockResolvedValue({
      ...accountInput,
      id: 'a1',
      accountNumber: '1234567890123456',
    });

    const account = await service.createAccount(accountInput);
    expect(account.accountNumber).toHaveLength(16);
    expect(account.name).toBe('Test');
    expect(account.balance).toBe(100);
    expect(account.startingBalance).toBe(100);
    expect(account.endingBalance).toBe(100);
    expect(account.details).toBeNull();
    expect(account.date).toBe('2025-10-20');
    expect(account.type).toBe('Asset');
    expect(account.chargeCodes).toEqual([]);

    const chargeCode = await service.createChargeCode(account);
    expect(chargeCode.name).toMatch(/^[A-Z]{2}-\d{3}-\d{3}$/);
    expect(cognitoGroupService.createGroup).toHaveBeenCalled();
    expect(cognitoGroupService.addUserToGroup).toHaveBeenCalledWith(
      'neo.carbon@gmail.com',
      expect.stringMatching(/^chargecode-[A-Z]{2}-\d{3}-\d{3}$/)
    );
  });

  it('creates an account with optional properties', async () => {
    const accountInput: Omit<Account, 'id' | 'accountNumber'> = {
      name: 'Test Optional',
      balance: 200,
      startingBalance: 200,
      endingBalance: 200,
      details: 'Test details',
      date: '2025-10-21',
      type: 'Revenue',
      chargeCodes: [
        {
          name: 'CC-123-456',
          cognitoGroup: 'chargecode-CC-123-456',
          createdBy: 'neo.carbon@gmail.com',
          date: '2025-10-21',
        },
      ],
    };
    jest.spyOn(service, 'updateAccount').mockResolvedValue({
      ...accountInput,
      id: 'a2',
      accountNumber: '9876543210987654',
    });
    jest.spyOn(service, 'getAccount').mockResolvedValue({
      ...accountInput,
      id: 'a2',
      accountNumber: '9876543210987654',
    });

    const account = await service.createAccount(accountInput);
    expect(account.accountNumber).toHaveLength(16);
    expect(account.name).toBe('Test Optional');
    expect(account.balance).toBe(200);
    expect(account.startingBalance).toBe(200);
    expect(account.endingBalance).toBe(200);
    expect(account.details).toBe('Test details');
    expect(account.date).toBe('2025-10-21');
    expect(account.type).toBe('Revenue');
    expect(account.chargeCodes).toEqual([
      {
        name: 'CC-123-456',
        cognitoGroup: 'chargecode-CC-123-456',
        createdBy: 'neo.carbon@gmail.com',
        date: '2025-10-21',
      },
    ]);

    const chargeCode = await service.createChargeCode(account);
    expect(chargeCode.name).toMatch(/^[A-Z]{2}-\d{3}-\d{3}$/);
    expect(service.updateAccount).toHaveBeenCalledWith(
      'a2',
      expect.objectContaining({
        name: 'Test Optional',
        details: 'Test details',
        balance: 200,
        endingBalance: 200,
        type: 'Revenue',
        chargeCodes: expect.arrayContaining([
          expect.objectContaining({ name: 'CC-123-456' }),
          expect.objectContaining({ name: expect.stringMatching(/^[A-Z]{2}-\d{3}-\d{3}$/) }),
        ]),
      })
    );
  });
});