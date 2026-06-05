import { Component, OnInit } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { ActivityService } from '../activity.service';
import { environment } from '../../environments/environment';
import moment from 'moment';
import { View } from '../types/View';
import { Activity, formatTrainingEffectLabel } from '../types/Activity';
import { Polyline } from '../types/Polyline';
declare var L: any;

@Component({
  selector: 'app-heatmap',
  templateUrl: './heatmap.component.html',
  styleUrls: ['./heatmap.component.scss'],
  standalone: false
})
export class HeatmapComponent implements OnInit {
  private mapCenter = environment.mapCenter;
  private mapDefaultZoom = 11;
  activities: Activity[] = [];
  syncError = false;
  runCount = 0;
  rideCount = 0;
  otherActivityCount = 0;
  totalDistance = 0;
  totalSeconds = 0;
  loading = false;
  loaded = false;
  map: any;
  markers: any;
  polylines: Polyline[] = [];
  runPolylines: Polyline[] = [];
  ridePolylines: Polyline[] = [];
  runsLayer: any;
  ridesLayer: any;
  otherActivitiesLayer: any;
  rideColor = '#2B54D4';
  runColor = '#E63419';
  otherActivityColor = '#b316de';
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

    const { activities, syncError } =
      await this.activityService.getActivities();
    this.activities = activities;
    this.syncError = syncError;

    this.loadHeatmap();
    if (this.polylines.length > 0) {
      this.lastVisibleActivity =
        this.polylines[this.polylines.length - 1].activity;
    }

