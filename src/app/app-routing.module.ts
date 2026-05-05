import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { HeatmapComponent } from './heatmap/heatmap.component';
import { TrainingLogComponent } from './training-log/training-log.component';

const routes: Routes = [
  { path: '', component: HeatmapComponent },
  { path: 'log', component: TrainingLogComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
