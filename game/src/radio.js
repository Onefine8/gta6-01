// The radio for Palmetto Bay Heat. Four stations, each with its own DJ,
// its own sound, and a playlist of original tracks that exist only as
// metadata — title, artist, length — because the game ships no audio
// files and makes no network calls. The radio is a clock, not a player:
// step it by dt and the current track advances, ends, and rolls into the
// next one; switch stations and the new station picks up where its own
// playlist left off, the way a real car radio does.
//
// Stations:
//   - Bay FM 101.1: sunny pop for the beach road.
//   - Palmetto Rock 98.5: loud guitars for a getaway.
//   - Harbor Talk 720 AM: the city's talk station — news, traffic, and
//     callers who are sure the mayor is hiding something.
//   - Neon Nights 88.9: late-night electronic for the drive home.
//
// The DJ banter lines are station-flavoured one-liners the main loop can
// show on the toast line between tracks. Everything is pure logic, so
// the headless tests can listen to a whole broadcast day.
import { pick } from './random.js';

export const RADIO_VOLUME_DEFAULT = 0.7;
export const RADIO_VOLUME_STEP = 0.1;

// One entry per station: frequency, name, genre, DJ, and a playlist.
// Track lengths are in seconds; the station loops its playlist forever.
export const RADIO_STATIONS = [
  {
    id: 'bayfm',
    frequency: '101.1 FM',
    name: 'Bay FM',
    genre: 'Pop',
    dj: 'Sunny Marlowe',
    tagline: 'Sunshine, all day, every day.',
    tracks: [
      { title: 'Palmetto Sun', artist: 'The Coral Tones', duration: 184 },
      { title: 'Boardwalk Lights', artist: 'Marina Blue', duration: 201 },
      { title: 'Salt Air', artist: 'The Breakers', duration: 167 },
      { title: 'Golden Hour Drive', artist: 'Sunny Marlowe', duration: 192 },
      { title: 'Coconut Radio', artist: 'The Palm Trees', duration: 178 },
      { title: 'Tide and Time', artist: 'Marina Blue', duration: 214 },
    ],
    banter: [
      'Sunny here — it is a beautiful day in Palmetto Bay, and the traffic on the beach road is moving just fine, for once.',
      'That was The Coral Tones, and if you are driving with the windows down, you are doing it right.',
      'Coming up: a song for everyone stuck at the Downtown lights. Hang in there, Bay — the green is coming.',
      'Bay FM weather: sunny, with a small chance of somebody stealing your parking spot.',
      'Shout-out to the taxi drivers of Palmetto Bay — you keep this city moving, and this next one is for you.',
    ],
  },
  {
    id: 'rock',
    frequency: '98.5 FM',
    name: 'Palmetto Rock',
    genre: 'Rock',
    dj: 'Rex Hammer',
    tagline: 'Loud guitars. Louder engines.',
    tracks: [
      { title: 'Redline', artist: 'Asphalt Kings', duration: 196 },
      { title: 'Midnight Piston', artist: 'Rex Hammer', duration: 223 },
      { title: 'Harbor Nights', artist: 'The Gaskets', duration: 181 },
      { title: 'No Brakes', artist: 'Asphalt Kings', duration: 207 },
      { title: 'Thunder Alley', artist: 'Static Bloom', duration: 189 },
      { title: 'Last Lap', artist: 'The Gaskets', duration: 234 },
    ],
    banter: [
      'Rex Hammer here — turn it up, Palmetto Bay, the neighbours already hate us and it is only noon.',
      'That was Asphalt Kings, and if your engine does not sound like that yet, you are not trying hard enough.',
      'The Rock request line is open: call in, name a song, and tell us what you drive. Best answer wins nothing but respect.',
      'Somebody just told me the Harbor Van is the fastest car in the city. Somebody is wrong, and I love them for it.',
      'Coming up: a song for everyone who has ever outrun a red light and felt alive for three whole seconds.',
    ],
  },
  {
    id: 'talk',
    frequency: '720 AM',
    name: 'Harbor Talk',
    genre: 'Talk',
    dj: 'Dana Whitfield',
    tagline: 'The city, talking to itself.',
    tracks: [
      { title: 'Morning Briefing', artist: 'Harbor Talk News', duration: 240 },
      { title: 'The Bay Report', artist: 'Dana Whitfield', duration: 210 },
      { title: 'Callers\' Hour', artist: 'Harbor Talk Live', duration: 260 },
      { title: 'Traffic and Tide', artist: 'Harbor Talk News', duration: 180 },
      { title: 'The Night Desk', artist: 'Dana Whitfield', duration: 225 },
    ],
    banter: [
      'Dana Whitfield here — the mayor says the harbor dredging is on schedule. The harbor says otherwise.',
      'Caller on line two says the traffic lights on 5th Avenue are timed by someone who has never driven. Caller, we hear you.',
      'In local news: a Sunset Coupe was reported missing near the Coral Hotel. If you see it, do not chase it. Call us instead.',
      'Coming up: a caller who is absolutely certain the lighthouse is haunted. We are absolutely certain he is our favourite caller.',
      'The Bay Report reminds you: the rain makes the roads slick, the fog makes them blind, and the storm makes the cops grumpy.',
    ],
  },
  {
    id: 'neon',
    frequency: '88.9 FM',
    name: 'Neon Nights',
    genre: 'Electronic',
    dj: 'DJ Mirage',
    tagline: 'For the drive home after midnight.',
    tracks: [
      { title: 'Neon Skyline', artist: 'DJ Mirage', duration: 218 },
      { title: 'Pulse District', artist: 'Vector Nine', duration: 197 },
      { title: 'Afterglow', artist: 'Lumen', duration: 186 },
      { title: 'Static Bloom', artist: 'Vector Nine', duration: 209 },
      { title: 'Midnight Ferry', artist: 'DJ Mirage', duration: 231 },
      { title: 'Glass Towers', artist: 'Lumen', duration: 176 },
    ],
    banter: [
      'You are listening to Neon Nights with DJ Mirage — the city looks better at 2 a.m., and so do you.',
      'That was Vector Nine, and the pulse of this city never really stops. It just changes key after midnight.',
      'If you are driving the beach road right now with the windows down — yes, this song was picked for you.',
      'Neon Nights is the sound of the lighthouse sweeping the bay, one slow circle at a time.',
      'Coming up: a track for everyone who is still awake and still driving. The night is young, Palmetto Bay.',
    ],
  },
];

