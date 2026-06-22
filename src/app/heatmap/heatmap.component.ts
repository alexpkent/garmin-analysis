import { Component, OnDestroy, OnInit } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { ActivityService } from '../activity.service';
import { environment } from '../../environments/environment';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);
import { View } from '../types/View';
import { Activity, formatTrainingEffectLabel } from '../types/Activity';
import { Polyline } from '../types/Polyline';
import { ACTIVITY_COLORS } from '../constants/colors';
import {
  isRun,
  isRide,
  isFootball,
  isOtherActivity,
  distanceToMiles,
  getDuration,
  activityIcon
} from '../utils/activity.utils';
declare var L: any;

@Component({
  selector: 'app-heatmap',
  templateUrl: './heatmap.component.html',
  styleUrls: ['./heatmap.component.scss'],
  standalone: false
})
export class HeatmapComponent implements OnInit, OnDestroy {
  private mapCenter = environment.mapCenter;
  private mapDefaultZoom = 11;
  activities: Activity[] = [];
  syncError = false;
  runCount = 0;
  rideCount = 0;
  footballCount = 0;
  otherActivityCount = 0;
  totalDistance = 0;
  totalSeconds = 0;
  loading = false;
  loaded = false;
  map: any;

  // ── Loading message cycling ────────────────────────────
  loadingMessage = 'Plotting your trails…';
  msgFading = false;
  private readonly _loadingMsgs = [
    'Plotting your trails…',
    'Building the heat map…',
    'Tracing your routes…',
    'Mapping your miles…'
  ];
  private _msgIdx = 0;
  private _msgTimer: ReturnType<typeof setInterval> | null = null;

  private _startLoadingCycle(): void {
    this.loadingMessage = this._loadingMsgs[0];
    this._msgIdx = 0;
    this._msgTimer = setInterval(() => {
      this.msgFading = true;
      setTimeout(() => {
        this._msgIdx = (this._msgIdx + 1) % this._loadingMsgs.length;
        this.loadingMessage = this._loadingMsgs[this._msgIdx];
        this.msgFading = false;
      }, 260);
    }, 2800);
  }

  private _stopLoadingCycle(): void {
    if (this._msgTimer !== null) {
      clearInterval(this._msgTimer);
      this._msgTimer = null;
    }
  }

  ngOnDestroy(): void {
    this._stopLoadingCycle();
  }
  markers: any;
  polylines: Polyline[] = [];
  runPolylines: Polyline[] = [];
  ridePolylines: Polyline[] = [];
  runsLayer: any;
  ridesLayer: any;
  footballLayer: any;
  otherActivitiesLayer: any;
  readonly rideColor = ACTIVITY_COLORS.ride;
  readonly runColor = ACTIVITY_COLORS.run;
  readonly footballColor = ACTIVITY_COLORS.football;
  readonly otherActivityColor = ACTIVITY_COLORS.other;
  lastVisibleActivity: Activity;
  view = View;
  currentView = View.All;

  constructor(
    private activityService: ActivityService,
    private decimalPipe: DecimalPipe,
    private datePipe: DatePipe
  ) {}

  ngOnInit(): void {
    this.load();
  }

  private async load() {
    this.loading = true;
    this._startLoadingCycle();

    const { activities, syncError } =
      await this.activityService.getActivities();
    this.activities = activities;
    this.syncError = syncError;

    this.loadHeatmap();
    if (this.polylines.length > 0) {
      this.lastVisibleActivity =
        this.polylines[this.polylines.length - 1].activity;
    }

    this._stopLoadingCycle();
    this.loading = false;
    this.loaded = true;
  }

