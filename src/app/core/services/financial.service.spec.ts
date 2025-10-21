// file: src/app/core/services/financial.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { FinancialService } from './financial.service';
import { AuthService } from './auth.service';
import { of } from 'rxjs';

describe('FinancialService (unit)', () => {
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
  });

  it('generates a 16-digit account number', () => {
    const num = (service as any).generateAccountNumber('abc123-uuid');
    expect(typeof num).toBe('string');
    expect(num.length).toBe(16);
  });

  it('generates a charge code pattern', () => {
    const code = (service as any).generateChargeCode('Operations', '1234567890123456');
    expect(code).toMatch(/^[A-Z]{2}-\d{3}-\d{2}$/);
  });
});