#!/usr/bin/env node
'use strict';
const program = require('commander');
const _ = require('lodash');
const fs = require('fs');
const turf = {
  distance: require('@turf/distance').default
};

function run(inputPath, outputPath, extractTraces) {
  const locationHistory = JSON.parse(fs.readFileSync(inputPath));

	const geojson = extractTraces ? convertLocationHistoryToTraces(locationHistory) : convertLocationHistoryToPoints(locationHistory);
	fs.writeFileSync(outputPath, JSON.stringify(geojson), { encoding: 'utf-8' });
}

function findMostLikelyActivity(location) {
	if (!location.activity) return 'UNKNOWN';
	const mainActivity = location.activity[0].activity;
	const sortedActivities = _.orderBy(mainActivity, ['confidence'], ['desc']);
	return sortedActivities[0].type;
}

function extractCoordinates(location) {
	return [
		location.longitudeE7 / 1e7,
		location.latitudeE7 / 1e7
	];
}

function convertLocationHistoryToTraces(locationHistory) {
  const points = convertLocationHistoryToPoints(locationHistory).features;

  const traces = [];
  let activities = [];
  let components = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];

    const timedelta = Math.abs((cur.properties.timestampMs - prev.properties.timestampMs) / 1000 / 60);
    const distancedelta = turf.distance(prev.geometry.coordinates, cur.geometry.coordinates, { units: 'kilometers' });

    if(timedelta > 5 || distancedelta > 1) {
      // no points for 10 minutes or 1km
      traces.push({
        type: 'Feature',
        properties: {
          activity: _.chain(activities).countBy().toPairs().max(_.last).head().value()
        },
        geometry: {
          type: 'LineString',
          coordinates: components
        }
      });
      components = [];
      activities = [];
    } else {
      if (cur.properties.activity !== 'UNKNOWN') {
        activities.push(cur.properties.activity);
      }
      components.push(cur.geometry.coordinates);
    }
  }

	return {
		type: 'FeatureCollection',
		features: traces
	};
}

function convertLocationHistoryToPoints(locationHistory) {
  const locations = _.orderBy(locationHistory.locations, ['timestampMs', 'asc']);
	const points = locations.map(function turnIntoFeature(location) {
		return {
			type: 'Feature',
			properties: {
				activity: findMostLikelyActivity(location),
				accuracy: location.accuracy,
				timestampMs: location.timestampMs
			},
			geometry: {
				type: 'Point',
				coordinates: extractCoordinates(location)
			}
		};
	});

	return {
		type: 'FeatureCollection',
		features: points
	};
}

if (require.main === module) {
	program
    .usage('<input> <output>')
    .option('--traces', 'Extract traces instead of points')
		.description('Read a google location history file and turn it into GeoJSON')
		.parse(process.argv);

	if (program.args.length < 2) {
		program.outputHelp();
	} else {
		run(program.args[0], program.args[1], program.traces);
	}
}

module.exports = {
  convertLocationHistoryToPoints,
  convertLocationHistoryToTraces
}