  filterChanged(view: View) {
    this.currentView = view;
    this.totalDistance = 0;
    this.totalSeconds = 0;
    this.runCount = 0;
    this.rideCount = 0;
    this.footballCount = 0;
    this.otherActivityCount = 0;

    const startOfToday = dayjs().startOf('day');
    const lastWeek = dayjs().subtract(1, 'week');
    const lastMonth = dayjs().subtract(1, 'month');
    const lastYear = dayjs().subtract(1, 'year');

    this.polylines.forEach((polyline: Polyline) => {
      let show = false;

      switch (this.currentView) {
        case View.All: {
          show = true;
          break;
        }
        case View.Year: {
          if (dayjs(polyline.activity.start_date).isAfter(lastYear)) {
            show = true;
          }
          break;
        }
        case View.Month: {
          if (dayjs(polyline.activity.start_date).isAfter(lastMonth)) {
            show = true;
          }
          break;
        }
        case View.Week: {
          if (dayjs(polyline.activity.start_date).isAfter(lastWeek)) {
            show = true;
          }
          break;
        }
        case View.Day: {
          if (dayjs(polyline.activity.start_date).isAfter(startOfToday)) {
            show = true;
          }
          break;
        }
      }

      if (show) {
        this.showPolyline(polyline);
      } else {
        this.hidePolyline(polyline);
      }
    });

    this.activities
      .filter((a) => !a.encoded_route)
      .forEach((activity: Activity) => {
        let include = false;
        switch (this.currentView) {
          case View.All: {
            include = true;
            break;
          }
          case View.Year: {
            include = dayjs(activity.start_date).isAfter(lastYear);
            break;
          }
          case View.Month: {
            include = dayjs(activity.start_date).isAfter(lastMonth);
            break;
          }
          case View.Week: {
            include = dayjs(activity.start_date).isAfter(lastWeek);
            break;
          }
          case View.Day: {
            include = dayjs(activity.start_date).isAfter(startOfToday);
            break;
          }
        }
        if (include) {
          this.totalDistance += activity.distance_meters;
          this.totalSeconds +=
            activity.duration ?? activity.moving_time_seconds;
          if (this.isRun(activity)) {
            this.runCount++;
          } else if (this.isRide(activity)) {
            this.rideCount++;
          } else if (this.isFootball(activity)) {
            this.footballCount++;
          } else {
            this.otherActivityCount++;
          }
        }
      });
  }

  private showPolyline(polyline: Polyline) {
    const isRun = this.isRun(polyline.activity);
    const isRide = this.isRide(polyline.activity);
    const isFootball = this.isFootball(polyline.activity);

    if (!polyline.visible) {
      if (isRun) {
        this.runsLayer.addLayer(polyline);
      }
      if (isRide) {
        this.ridesLayer.addLayer(polyline);
      }
      if (isFootball) {
        this.footballLayer.addLayer(polyline);
      }
      if (!isRun && !isRide && !isFootball) {
        this.otherActivitiesLayer.addLayer(polyline);
      }

      polyline.visible = true;
    }

    this.totalDistance += polyline.activity.distance_meters;
    this.totalSeconds +=
      polyline.activity.duration ?? polyline.activity.moving_time_seconds;

    if (isRun) {
      this.runCount += 1;
    }
    if (isRide) {
      this.rideCount += 1;
    }
    if (isFootball) {
      this.footballCount += 1;
    }
    if (!isRun && !isRide && !isFootball) {
      this.otherActivityCount += 1;
    }
  }

  private hidePolyline(polyline: Polyline) {
    if (polyline.visible) {
      const isRun = this.isRun(polyline.activity);
      const isRide = this.isRide(polyline.activity);
      const isFootball = this.isFootball(polyline.activity);

      polyline.visible = false;
      if (isRun) {
        this.runsLayer.removeLayer(polyline);
      }
      if (isRide) {
        this.ridesLayer.removeLayer(polyline);
      }
      if (isFootball) {
        this.footballLayer.removeLayer(polyline);
      }
      if (!isRun && !isRide && !isFootball) {
        this.otherActivitiesLayer.removeLayer(polyline);
      }
    }
  }

  private async loadHeatmap() {
    this.createPolylines(this.activities);
    this.sortPolylines();
    this.createMap();

    this.filterChanged(this.view.All);
  }

