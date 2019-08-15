/* global d3, L */

const hasVal = (row, key) => row.hasOwnProperty(key) && row[key] !== '' && row[key] !== 'unknown';

const $ = sel => document.querySelector(sel);

const stations = [];

const loadStations = async () => {
	if (stations.length > 0) { return; } // already loaded
	const response = await fetch('data/stations.csv');
	const csv = await response.text();
	const sources = d3.csvParse(csv);
	for (const source of sources) {
		const id = source['Canonical ID'];
		let station = stations.find(s => s.id === id);
		if (!station) {
			station = { id, sources: [], lineage: { children: [] } };
			stations.push(station);
		}
		station.sources.push(source);

		const parent = sources.find(s => s.ID === source['Derived From']);
		if (parent) {
			if (!parent.children) { parent.children = []; }
			parent.children.push(source);
		} else {
			station.lineage.children.push(source);
		}
		if (hasVal(source, 'latitude')) {
			station.latlon = [Number(source.latitude), Number(source.longitude)];
		}
		if (hasVal(source, 'Site Name')) {
			station.name = source['Site Name'];
		}
		if (hasVal(source, 'status')) {
			station.status = source['status'];
		}
		source.measures = [];
		if (source['NO2 (Nitrogen Dioxide)'] === 'yes') { source.measures.push('no2'); }
		if (source['O3 (Ozone)'] === 'yes') { source.measures.push('o3'); }
		if (source['PM10'] === 'yes') { source.measures.push('pm10'); }
		if (source['PM25'] === 'yes') { source.measures.push('pm25'); }
		if (source['SO2 (Sulpher Dioxide)'] === 'yes') { source.measures.push('so2'); }
	}
};

const showMetadata = (station, source) => {
	if (!source) { source = station.lineage.children[0]; }
	$('#metadata').style.display = 'block';
	$('#metadata h2').textContent = `Sensor "${source['Site Name']}"`;
	$('#metadata h3').textContent = `Metadata from ${source['Publisher']}`;
	$('#closed').style.display = station.status === 'closed' ? 'block' : 'none';
	$('#mID').textContent = station.id;
	$('#mName').textContent = source['Site Name'];
	$('#mCode').textContent = source['Site Code'];
	$('#mEUID').textContent = source['EU Site ID'];
	$('#mPublisher').textContent = source['Publisher'];
	$('#mProcessor').textContent = source['Data Processor'];
	$('#mOwner').textContent = source['Data Owner'];
	$('#mOperator').textContent = source['Site Operator'];
	$('#mQA').textContent = source['Quality Assurance'];
	$('#mURI').innerHTML = `<a href="${source['URI']}">Link</a>`;
	$('#mDownload').innerHTML = `<a href="${source['Download URL']}">Link</a>`;
	$('#mMetadata').innerHTML = `<a href="${source['Metadata URL']}">Link</a>`;
	$('#mOpened').textContent = source['opened'];
	$('#mClosed').textContent = source['closed'];
	$('#mAddress').textContent = source['Address'];
	$('#mLat').textContent = source['latitude'];
	$('#mLong').textContent = source['longitude'];
	$('#mAltitude').textContent = source['Altitude (m'];
	$('#mHeight').textContent = source['inlet height (m'];
	$('#mType').textContent = source['Environment Type'];
	$('#mLicense').textContent = source['license'];
	$('#mStatus').textContent = source['status'];
	$('#mMeasures').textContent = source.measures.join(', ');
	$('#mRegion').textContent = source['Government Region'];
	$('#mLA').textContent = source['Local Authority'];

	const width = 300;
	const barHeight = 28;
	const barWidth = width * 0.6;

	const root = d3.hierarchy(station.lineage);
	root.x0 = 0;
	root.y0 = 0;

	let index = -1;
	root.eachBefore(n => {
		n.x = ++index * barHeight;
		n.y = n.depth * 20;
	});

	const nodes = root.descendants(); // Compute the flattened node list.
	const height = nodes.length * (barHeight + 4) - 10;

	d3.select('#mLineage svg').remove();

	const svg = d3.select('#mLineage').append('svg')
		.attr('width', width)
		.attr('height', height);

	let i = 0;
	const node = svg.selectAll('.node')
		.data(nodes, d => d.id || (d.id = ++i))
		.enter().append('g')
			.attr('class', 'node')
			.attr('transform', d => `translate(${d.y},${d.x})`)
			.on('click', d => {
				location = `#?station=${station.id}&source=${d.data.ID}`;
			});

	node.append('rect')
		.attr('opacity', d => d.parent ? 1 : 0)  // hide the root node
		.attr('y', -barHeight / 2 + 4)
		.attr('height', barHeight - 8)
		.attr('width', barWidth)
		.style('fill', d => d.data.ID === source.ID ? '#fd8d3c'  : '#efefef');

	node.append('text')
		.attr('dy', 3.5)
		.attr('dx', 5.5)
		.text(d => d.data['Publisher']);

	svg.selectAll('.link')
		.data(root.links(), d => d.target.id)
		.enter().insert('path', 'g')
			.attr('opacity', d => d.source.parent ? 1 : 0) // hide the root node
			.attr('class', 'link')
			.attr('d', d => [
				'M', d.source.y + 8, d.source.x + barHeight / 2 - 4,
				'L', d.source.y + 8, d.target.x,
				'L', d.target.y, d.target.x,
			].join(' '));
};

const initMap = async () => {
	const map = L.map('map').setView([51.505, -0.09], 13);

	L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
	}).addTo(map);

	await loadStations();
	for (const station of stations) {
		if (!station.latlon) { continue; }
		L.circle(station.latlon, { color: station.status === 'closed' ? '#f00' : '#00f', radius: 100 })
			.addTo(map)
			.on('click', () => {
				location.href = `#?station=${station.id}`;
			});
	}

	map.fitBounds(stations.map(s => s.latlon).filter(s => s), { padding: [20, 20] });

};

const go = async () => {
	await loadStations();
	const params = new URLSearchParams(location.hash.slice(1));
	if (params.has('station')) {
		console.log('station', params.get('station'));
		const station = stations.find(s => s.id === params.get('station'));
		if (!station) {
			console.error('No station with ID', params.get('station'));
			return;
		}
		const source = station.sources.find(s => s.ID === params.get('source'));
		showMetadata(station, source);
	}
};

window.addEventListener('load', go);
window.addEventListener('popstate', go);

initMap();
