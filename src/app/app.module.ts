import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AnalysisComponent } from './analysis/analysis.component';
import { CalendarHeatmapComponent } from './analysis/calendar-heatmap/calendar-heatmap.component';
import { TrendChartComponent } from './analysis/trend-chart/trend-chart.component';
import { HealthTrendChartComponent } from './analysis/health-trend-chart/health-trend-chart.component';
import { FitnessChartComponent } from './analysis/fitness-chart/fitness-chart.component';
import { VolumeChartComponent } from './analysis/volume-chart/volume-chart.component';
import { CumulativeChartComponent } from './analysis/cumulative-chart/cumulative-chart.component';
import { HeatmapComponent } from './heatmap/heatmap.component';
import { NavComponent } from './nav/nav.component';
import { TrainingLogComponent } from './training-log/training-log.component';
import { RecordsComponent } from './records/records.component';
import {
  provideHttpClient,
  withInterceptorsFromDi
} from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { registerLocaleData } from '@angular/common';
import { LOCALE_ID } from '@angular/core';
import localeEnGb from '@angular/common/locales/en-GB';
import { FormsModule } from '@angular/forms';

registerLocaleData(localeEnGb, 'en-GB');

@NgModule({
  declarations: [
    AppComponent,
    AnalysisComponent,
    CalendarHeatmapComponent,
    TrendChartComponent,
    HealthTrendChartComponent,
    FitnessChartComponent,
    VolumeChartComponent,
    CumulativeChartComponent,
    HeatmapComponent,
    NavComponent,
    TrainingLogComponent,
    RecordsComponent
  ],
  bootstrap: [AppComponent],
  imports: [
    BrowserModule,
    CommonModule,
    BrowserAnimationsModule,
    FormsModule,
    AppRoutingModule
  ],
  providers: [
    DatePipe,
    { provide: LOCALE_ID, useValue: 'en-GB' },
    DecimalPipe,
    provideHttpClient(withInterceptorsFromDi())
  ]
})
export class AppModule {}