export function stationById(id) {
  return RADIO_STATIONS.find((s) => s.id === id) || null;
}

export function stationByIndex(index) {
  const i = ((index % RADIO_STATIONS.length) + RADIO_STATIONS.length) % RADIO_STATIONS.length;
  return RADIO_STATIONS[i];
}

export function createRadioState() {
  return {
    stationIndex: 0,
    // Each station keeps its own place in its playlist, so switching
    // away and back resumes the song that was playing, not the first one.
    positions: RADIO_STATIONS.map(() => ({ trackIndex: 0, trackTimer: 0 })),
    volume: RADIO_VOLUME_DEFAULT,
    muted: false,
    playing: true,
    // Banter: a line shows for a few seconds between tracks.
    banter: '',
    banterTimer: 0,
    banterCount: 0,
    tracksPlayed: 0,
    switches: 0,
    history: [], // last tracks played, newest last, capped at 20
    elapsed: 0,
  };
}

export function currentStation(radio) {
  return RADIO_STATIONS[radio.stationIndex];
}

export function currentPosition(radio) {
  return radio.positions[radio.stationIndex];
}

export function currentTrack(radio) {
  const station = currentStation(radio);
  const pos = currentPosition(radio);
  return station.tracks[pos.trackIndex] || station.tracks[0];
}

export function trackProgress(radio) {
  const track = currentTrack(radio);
  const pos = currentPosition(radio);
  return {
    elapsed: pos.trackTimer,
    duration: track.duration,
    remaining: Math.max(0, track.duration - pos.trackTimer),
    fraction: Math.max(0, Math.min(1, pos.trackTimer / track.duration)),
  };
}

