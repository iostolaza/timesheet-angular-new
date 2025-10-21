

// file: src/app/core/services/financial.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { FinancialService } from './financial.service';
import { AuthService } from './auth.service';
import { of } from 'rxjs';

describe('FinancialService', () => {
  let service: FinancialService;
  let authServiceMock: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    authServiceMock = jasmine.createSpyObj('AuthService', [
      'getCurrentUser',
      'createGroup',
      'getUserGroups',
    ]);
    authServiceMock.getCurrentUser.and.returnValue(
      of({ id: 'test-user', email: 'test@test.com', name: 'Test User', role: 'Admin', rate: 100 })
    );
    authServiceMock.createGroup.and.returnValue(Promise.resolve());
    authServiceMock.getUserGroups.and.returnValue(of(['Admin']));

    TestBed.configureTestingModule({
      providers: [
        FinancialService,
        { provide: AuthService, useValue: authServiceMock },
      ],
    });
    service = TestBed.inject(FinancialService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should generate account number from id', () => {
    const accountNumber = (service as any).generateAccountNumber('test-id-123');
    expect(accountNumber).toBeDefined();
    expect(accountNumber.length).toBe(16);
    expect(typeof accountNumber).toBe('string');
  });

  it('should generate charge code with correct format', () => {
    const chargeCode = (service as any).generateChargeCode('Test Account', '1234567890123456');
    expect(chargeCode).toMatch(/^[A-Z]{2}-\d{3}-\d{2}$/);
  });
});