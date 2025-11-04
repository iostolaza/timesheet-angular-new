
// src/app/app.routes.ts

import { Routes, CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './core/services/auth.service';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';

const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return firstValueFrom(auth.getCurrentUser()).then(user => 
    user ? true : router.createUrlTree(['/auth'])
  );
};

export const routes: Routes = [
  { path: '', redirectTo: '/start', pathMatch: 'full' },
  { path: 'auth', loadComponent: () => import('./core/auth/auth.component').then(m => m.AuthComponent) },
  { path: 'start', loadComponent: () => import('./start-page/start-page.component').then(m => m.StartPageComponent), canActivate: [authGuard] },
  { path: 'calendar', loadComponent: () => import('./timesheet/calendar-view/calendar.component').then(m => m.CalendarComponent), canActivate: [authGuard] },
  { path: 'review', loadComponent: () => import('./timesheet/review-list/review-list.component').then(m => m.ReviewListComponent), canActivate: [authGuard] },
  { path: 'accounts/manage', loadComponent: () => import('./financial/manage-accounts/manage-accounts.component').then(m => m.ManageAccountsComponent), canActivate: [authGuard] },
  { path: 'accounts/list', loadComponent: () => import('./financial/account-list/account-list.component').then(m => m.AccountListComponent), canActivate: [authGuard] },
  { path: 'accounts/ledger', loadComponent: () => import('./financial/ledger-view/ledger-view.component').then(m => m.LedgerViewComponent), canActivate: [authGuard] },
  { path: 'accounts/ledger/:id', loadComponent: () => import('./financial/ledger-view/ledger-view.component').then(m => m.LedgerViewComponent), canActivate: [authGuard] },
  { path: '**', redirectTo: '/start' },
];