  private createMap() {
    const normalMap = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        opacity: 0.5,
        attribution:
          '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }
    );

    const darkMap = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        maxZoom: 19,
        attribution:
          // tslint:disable-next-line:max-line-length
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      }
    );

    const satelliteMap = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution:
          // tslint:disable-next-line:max-line-length
          'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      }
    );

    const pisteMap = L.tileLayer(
      'https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors & ODbL, &copy; <a href="https://www.opensnowmap.org/iframes/data.html">www.opensnowmap.org</a> <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>'
      }
    );

    this.runsLayer = L.layerGroup(
      this.polylines.filter((p) => this.isRun(p.activity))
    );
    this.ridesLayer = L.layerGroup(
      this.polylines.filter((p) => this.isRide(p.activity))
    );
    this.footballLayer = L.layerGroup(
      this.polylines.filter((p) => this.isFootball(p.activity))
    );
    this.otherActivitiesLayer = L.layerGroup(
      this.polylines.filter((p) => this.isOtherActivity(p.activity))
    );

    this.map = L.map('map', {
      center: this.mapCenter,
      zoom: this.mapDefaultZoom,
      zoomControl: false,
      layers: [
        darkMap,
        this.runsLayer,
        this.ridesLayer,
        this.footballLayer,
        this.otherActivitiesLayer
      ],
      preferCanvas: true
    });

    const baseMaps = {
      Standard: normalMap,
      Satellite: satelliteMap,
      Dark: darkMap,
      Piste: pisteMap
    };

    const overlays = {
      Runs: this.runsLayer,
      Rides: this.ridesLayer,
      Football: this.footballLayer,
      Others: this.otherActivitiesLayer
    };

    L.control.layers(baseMaps, overlays).addTo(this.map);

    L.Control.zoomHome().addTo(this.map);

    L.control
      .locate({
        position: 'topleft',
        keepCurrentZoomLevel: true
      })
      .addTo(this.map);

    this.map.addLayer(this.markers);
  }

  private createPolylines(activityStreams: Activity[]) {
    this.markers = L.markerClusterGroup({
      showCoverageOnHover: false,
      singleMarkerMode: true
    });

    activityStreams.forEach((stream) => {
      if (!stream.encoded_route) {
        return;
      }

      const coordinates = L.Polyline.fromEncoded(
        stream.encoded_route!
      ).getLatLngs();

      let color: string = this.otherActivityColor;
      if (this.isRun(stream)) {
        color = this.runColor;
      } else if (this.isRide(stream)) {
        color = this.rideColor;
      } else if (this.isFootball(stream)) {
        color = this.footballColor;
      }

      const polyline = L.polyline(coordinates, {
        color: color,
        weight: 3,
        opacity: 0.6
      });
      polyline.visible = true;
      polyline.activity = stream;
      polyline.bindPopup(this.createPolylinePopup(stream), { maxWidth: 300 });

      if (stream.start_latitude != null && stream.start_longitude != null) {
        var marker = L.marker([stream.start_latitude, stream.start_longitude], {
          title: stream.name
        });
        marker.bindPopup(this.createPolylinePopup(stream), { maxWidth: 300 });
        this.markers.addLayer(marker);
      }

      this.polylines.push(polyline);
    });
  }

  isRun(activity: Activity): boolean {
    return isRun(activity);
  }
  isRide(activity: Activity): boolean {
    return isRide(activity);
  }
  isFootball(activity: Activity): boolean {
    return isFootball(activity);
  }
  isOtherActivity(activity: Activity): boolean {
    return isOtherActivity(activity);
  }
  activityIcon(activity: Activity): string {
    return activityIcon(activity);
  }

  private createPolylinePopup(activity: Activity) {
    const iconClass = activityIcon(activity);
    let typeClass = 'hm-popup__header--other';
    if (this.isRun(activity)) {
      typeClass = 'hm-popup__header--run';
    } else if (this.isRide(activity)) {
      typeClass = 'hm-popup__header--ride';
    } else if (this.isFootball(activity)) {
      typeClass = 'hm-popup__header--football';
    }

    const durationSeconds = activity.duration ?? activity.moving_time_seconds;
    const distanceMiles = this.distanceToMiles(activity.distance_meters);

    let paceHtml = '';
    if (this.isRun(activity) && activity.distance_meters > 0) {
      const paceSecs = durationSeconds / (activity.distance_meters / 1609);
      const paceMin = Math.floor(paceSecs / 60);
      const paceSec = Math.round(paceSecs % 60);
      paceHtml = `
        <div class="hm-popup__stat">
          <div class="hm-popup__stat-value">${paceMin}:${paceSec.toString().padStart(2, '0')}</div>
          <div class="hm-popup__stat-label">Min/Mile</div>
        </div>`;
    }

    const hrHtml = activity.averageHR
      ? `
        <div class="hm-popup__stat">
          <div class="hm-popup__stat-value">${activity.averageHR}</div>
          <div class="hm-popup__stat-label">Avg HR</div>
        </div>`
      : '';

    const maxHrHtml = activity.maxHR
      ? `
        <div class="hm-popup__stat">
          <div class="hm-popup__stat-value">${activity.maxHR}</div>
          <div class="hm-popup__stat-label">Max HR</div>
        </div>`
      : '';

    const tLoadHtml = activity.activityTrainingLoad
      ? `
        <div class="hm-popup__stat">
          <div class="hm-popup__stat-value">${Math.round(activity.activityTrainingLoad)}</div>
          <div class="hm-popup__stat-label">Load</div>
        </div>`
      : '';

    const tEffectHtml = activity.trainingEffect
      ? `
      <div class="hm-popup__effect">
        <span class="hm-popup__effect-label">Training Effect</span>
        <span class="hm-popup__effect-value">${activity.trainingEffect.toFixed(1)}${activity.trainingEffectLabel ? ' · ' + formatTrainingEffectLabel(activity.trainingEffectLabel) : ''}</span>
      </div>`
      : '';

    return `
      <div class="hm-popup">
        <div class="hm-popup__header ${typeClass}">
          <i class="${iconClass}"></i>
          <span class="hm-popup__name">${activity.name}</span>
        </div>
        <div class="hm-popup__when">
          ${this.getTimeSince(activity.start_date)} &nbsp;·&nbsp; ${this.datePipe.transform(activity.start_date, 'MMM d, y')}
        </div>
        <div class="hm-popup__stats">
          <div class="hm-popup__stat">
            <div class="hm-popup__stat-value">${this.decimalPipe.transform(distanceMiles, '1.1-1')}</div>
            <div class="hm-popup__stat-label">Miles</div>
          </div>
          <div class="hm-popup__stat">
            <div class="hm-popup__stat-value">${this.getDuration(durationSeconds)}</div>
            <div class="hm-popup__stat-label">Duration</div>
          </div>
          ${paceHtml}
          ${hrHtml}
          ${maxHrHtml}
          ${tLoadHtml}
        </div>
        ${tEffectHtml}
        <a class="hm-popup__link" href="https://connect.garmin.com/app/activity/${activity.id}" target="_blank" rel="noopener noreferrer">
          <i class="fas fa-external-link-alt"></i> Garmin Connect
        </a>
      </div>`;
  }

  private sortPolylines() {
    this.polylines = this.polylines.sort((a, b) => {
      const dateA = new Date(a.activity.start_date);
      const dateB = new Date(b.activity.start_date);

      return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
    });
  }

  distanceToMiles(meters: number): number {
    return distanceToMiles(meters);
  }

  secondsToHours(time: number) {
    return time / 60 / 60;
  }

  getTimeSince(startDate: string) {
    return dayjs(startDate).fromNow();
  }

  private getDuration(durationInSeconds: number): string {
    return getDuration(durationInSeconds);
  }
}