    this.loading = false;
    this.loaded = true;
  }

  filterChanged(view: View) {
    this.currentView = view;
    this.totalDistance = 0;
    this.totalSeconds = 0;
    this.runCount = 0;
    this.rideCount = 0;
    this.otherActivityCount = 0;

    const startOfToday = moment().startOf('day');
    const lastWeek = moment().subtract(1, 'weeks');
    const lastMonth = moment().subtract(1, 'months');
    const lastYear = moment().subtract(1, 'years');

    this.polylines.forEach((polyline: Polyline) => {
      let show = false;

      switch (this.currentView) {
        case View.All: {
          show = true;
          break;
        }
        case View.Year: {
          if (moment(polyline.activity.start_date).isAfter(lastYear)) {
            show = true;
          }
          break;
        }
        case View.Month: {
          if (moment(polyline.activity.start_date).isAfter(lastMonth)) {
            show = true;
          }
          break;
        }
        case View.Week: {
          if (moment(polyline.activity.start_date).isAfter(lastWeek)) {
            show = true;
          }
          break;
        }
        case View.Day: {
          if (moment(polyline.activity.start_date).isAfter(startOfToday)) {
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
            include = moment(activity.start_date).isAfter(lastYear);
            break;
          }
          case View.Month: {
            include = moment(activity.start_date).isAfter(lastMonth);
            break;
          }
          case View.Week: {
            include = moment(activity.start_date).isAfter(lastWeek);
            break;
          }
          case View.Day: {
            include = moment(activity.start_date).isAfter(startOfToday);
            break;
          }
        }
        if (include) {
          this.totalDistance += activity.distance_meters;
          this.totalSeconds += activity.moving_time_seconds;
          if (this.isRun(activity)) {
            this.runCount++;
          } else if (this.isRide(activity)) {
            this.rideCount++;
          } else {
            this.otherActivityCount++;
          }
        }
      });
  }

  private showPolyline(polyline: Polyline) {
    const isRun = this.isRun(polyline.activity);
    const isRide = this.isRide(polyline.activity);

    if (!polyline.visible) {
      if (isRun) {
        this.runsLayer.addLayer(polyline);
      }
      if (isRide) {
        this.ridesLayer.addLayer(polyline);
      }

      if (!isRun && !isRide) {
        this.otherActivitiesLayer.addLayer(polyline);
      }

      polyline.visible = true;
    }

    this.totalDistance += polyline.activity.distance_meters;
    this.totalSeconds += polyline.activity.moving_time_seconds;

    if (isRun) {
      this.runCount += 1;
    }

    if (isRide) {
      this.rideCount += 1;
    }

    if (!isRun && !isRide) {
      this.otherActivityCount += 1;
    }
  }

  private hidePolyline(polyline: Polyline) {
    if (polyline.visible) {
      const isRun = this.isRun(polyline.activity);
      const isRide = this.isRide(polyline.activity);

      polyline.visible = false;
      if (isRun) {
        this.runsLayer.removeLayer(polyline);
      }
      if (isRide) {
        this.ridesLayer.removeLayer(polyline);
      }
      if (!isRun && !isRide) {
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

      let color = this.otherActivityColor;
      if (this.isRun(stream)) {
        color = this.runColor;
      } else if (this.isRide(stream)) {
        color = this.rideColor;
      }

      const polyline = L.polyline(coordinates, {
        color: color,
        weight: 3,
        opacity: 0.6
      });
      polyline.visible = true;
      polyline.activity = stream;
      polyline.bindPopup(this.createPolylinePopup(stream));

      if (stream.start_latitude != null && stream.start_longitude != null) {
        var marker = L.marker([stream.start_latitude, stream.start_longitude], {
          title: stream.name
        });
        marker.bindPopup(this.createPolylinePopup(stream));
        this.markers.addLayer(marker);
      }

      this.polylines.push(polyline);
    });
  }

  isRun(activity: Activity) {
    return activity.activity_type === 'run';
  }

  isRide(activity: Activity) {
    return activity.activity_type === 'ride';
  }

  isOtherActivity(activity: Activity) {
    return !this.isRun(activity) && !this.isRide(activity);
  }

  private createPolylinePopup(activity: Activity) {
    let image = '<i class="fas fa-heartbeat"></i>';
    if (this.isRun(activity)) {
      image = '<i class="fas fa-running"></i>';
    } else if (this.isRide(activity)) {
      image = '<i class="fas fa-biking"></i>';
    }

    const avgHR = activity.averageHR
      ? `Avg HR: ${activity.averageHR} bpm<br>`
      : '';
    const maxHR = activity.maxHR ? `Max HR: ${activity.maxHR} bpm<br>` : '';
    const tEffect = activity.trainingEffect
      ? `Training Effect: ${activity.trainingEffect.toFixed(1)}${activity.trainingEffectLabel ? ' (' + formatTrainingEffectLabel(activity.trainingEffectLabel) + ')' : ''}<br>`
      : '';
    const aEffect = activity.anaerobicTrainingEffect
      ? `Anaerobic Effect: ${activity.anaerobicTrainingEffect.toFixed(1)}<br>`
      : '';
    const tLoad = activity.activityTrainingLoad
      ? `Training Load: ${Math.round(activity.activityTrainingLoad)}<br>`
      : '';

    return (
      `<b>${image} | ${activity.name}</b><br>` +
      `${this.getTimeSince(activity.start_date)}<br>` +
      `Date: ${this.datePipe.transform(activity.start_date, 'shortDate')}<br>` +
      `Distance: ${this.decimalPipe.transform(
        this.distanceToMiles(activity.distance_meters),
        '1.0-1'
      )} Miles<br>` +
      `Time: ${this.getDuration(activity.duration ?? activity.moving_time_seconds)}<br>` +
      avgHR +
      maxHR +
      tEffect +
      aEffect +
      tLoad +
      `<a href="https://connect.garmin.com/app/activity/${activity.id}" target="_blank" rel="noopener noreferrer">View on Garmin Connect</a>`
    );
  }

  private sortPolylines() {
    this.polylines = this.polylines.sort((a, b) => {
      const dateA = new Date(a.activity.start_date);
      const dateB = new Date(b.activity.start_date);

      return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
    });
  }

  distanceToMiles(meters: number) {
    return meters / 1609;
  }

  secondsToHours(time: number) {
    return time / 60 / 60;
  }

  getTimeSince(startDate: string) {
    return moment(startDate).fromNow();
  }

  private getDuration(durationInSeconds: number) {
    try {
      const hours = Math.floor(durationInSeconds / 3600);
      const minutes = Math.round((durationInSeconds % 3600) / 60);
      if (hours > 0 && minutes > 0) return `${hours} hr ${minutes} mins`;
      if (hours > 0) return `${hours} hr`;
      return `${minutes} mins`;
    } catch (error) {
      return '';
    }
  }
}
