// src/app/app.config.ts

import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';
import { Amplify } from 'aws-amplify';
import outputs from '../../amplify_outputs.json' assert { type: 'json' };
import { CalendarUtils } from 'angular-calendar';  

Amplify.configure(outputs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(),
    { provide: CalendarUtils, useClass: CalendarUtils },  
  ],
};