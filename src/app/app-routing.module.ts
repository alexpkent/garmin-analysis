import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AnalysisComponent } from './analysis/analysis.component';
import { HeatmapComponent } from './heatmap/heatmap.component';
import { TrainingLogComponent } from './training-log/training-log.component';

const routes: Routes = [
  { path: '', component: AnalysisComponent },
  { path: 'heatmap', component: HeatmapComponent },
  { path: 'log', component: TrainingLogComponent },
  { path: 'analysis', redirectTo: '', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
