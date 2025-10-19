// src/app/app.routes.ts

import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './core/services/auth.service';

const authGuard = () => {
  const authService = inject(AuthService);
  return () => firstValueFrom(authService.getCurrentUser()).then(user => user ? true : '/auth');
};

const managerGuard = () => {
  const authService = inject(AuthService);
  return () => firstValueFrom(authService.getUserGroups()).then(groups => {
    return groups.includes('Manager') || groups.includes('Admin') ? true : '/calendar';
  });
};

export const routes: Routes = [
  { path: '', redirectTo: '/start', pathMatch: 'full' },
  { path: 'auth', loadComponent: () => import('./core/auth/auth.component').then(m => m.AuthComponent) },
  { path: 'start', loadComponent: () => import('./start-page/start-page.component').then(m => m.StartPageComponent), canActivate: [authGuard] },
  { path: 'calendar', loadComponent: () => import('./timesheet/calendar-view/calendar.component').then(m => m.CalendarComponent), canActivate: [authGuard] },
  { path: 'review', loadComponent: () => import('./timesheet/review-list/review-list.component').then(m => m.ReviewListComponent), canActivate: [authGuard, managerGuard] },
  { path: 'accounts/list', loadComponent: () => import('./financial/account-list/account-list.component').then(m => m.AccountListComponent), canActivate: [authGuard, managerGuard] },
  { path: 'accounts/edit/:id', loadComponent: () => import('./financial/financial-account.component').then(m => m.FinancialAccountComponent), canActivate: [authGuard, managerGuard] },
  { path: 'accounts/ledger', loadComponent: () => import('./financial/ledger-view/ledger-view.component').then(m => m.LedgerViewComponent), canActivate: [authGuard, managerGuard] },
  { path: 'accounts/ledger/:id', loadComponent: () => import('./financial/ledger-view/ledger-view.component').then(m => m.LedgerViewComponent), canActivate: [authGuard, managerGuard] },
  { path: '**', redirectTo: '/start' },
];