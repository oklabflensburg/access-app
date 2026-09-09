1. Goal

Build a mobile-first PWA for collecting accessibility data for a public map.

Users should be able to:

see their current location
create an accessibility observation
answer a small questionnaire
optionally collect sensor data
add photos
save observations offline
sync them to a backend later
2. Tech stack

Frontend:

Vue 3
TypeScript
Vite
Vue Router
Pinia
Leaflet
OpenStreetMap
IndexedDB
Dexie
Vite PWA plugin

Backend:

PHP REST API
PostgreSQL
PostGIS if geographic queries are needed
local filesystem or object storage for photos

No user accounts required for MVP.

3. MVP features
   Phase 1 — App foundation

Create:

Vue 3
TypeScript
Vite
Vue Router
Pinia
PWA support

Basic pages:

/
MapView

/observation/new
NewObservationView

/observations
MyObservationsView
4. Map

Use Leaflet + OpenStreetMap.

Features:

request location permission
show user's current location
show GPS accuracy
show altitude when available
center map on user
show saved observations as markers

Example:

Latitude
Longitude
Accuracy
Altitude
Timestamp
5. Create observation

User taps:

+ Add accessibility information

Store location automatically.

Basic questionnaire:

Wheelchair accessible?
Yes / No / Unknown

Steps at entrance?
0 / 1 / 2 / 3+

Ramp available?
Yes / No / Unknown

Accessible toilet?
Yes / No / Unknown

Elevator available?
Yes / No / Unknown

Surface:
Smooth
Uneven
Cobblestone
Gravel
Other

Comment

Keep this short for the MVP.

6. Sensor architecture

Do not access sensors directly from Vue components.

Create services/composables:

src/services/
geolocation.ts
noise.ts
motion.ts
camera.ts
storage.ts
api.ts

And optionally:

src/composables/
useGeolocation.ts
useNoiseMeasurement.ts
useMotionMeasurement.ts

This makes it easier to replace browser APIs with native APIs later.

7. GPS

Use the browser Geolocation API.

Store:

{
latitude,
longitude,
accuracy,
altitude,
altitudeAccuracy,
heading,
speed,
timestamp
}

All fields except latitude/longitude may be unavailable.

8. Noise measurement

Use:

getUserMedia()
Web Audio API
AnalyserNode

Never store audio.

Calculate only values like:

{
averageLevel,
peakLevel,
duration
}

Initially treat this as:

relative noise level

Not calibrated dB.

Example categories could later be:

quiet
moderate
loud
very loud
9. Motion sensors

Potentially collect:

accelerometer
gyroscope
device orientation

Possible future uses:

detecting rough surfaces
estimating vibration
detecting steep ramps
estimating route comfort

For MVP, just collect raw values.

Do not try to automatically classify wheelchair accessibility yet.

Example:

{
accelerationX,
accelerationY,
accelerationZ,
rotationAlpha,
rotationBeta,
rotationGamma,
timestamp
}
10. Light sensor

Support ambient-light sensors only when available.

Because browser support is poor, this must be optional.

The application should behave normally when the sensor is unavailable.

Later you could also estimate brightness through the camera.

11. Photos

Allow users to photograph:

entrances
stairs
ramps
elevators
toilets
pathways
obstacles

Requirements:

camera/file picker
image preview
resize before storing/uploading
optionally remove EXIF metadata
12. Offline-first storage

Every observation should first be saved locally.

Use IndexedDB through Dexie.

Possible status:

draft
ready
syncing
synced
failed

Example model:

interface Observation {
id: string;

createdAt: string;

location: LocationData;

accessibility: AccessibilityData;

noise?: NoiseMeasurement;

motion?: MotionMeasurement[];

photos?: Photo[];

comment?: string;

syncStatus: 'draft' | 'ready' | 'syncing' | 'synced' | 'failed';
}
13. Pinia

Use Pinia for application state such as:

current location
active observation
sync state
application settings

Do not store large sensor datasets or photos directly in Pinia.

Store those in IndexedDB.

