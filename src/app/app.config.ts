
// src/app/app.config.ts

import { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideZoneChangeDetection } from '@angular/core';
import { CalendarPageComponent } from './timesheet/calendar-page/calendar-page.component';
import { TimesheetFormDialogComponent } from './timesheet/timesheet-form/timesheet-form.component';
import { DocumentViewDialogComponent } from './timesheet/document-view/document-view.component';
import { ReviewFormComponent } from './timesheet/review-form/review-form.component';
import { ReviewPageComponent } from './timesheet/review-page/review-page.component';
import { StartPageComponent } from './timesheet/start-page/start-page.component';
import { AccountListComponent } from './financial/account-list/account-list.component';
import { LedgerViewComponent } from './financial/ledger-view/ledger-view.component';
import { AuthComponent } from './core/auth/auth.component';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      [
        { path: '', redirectTo: '/start', pathMatch: 'full' },
        { path: 'start', component: StartPageComponent },
        { path: 'calendar', component: CalendarPageComponent },
        { path: 'timesheet-form', component: TimesheetFormDialogComponent },
        { path: 'document-view', component: DocumentViewDialogComponent },
        { path: 'review-form', component: ReviewFormComponent },
        { path: 'review-page', component: ReviewPageComponent },
        { path: 'accounts', component: AccountListComponent },
        { path: 'ledger', component: LedgerViewComponent },
        { path: 'auth', component: AuthComponent }
      ],
      withComponentInputBinding()
    )
  ]
};