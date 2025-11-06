// src/app/timesheet/calendar-view/calendar.component.spec.ts

import { ComponentFixture, TestBed, fakeAsync, tick, waitForAsync } from '@angular/core/testing';
import { CalendarComponent } from './calendar.component';
import { provideZonelessChangeDetection } from '@angular/core'; // Fixed: v20+ non-experimental
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FullCalendarModule } from '@fullcalendar/angular';
import { Router } from '@angular/router';
import { TimesheetService } from '../../core/services/timesheet.service';
import { AuthService } from '../../core/services/auth.service';
import { FinancialService } from '../../core/services/financial.service';
import { DayEntryDialogComponent } from './day-entry-dialog.component';
import { ChargeCodeSearchDialogComponent } from '../../timesheet/charge-code-search/charge-code-search.component';
import { TimesheetEntry, Timesheet } from '../../core/models/timesheet.model'; // Fixed: Import model
import { ChargeCode } from '../../core/models/financial.model';
import { of, BehaviorSubject } from 'rxjs';
import { parseISO } from 'date-fns';

describe('CalendarComponent', () => {
  let component: CalendarComponent;
  let fixture: ComponentFixture<CalendarComponent>;
  let timesheetServiceMock: jasmine.SpyObj<TimesheetService>;
  let authServiceMock: jasmine.SpyObj<AuthService>;
  let financialServiceMock: jasmine.SpyObj<FinancialService>;
  let dialogMock: jasmine.SpyObj<MatDialog>;
  let snackBarMock: jasmine.SpyObj<MatSnackBar>;
  let routerMock: jasmine.SpyObj<Router>;

  beforeEach(waitForAsync(() => {
    timesheetServiceMock = jasmine.createSpyObj('TimesheetService', ['ensureDraftTimesheet', 'getTimesheetWithEntries', 'addEntry', 'updateEntry', 'deleteEntry', 'updateTimesheet']);
    authServiceMock = jasmine.createSpyObj('AuthService', ['getCurrentUserSync', 'getCurrentUserId', 'getUserById']);
    financialServiceMock = jasmine.createSpyObj('FinancialService', ['listAccounts']);
    dialogMock = jasmine.createSpyObj('MatDialog', ['open']);
    snackBarMock = jasmine.createSpyObj('MatSnackBar', ['open']);
    routerMock = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [CalendarComponent, MatDialogModule, MatSnackBarModule, FullCalendarModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: TimesheetService, useValue: timesheetServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: FinancialService, useValue: financialServiceMock },
        { provide: MatDialog, useValue: dialogMock },
        { provide: MatSnackBar, useValue: snackBarMock },
        { provide: Router, useValue: routerMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CalendarComponent);
    component = fixture.componentInstance;

    // Mock defaults
    authServiceMock.getCurrentUserSync.and.returnValue({ email: 'test@example.com' });
    authServiceMock.getCurrentUserId.and.returnValue(Promise.resolve('user-id'));
    authServiceMock.getUserById.and.returnValue(Promise.resolve({ rate: 25 }));
    financialServiceMock.listAccounts.and.returnValue(Promise.resolve([{ chargeCodes: [{ name: 'CC-001' }] }]));
    timesheetServiceMock.ensureDraftTimesheet.and.returnValue(Promise.resolve({ id: 'ts-id', entries: [] } as Timesheet));
    timesheetServiceMock.getTimesheetWithEntries.and.returnValue(Promise.resolve({ entries: [] } as Timesheet & { entries: TimesheetEntry[] }));
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should set semi-monthly period correctly on init', fakeAsync(() => {
    component['today'] = parseISO('2025-11-05'); // Nov 5, 2025 -> 2025-11-01 to 2025-11-15
    component.ngOnInit();
    tick();
    expect(component.periodStart()).toBe('2025-11-01');
    expect(component.periodEnd()).toBe('2025-11-15');
  }));

  it('should handle select: create entry, open dialog, alert on cancel without charge code', fakeAsync(() => {
    const mockInfo = {
      startStr: '2025-11-03T09:00:00',
      endStr: '2025-11-03T17:00:00',
      start: new Date('2025-11-03T09:00:00'),
      end: new Date('2025-11-03T17:00:00'),
      view: { calendar: { unselect: jasmine.createSpy() } },
    };
    const mockEntry = { id: 'entry-1', chargeCode: ' ', hours: 8 } as TimesheetEntry;
    timesheetServiceMock.addEntry.and.returnValue(Promise.resolve(mockEntry));
    dialogMock.open.and.returnValue({
      afterClosed: () => of(undefined), // Simulate cancel
    });

    component.handleSelect(mockInfo);
    tick();
    expect(timesheetServiceMock.addEntry).toHaveBeenCalled();
    expect(dialogMock.open).toHaveBeenCalledWith(DayEntryDialogComponent, jasmine.any(Object));
    expect(snackBarMock.open).toHaveBeenCalledWith('Charge code is required. Click the entry to edit.', 'Close', jasmine.any(Object));
  }));

  it('should validate two-week entries: no exceed if <=40 per week, total 80 ok', fakeAsync(() => {
    const week1Entries = Array(5).fill({ date: '2025-11-03', hours: 8, chargeCode: 'CC-001' }); // 40h week1
    const week2Entries = Array(5).fill({ date: '2025-11-10', hours: 8, chargeCode: 'CC-001' }); // 40h week2
    component.events.set([...week1Entries, ...week2Entries] as TimesheetEntry[]);
    component['validate']();
    expect(component.validationMessage()).toBe(''); // No errors
  }));

  it('should validate two-week entries: exceed if >40 in one week', fakeAsync(() => {
    const exceedEntries = Array(6).fill({ date: '2025-11-03', hours: 8, chargeCode: 'CC-001' }); // 48h week1
    component.events.set(exceedEntries as TimesheetEntry[]);
    component['validate']();
    expect(component.validationMessage()).toContain('Weekly hours exceed 40h');
  }));

  it('should submit timesheet with full period totals', fakeAsync(() => {
    component.events.set(Array(10).fill({ hours: 8, chargeCode: 'CC-001' } as TimesheetEntry)); // 80h
    component.periodStart.set('2025-11-01');
    component.periodEnd.set('2025-11-15');
    component.currentTimesheetId.set('ts-id');
    authServiceMock.getCurrentUserId.and.returnValue(Promise.resolve('user-id'));
    timesheetServiceMock.updateTimesheet.and.returnValue(Promise.resolve({}));

    component.submitTimesheet();
    tick();
    expect(timesheetServiceMock.updateTimesheet).toHaveBeenCalledWith(jasmine.objectContaining({
      totalHours: 80,
      startDate: '2025-11-01',
      endDate: '2025-11-15',
    }));
    expect(routerMock.navigate).toHaveBeenCalledWith(['/review', 'ts-id']);
  }));
});