// One line for the HUD: station, track, artist, and the time left.
export function radioHudLine(radio) {
  if (radio.muted) return 'Radio muted';
  if (!radio.playing) return 'Radio paused';
  const station = currentStation(radio);
  const track = currentTrack(radio);
  const progress = trackProgress(radio);
  const left = Math.ceil(progress.remaining);
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return `${station.name} ${station.frequency} — "${track.title}" by ${track.artist} (${mm}:${ss} left)`;
}

export function radioNowPlaying(radio) {
  const station = currentStation(radio);
  const track = currentTrack(radio);
  return {
    station: station.name,
    frequency: station.frequency,
    genre: station.genre,
    dj: station.dj,
    title: track.title,
    artist: track.artist,
    duration: track.duration,
  };
}

export function setStation(radio, indexOrId) {
  let index = -1;
  if (typeof indexOrId === 'number') index = indexOrId;
  else {
    index = RADIO_STATIONS.findIndex((s) => s.id === indexOrId);
  }
  if (index < 0 || index >= RADIO_STATIONS.length) return false;
  if (index === radio.stationIndex) return true;
  radio.stationIndex = index;
  radio.switches += 1;
  radio.banter = '';
  radio.banterTimer = 0;
  return true;
}

// Next / previous station, wrapping around the dial.
export function nextStation(radio) {
  return setStation(radio, (radio.stationIndex + 1) % RADIO_STATIONS.length);
}

export function prevStation(radio) {
  return setStation(radio, (radio.stationIndex - 1 + RADIO_STATIONS.length) % RADIO_STATIONS.length);
}

// Next / previous track on the current station, wrapping the playlist.
export function nextTrack(radio, random) {
  advanceTrack(radio, random);
  return currentTrack(radio);
}

export function prevTrack(radio) {
  const station = currentStation(radio);
  const pos = currentPosition(radio);
  pos.trackIndex = (pos.trackIndex - 1 + station.tracks.length) % station.tracks.length;
  pos.trackTimer = 0;
  radio.tracksPlayed += 1;
  return currentTrack(radio);
}

export function setVolume(radio, volume) {
  // Round to two decimals: 0.7 + 0.1 must read as 0.8, not 0.7999…,
  // or the HUD and the tests both show a lie.
  radio.volume = Math.round(Math.max(0, Math.min(1, volume)) * 100) / 100;
  if (radio.volume > 0) radio.muted = false;
  return radio.volume;
}

export function volumeUp(radio) {
  return setVolume(radio, radio.volume + RADIO_VOLUME_STEP);
}

export function volumeDown(radio) {
  return setVolume(radio, radio.volume - RADIO_VOLUME_STEP);
}

export function toggleMute(radio) {
  radio.muted = !radio.muted;
  return radio.muted;
}

export function togglePlay(radio) {
  radio.playing = !radio.playing;
  return radio.playing;
}

// A DJ line for the current station, picked with the seeded random. The
// line is stored on the state for a few seconds so the main loop can
// show it on the toast line.
export function djBanter(radio, random) {
  const station = currentStation(radio);
  const line = pick(random || Math.random, station.banter);
  radio.banter = line;
  radio.banterTimer = 5;
  radio.banterCount += 1;
  return line;
}

function recordHistory(radio, station, track) {
  radio.history.push(`${station.name}: "${track.title}" — ${track.artist}`);
  if (radio.history.length > 20) radio.history.shift();
}

function advanceTrack(radio, random) {
  const station = currentStation(radio);
  const pos = currentPosition(radio);
  const finished = station.tracks[pos.trackIndex];
  recordHistory(radio, station, finished);
  pos.trackIndex = (pos.trackIndex + 1) % station.tracks.length;
  pos.trackTimer = 0;
  radio.tracksPlayed += 1;
  // Every third track, the DJ says something before the next song.
  if (radio.tracksPlayed % 3 === 0) djBanter(radio, random);
}

// Step the radio by dt seconds: the current track advances, and when it
// ends the next one starts. Muted or paused radios still keep time —
// the DJ does not wait for Rico to unmute.
export function stepRadio(radio, dt, random) {
  radio.elapsed += dt;
  if (radio.banterTimer > 0) radio.banterTimer -= dt;
  if (!radio.playing) return;
  const pos = currentPosition(radio);
  pos.trackTimer += dt;
  const track = currentTrack(radio);
  if (pos.trackTimer >= track.duration) {
    advanceTrack(radio, random);
  }
}

