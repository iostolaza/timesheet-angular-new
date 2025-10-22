// file: src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';
import { Amplify } from 'aws-amplify';
import outputs from '../../amplify_outputs.json';
import { CalendarUtils } from 'angular-calendar';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

Amplify.configure(outputs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideAnimationsAsync(),
    provideHttpClient(),
    { provide: CalendarUtils, useClass: CalendarUtils },
    MatDialogModule,
    MatButtonModule,
    MatListModule,
    MatInputModule,
    MatIconModule,
  ],
};