14. Backend API

Initial endpoints:

POST /api/observations

GET /api/observations

GET /api/observations/{id}

POST /api/observations/{id}/photos

Later:

GET /api/observations?bbox=...

This allows the map to load observations within the visible area.

15. Example API payload
    {
    "id": "uuid",
    "createdAt": "2026-09-09T17:30:00Z",

"location": {
"latitude": 52.5201,
"longitude": 13.4049,
"accuracy": 8,
"altitude": 34
},

"accessibility": {
"wheelchairAccessible": true,
"steps": 0,
"ramp": true,
"accessibleToilet": false,
"elevator": null,
"surface": "smooth"
},

"noise": {
"averageLevel": 0.32,
"peakLevel": 0.71,
"duration": 10
},

"comment": "Entrance accessible from the side."
}
16. Project structure
    src/

components/
Map.vue
ObservationMarker.vue
AccessibilityForm.vue
NoiseMeasurement.vue
PhotoCapture.vue

views/
MapView.vue
NewObservationView.vue
MyObservationsView.vue

composables/
useGeolocation.ts
useNoiseMeasurement.ts
useMotionMeasurement.ts

services/
geolocation.ts
noise.ts
motion.ts
camera.ts
storage.ts
api.ts
sync.ts

stores/
location.ts
observation.ts
sync.ts

types/
observation.ts
location.ts
sensors.ts

router/
index.ts
17. Implementation order for the coding LLM
    Milestone 1

Only build:

Open application

→ request GPS permission

→ display map

→ display current position

→ click "Add observation"

→ answer accessibility questionnaire

→ save observation to IndexedDB

→ show observation marker

Do not implement sensors yet.

Milestone 2

Add:

offline PWA
observation list
editing observations
deleting observations
Milestone 3

Add:

photo capture
image compression
local photo storage
Milestone 4

Add:

microphone permission
relative noise measurement
average + peak
Milestone 5

Add:

accelerometer
gyroscope
device orientation
raw measurement recording
Milestone 6

Create PHP backend:

POST observations
GET observations
photo upload
database persistence
Milestone 7

Implement synchronization:

IndexedDB
↓
sync queue
↓
REST API
↓
PostgreSQL

Handle:

offline
timeouts
failed uploads
duplicates
retry
18. Accessibility of the app itself

Very important for this project.

The UI should have:

large touch targets
keyboard navigation
screen-reader labels
semantic HTML
high contrast
no information communicated only through color
simple forms
minimal required typing
clear permission explanations
large readable text
19. Instructions for the coding LLM
    You are building a mobile-first accessibility data collection PWA.

Technology:

Frontend:
- Vue 3
- TypeScript
- Vite
- Vue Router
- Pinia
- Leaflet
- OpenStreetMap
- Dexie / IndexedDB
- Vite PWA

Backend:
- PHP REST API
- PostgreSQL

Vue rules:
- use Vue 3 Composition API
- use <script setup lang="ts">
- keep components small
- keep business logic outside UI components
- use composables for reusable Vue logic
- use services for browser APIs and backend access

Sensor rules:
- sensor APIs must be isolated behind services
- always expect sensors to be unavailable
- handle denied permissions gracefully
- never record or store microphone audio
- noise measurements are relative, not calibrated dB
- sensor measurement must never be required to create an observation

Offline rules:
- save observations locally before server synchronization
- use IndexedDB for persistent data
- support failed sync and retries

Accessibility rules:
- build accessible UI
- use semantic HTML
- provide labels for controls
- support keyboard navigation
- use sufficiently large touch targets

Development process:
- implement only one milestone at a time
- do not introduce unnecessary abstractions
- prefer simple readable code
- avoid premature optimization

After each milestone:
1. summarize what was implemented
2. list created/modified files
3. describe important architecture decisions
4. provide manual testing instructions
5. list browser/device limitations
6. identify remaining TODOs
7. do not automatically start the next milestone

The key idea is: make manual accessibility data collection work reliably first. Then progressively add sensor data.