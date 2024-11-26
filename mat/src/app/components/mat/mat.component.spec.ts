import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MatComponent} from "./mat.component";
import {TranslateLoader, TranslateModule} from "@ngx-translate/core";
import {Observable, of} from "rxjs";

describe('MatComponent', () => {
  let fixture: ComponentFixture<MatComponent>;
  let component: MatComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [MatComponent],
      imports: [TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader, useValue: {
            getTranslation(): Observable<Record<string, string>> {
              return of({});
            }
          }
        }
      })],
    }).compileComponents();

    fixture = TestBed.createComponent(MatComponent);
    component = fixture.componentInstance;
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });
});