// The station that fits the moment: pop by day, rock for a getaway,
// talk in the morning, neon after midnight. The main loop can offer it
// as a suggestion; it never switches the station on its own.
export function suggestedStation(weather, wanted) {
  if (wanted >= 3) return 'rock';
  if (weather && weather.isNight) return 'neon';
  if (weather && weather.hour >= 6 && weather.hour < 10) return 'talk';
  return 'bayfm';
}

// A station for a mission giver: Marina listens to Bay FM, Dante to
// Palmetto Rock, and the kingpin — before Rico took him down — to talk.
export function stationForGiver(giver) {
  if (giver === 'Marina') return 'bayfm';
  if (giver === 'Dante') return 'rock';
  return 'talk';
}

// Total playlist length for a station, in seconds.
export function stationPlaylistLength(station) {
  return station.tracks.reduce((sum, t) => sum + t.duration, 0);
}

export function stationPlaylistLengthText(station) {
  const total = stationPlaylistLength(station);
  const mm = Math.floor(total / 60);
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// One line per station for the title screen: frequency, name, DJ, and
// how long the playlist runs.
export function radioSummaryLines(radio) {
  return RADIO_STATIONS.map((s, i) => {
    const mark = i === radio.stationIndex ? ' (tuned in)' : '';
    return `${s.frequency} ${s.name} — ${s.genre}, DJ ${s.dj}${mark} — playlist ${stationPlaylistLengthText(s)}`;
  });
}

// How long until the current track ends, in seconds — the HUD countdown.
export function secondsToNextTrack(radio) {
  return Math.max(0, trackProgress(radio).remaining);
}

// Search every playlist for a track by title (case-insensitive substring).
// Returns the station and the track, or null.
export function findTrack(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  for (const station of RADIO_STATIONS) {
    for (const track of station.tracks) {
      if (track.title.toLowerCase().includes(q) || track.artist.toLowerCase().includes(q)) {
        return { station: station.id, stationName: station.name, track };
      }
    }
  }
  return null;
}

// The longest track on the dial, and the shortest — for the trivia line
// on the loading screen.
export function longestTrack() {
  let best = null;
  let bestStation = null;
  for (const station of RADIO_STATIONS) {
    for (const track of station.tracks) {
      if (!best || track.duration > best.duration) {
        best = track;
        bestStation = station;
      }
    }
  }
  return { station: bestStation.name, track: best };
}

export function shortestTrack() {
  let best = null;
  let bestStation = null;
  for (const station of RADIO_STATIONS) {
    for (const track of station.tracks) {
      if (!best || track.duration < best.duration) {
        best = track;
        bestStation = station;
      }
    }
  }
  return { station: bestStation.name, track: best };
}

export function serializeRadio(radio) {
  return {
    stationIndex: radio.stationIndex,
    positions: radio.positions.map((p) => ({ ...p })),
    volume: radio.volume,
    muted: radio.muted,
    tracksPlayed: radio.tracksPlayed,
  };
}

export function deserializeRadio(data) {
  const r = createRadioState();
  if (!data || typeof data !== 'object') return r;
  if (typeof data.stationIndex === 'number' && data.stationIndex >= 0 && data.stationIndex < RADIO_STATIONS.length) {
    r.stationIndex = data.stationIndex;
  }
  if (Array.isArray(data.positions)) {
    data.positions.forEach((p, i) => {
      if (p && typeof p.trackIndex === 'number' && r.positions[i]) {
        const station = RADIO_STATIONS[i];
        r.positions[i].trackIndex = Math.max(0, Math.min(station.tracks.length - 1, p.trackIndex));
        r.positions[i].trackTimer = typeof p.trackTimer === 'number' ? Math.max(0, p.trackTimer) : 0;
      }
    });
  }
  if (typeof data.volume === 'number') r.volume = Math.max(0, Math.min(1, data.volume));
  if (typeof data.muted === 'boolean') r.muted = data.muted;
  if (typeof data.tracksPlayed === 'number') r.tracksPlayed = data.tracksPlayed;
  return r;
}
