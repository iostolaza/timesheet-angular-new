// file: src/app/core/services/financial.service.integration.spec.ts
import { TestBed } from '@angular/core/testing';
import { FinancialService } from './financial.service';
import { AuthService } from './auth.service';
import { of } from 'rxjs';

describe('FinancialService (integration)', () => {
  let service: FinancialService;

  const mockAuth = {
    getCurrentUser: jest.fn().mockReturnValue(of({ id: 'u1', username: 'admin' })),
    createGroup: jest.fn().mockResolvedValue(undefined),
    getUserGroups: jest.fn().mockReturnValue(of(['Admin'])),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FinancialService,
        { provide: AuthService, useValue: mockAuth },
      ],
    });
    service = TestBed.inject(FinancialService);
    jest.spyOn(service['client'].models['Account'], 'create').mockResolvedValue({
      data: {
        id: 'a1',
        accountNumber: '1234567890123456',
        name: 'Test',
        balance: 100,
        startingBalance: 100,
        date: '2025-10-20',
        type: 'Asset',
        chargeCodesJson: '[]',
      },
      errors: [],
    });
  });

  it('creates an account and charge code', async () => {
    const accountInput = {
      name: 'Test',
      balance: 100,
      startingBalance: 100,
      date: '2025-10-20',
      type: 'Asset' as const,
      chargeCodes: [],
    };
    const account = await service.createAccount(accountInput);
    expect(account.accountNumber).toHaveLength(16);
    expect(account.name).toBe('Test');
    expect(account.balance).toBe(100);
    expect(account.startingBalance).toBe(100);
    expect(account.date).toBe('2025-10-20');
    expect(account.type).toBe('Asset');
    expect(account.chargeCodes).toEqual([]);

    const chargeCode = await service.createChargeCode(account);
    expect(chargeCode.name).toMatch(/^[A-Z]{2}-\d{3}-\d{2}$/);
  });

  it('creates an account with optional properties', async () => {
    const accountInput = {
      name: 'Test Optional',
      balance: 200,
      startingBalance: 200,
      date: '2025-10-21',
      type: 'Revenue' as const,
      chargeCodes: [{ name: 'CC-123-45', cognitoGroup: 'chargecode-CC-123-45', createdBy: 'u1', date: '2025-10-21' }],
      details: 'Test details',
    };
    const account = await service.createAccount(accountInput);
    expect(account.accountNumber).toHaveLength(16);
    expect(account.name).toBe('Test Optional');
    expect(account.balance).toBe(200);
    expect(account.startingBalance).toBe(200);
    expect(account.date).toBe('2025-10-21');
    expect(account.type).toBe('Revenue');
    expect(account.chargeCodes).toEqual([{ name: 'CC-123-45', cognitoGroup: 'chargecode-CC-123-45', createdBy: 'u1', date: '2025-10-21' }]);
    expect(account.details).toBe('Test details');
  });
});