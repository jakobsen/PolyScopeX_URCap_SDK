import { DoBootstrap, Injector, NgModule } from '@angular/core';
import { MatComponent } from './components/mat/mat.component';
import { UIAngularComponentsModule } from '@universal-robots/ui-angular-components';
import { BrowserModule } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { HttpBackend, HttpClientModule } from '@angular/common/http';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { MultiTranslateHttpLoader } from 'ngx-translate-multi-http-loader';
import { PATH } from '../generated/contribution-constants';
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";

import { MatButtonModule } from "@angular/material/button"
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

export const httpLoaderFactory = (http: HttpBackend) =>
    new MultiTranslateHttpLoader(http, [
        { prefix: PATH + '/assets/i18n/', suffix: '.json' },
        { prefix: './ui/assets/i18n/', suffix: '.json' },
    ]);

@NgModule({
    declarations: [
        MatComponent
    ],
    imports: [
        MatButtonModule,
        BrowserModule,
        BrowserAnimationsModule,
        UIAngularComponentsModule,
        HttpClientModule,
        TranslateModule.forRoot({
            loader: { provide: TranslateLoader, useFactory: httpLoaderFactory, deps: [HttpBackend] },
            useDefaultLang: false,
        })
    ],
    providers: [provideAnimationsAsync()],
})

export class AppModule implements DoBootstrap {
    constructor(private injector: Injector) {
    }

    ngDoBootstrap() {
        const matComponent = createCustomElement(MatComponent, { injector: this.injector });
        customElements.define('mat-mat-mat', matComponent);
    }

    // This function is never called, because we don't want to actually use the workers, just tell webpack about them
    registerWorkersWithWebPack() {
        new Worker(new URL('./components/mat/mat.behavior.worker.ts'
            /* webpackChunkName: "mat.worker" */, import.meta.url), {
            name: 'mat',
            type: 'module'
        });
    }
}

