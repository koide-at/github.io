const CC_LABELS = { 
    0:'Bank Select', 1:'Modulation', 2:'Breath', 4:'Foot Ctrl', 5:'Portamento Time', 
    6:'Data Entry', 7:'Main Volume', 8:'Balance', 10:'Pan', 11:'Expression',
    64:'Sustain Pedal', 65:'Portamento', 66:'Sostenuto', 67:'Soft Pedal', 
    71:'Resonance', 72:'Release Time', 73:'Attack Time', 74:'Brightness',
    91:'Reverb Send', 93:'Chorus Send', 120:'All Sound Off', 121:'Reset Controllers', 
    123:'All Notes Off'
};

const GM_PROGRAMS = ['Acoustic Grand Piano','Bright Acoustic Piano','Electric Grand Piano','Honky-tonk Piano','Electric Piano 1','Electric Piano 2','Harpsichord','Clavi','Celesta','Glockenspiel','Music Box','Vibraphone','Marimba','Xylophone','Tubular Bells','Dulcimer','Drawbar Organ','Percussive Organ','Rock Organ','Church Organ','Reed Organ','Accordion','Harmonica','Tango Accordion','Acoustic Guitar (nylon)','Acoustic Guitar (steel)','Electric Guitar (jazz)','Electric Guitar (clean)','Electric Guitar (muted)','Overdriven Guitar','Distortion Guitar','Guitar harmonics','Acoustic Bass','Electric Bass (finger)','Electric Bass (pick)','Fretless Bass','Slap Bass 1','Slap Bass 2','Synth Bass 1','Synth Bass 2','Violin','Viola','Cello','Contrabass','Tremolo Strings','Pizzicato Strings','Orchestral Harp','Timpani','String Ensemble 1','String Ensemble 2','SynthStrings 1','SynthStrings 2','Choir Aahs','Voice Oohs','Synth Voice','Orchestra Hit','Trumpet','Trombone','Tuba','Muted Trumpet','French Horn','Brass Section','SynthBrass 1','SynthBrass 2','Soprano Sax','Alto Sax','Tenor Sax','Baritone Sax','Oboe','English Horn','Bassoon','Clarinet','Piccolo','Flute','Recorder','Pan Flute','Blown Bottle','Shakuhachi','Whistle','Ocarina','Lead 1 (square)','Lead 2 (sawtooth)','Lead 3 (calliope)','Lead 4 (chiff)','Lead 5 (charang)','Lead 6 (voice)','Lead 7 (fifths)','Lead 8 (bass + lead)','Pad 1 (new age)','Pad 2 (warm)','Pad 3 (polysynth)','Pad 4 (choir)','Pad 5 (bowed)','Pad 6 (metallic)','Pad 7 (halo)','Pad 8 (sweep)','FX 1 (rain)','FX 2 (soundtrack)','FX 3 (crystal)','FX 4 (atmosphere)','FX 5 (brightness)','FX 6 (goblins)','FX 7 (echoes)','FX 8 (sci-fi)','Sitar','Banjo','Shamisen','Koto','Kalimba','Bag pipe','Fiddle','Shanai','Tinkle Bell','Agogo','Steel Drums','Woodblock','Taiko Drum','Melodic Tom','Synth Drum','Reverse Cymbal','Guitar Fret Noise','Breath Noise','Seashore','Bird Tweet','Telephone Ring','Helicopter','Applause','Gunshot'];

let currentMidi = null;

const toHex = (n, len = 2) => {
    if (n === undefined || n === null || isNaN(n)) return '??';
    return n.toString(16).toUpperCase().padStart(len, '0');
};

const getNoteName = n => {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return `${names[n % 12]}${Math.floor(n / 12) - 1}`;
};

const getKeySigName = (sf, mi) => {
    const majors = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
    const minors = ['Abm', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm', 'Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m'];
    const list = mi === 0 ? majors : minors;
    return list[sf + 7] || 'Unknown';
};

const formatEvent = (ev) => {
    let typeName = 'Unknown', tagClass = 'tag-other', details = '', chShow = '-', hex = '';
    const d = Array.isArray(ev.data) ? ev.data : (ev.data !== undefined ? [ev.data] : []);

    if (ev.type === 255) {
        typeName = 'Meta'; tagClass = 'tag-meta';
        const labels = { 
            0:'Seq Num', 1:'Text', 2:'Copyright', 3:'Track Name', 4:'Instrument', 
            5:'Lyric', 6:'Marker', 7:'Cue Point', 8:'Prog Name', 9:'Device Name',
            32:'Ch Prefix', 33:'Port', 47:'End Track', 81:'Tempo', 
            84:'SMPTE', 88:'Time Sig', 89:'Key Sig', 127:'Seq Spec' 
        };
        const label = labels[ev.metaType] || `Meta 0x${toHex(ev.metaType)}`;
        details = `${label}: `;
        
        if (typeof ev.data === 'string') details += `"<strong>${ev.data}</strong>"`;
        else if (ev.metaType === 81) details += `<strong>${Math.round(60000000 / ((d[0]<<16)+(d[1]<<8)+d[2]))} BPM</strong>`;
        else if (ev.metaType === 88) details += `<strong>${d[0]}/${Math.pow(2, d[1])}</strong>`;
        else if (ev.metaType === 89) details += `<strong>${getKeySigName(d[0], d[1])}</strong>`;
        else if (ev.metaType === 84) details += `<strong>${toHex(d[0])}:${toHex(d[1])}:${toHex(d[2])}:${toHex(d[3])}:${toHex(d[4])}</strong>`;
        else details += `[${d.join(', ')}]`;
        
        hex = `FF ${toHex(ev.metaType)} ${toHex(d.length)} ${d.map(b => toHex(b)).join(' ')}`;
    } else {
        chShow = (ev.channel !== undefined ? ev.channel + 1 : '-');
        const status = (ev.type !== undefined && ev.type < 16) ? (ev.type << 4) | (ev.channel || 0) : (ev.type || 0);
        hex = `${toHex(status)} ${d.map(b => toHex(b)).join(' ')}`;
        switch (ev.type) {
            case 8: case 9:
                typeName = (ev.type === 8 || d[1] === 0) ? 'Note Off' : 'Note On';
                tagClass = typeName === 'Note Off' ? 'tag-noteoff' : 'tag-noteon';
                details = `Note: <strong>${d[0]} (${getNoteName(d[0])})</strong> | Vel: <strong>${d[1]}</strong>`;
                break;
            case 10: typeName = 'Poly Press'; tagClass = 'tag-cc'; details = `Note: ${d[0]} | Val: ${d[1]}`; break;
            case 11: typeName = 'Ctrl Ch'; tagClass = 'tag-cc'; details = `Ctrl: ${d[0]} (${CC_LABELS[d[0]]||'?'}) | Val: ${d[1]}`; break;
            case 12: typeName = 'Prog Ch'; tagClass = 'tag-other'; details = `Prog: ${d[0]} (${GM_PROGRAMS[d[0]]||'?'})`; break;
            case 13: typeName = 'Ch Press'; tagClass = 'tag-cc'; details = `Val: ${d[0]}`; break;
            case 14: typeName = 'Pitch Bend'; tagClass = 'tag-pitch'; details = `Val: ${(d[0]||0)+((d[1]||0)<<7)-8192}`; break;
            case 240: case 247: typeName = 'SysEx'; details = `Size: ${d.length}`; break;
            default: typeName = ev.type !== undefined ? `Type 0x${ev.type.toString(16)}` : 'Unknown'; details = `Data: [${d.join(', ')}]`;
        }
    }
    return { typeName, tagClass, details, chShow, hex };
};

// UI Helpers
const showLoading = (status = "Processing...") => {
    document.getElementById('loading-overlay').classList.remove('hidden');
    document.getElementById('loader-status').innerText = status;
    setProgress(0);
};

const setProgress = (val) => {
    document.getElementById('progress-bar').style.width = Math.min(val, 100) + '%';
};

const hideLoading = () => {
    document.getElementById('loading-overlay').classList.add('hidden');
};

const renderTrackList = () => {
    const container = document.getElementById('tracks-container');
    container.innerHTML = '';
    currentMidi.track.forEach((t, tIdx) => {
        let trkName = `Track ${tIdx + 1}`, instName = '';
        if (t.event) {
            for (const ev of t.event) {
                if(ev.type === 255) {
                    if(ev.metaType === 3) trkName = ev.data;
                    if(ev.metaType === 4 && typeof ev.data === 'string') instName = ev.data;
                }
            }
        }
        const block = document.createElement('div'); block.className = 'track-container';
        const header = document.createElement('div'); header.className = 'track-header';
        header.innerHTML = `<div class="track-info"><span class="track-name">${trkName}</span><span class="track-instrument">${instName ? `[${instName}]` : ''}</span></div><div style="color:var(--text-secondary)">${t.event ? t.event.length : 0} Events <span class="toggle-icon">▼</span></div>`;
        const tableDiv = document.createElement('div'); tableDiv.className = 'events-table-container hidden';
        tableDiv.id = `track-events-${tIdx}`;
        header.onclick = async () => {
            const isHidden = tableDiv.classList.contains('hidden');
            if (isHidden) {
                if (tableDiv.innerHTML === '') await renderTrackEvents(tIdx);
                tableDiv.classList.remove('hidden'); header.querySelector('.toggle-icon').innerText = '▲';
            } else {
                tableDiv.classList.add('hidden'); header.querySelector('.toggle-icon').innerText = '▼';
            }
        };
        block.append(header, tableDiv); container.append(block);
    });
};

const renderTrackEvents = async (tIdx) => {
    const t = currentMidi.track[tIdx];
    const tableDiv = document.getElementById(`track-events-${tIdx}`);
    tableDiv.innerHTML = '<div style="padding:20px; text-align:center;">Rendering events...</div>';
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Time</th><th>Δ</th><th>Ch</th><th>Type</th><th>Details</th><th>Raw (Hex)</th><th>Action</th></tr></thead>';
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    let abs = 0;
    if (t.event) {
        let chunkHTML = '';
        for (let eIdx = 0; eIdx < t.event.length; eIdx++) {
            const ev = t.event[eIdx]; abs += ev.deltaTime || 0;
            const info = formatEvent(ev);
            chunkHTML += `
            <tr class="ev-row" onclick="toggleExpansion(${tIdx}, ${eIdx})">
                <td>${abs}</td><td style="color:#fab005">${ev.deltaTime || 0}</td>
                <td style="color:#ff922b">${info.chShow}</td>
                <td><span class="tag ${info.tagClass}">${info.typeName}</span></td>
                <td class="event-data">${info.details}</td>
                <td class="hex-data" title="Click to expand">${info.hex}</td>
                <td><button class="btn-del" onclick="deleteEvent(${tIdx}, ${eIdx}); event.stopPropagation();">×</button></td>
            </tr>
            <tr id="exp-${tIdx}-${eIdx}" class="expansion-row">
                <td colspan="7">
                    <div class="full-hex-area editor-area">
                        <div class="editor-grid">
                            <div><label>Delta Time:</label><input type="number" class="edit-delta" value="${ev.deltaTime || 0}" onchange="updateEvent(${tIdx}, ${eIdx}, 'deltaTime', this.value)"></div>
                            <div><label>Data Values:</label>${renderLazyInputs(ev, tIdx, eIdx)}</div>
                        </div>
                        <div style="margin-top:10px; font-size:11px; opacity:0.7;"><strong>Full Hex:</strong> ${info.hex}</div>
                    </div>
                </td>
            </tr>`;
            if (eIdx > 0 && eIdx % 1000 === 0) {
                tbody.insertAdjacentHTML('beforeend', chunkHTML); chunkHTML = '';
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        }
        if (chunkHTML) tbody.insertAdjacentHTML('beforeend', chunkHTML);
    }
    tableDiv.innerHTML = ''; tableDiv.appendChild(table);
};

window.toggleExpansion = (tIdx, eIdx) => {
    const el = document.getElementById(`exp-${tIdx}-${eIdx}`);
    if (el) el.classList.toggle('show');
};

const renderLazyInputs = (ev, tIdx, eIdx) => {
    const d = Array.isArray(ev.data) ? ev.data : [ev.data];
    if (ev.type === 255) {
        if (typeof ev.data === 'string') return `<input type="text" style="width:100%" value="${ev.data}" onchange="updateEvent(${tIdx}, ${eIdx}, 'data', this.value)">`;
        // Handle specialized arrays like SMPTE, Key Sig
        return d.map((val, i) => `<input type="number" style="width:60px" value="${val}" onchange="updateEvent(${tIdx}, ${eIdx}, 'dataByte', this.value, ${i})">`).join(' ');
    }
    return d.map((val, i) => `<input type="number" style="width:60px" value="${val}" onchange="updateEvent(${tIdx}, ${eIdx}, 'dataByte', this.value, ${i})">`).join(' ');
};

window.updateEvent = (tIdx, eIdx, field, val, dataIdx) => {
    const ev = currentMidi.track[tIdx].event[eIdx];
    if (field === 'deltaTime') ev.deltaTime = parseInt(val);
    else if (field === 'data') ev.data = val;
    else if (field === 'dataArray') ev.data = val.split(',').map(Number);
    else if (field === 'dataByte') {
        if (!Array.isArray(ev.data)) ev.data = [ev.data];
        ev.data[dataIdx] = parseInt(val);
    }
};

window.deleteEvent = async (tIdx, eIdx) => {
    currentMidi.track[tIdx].event.splice(eIdx, 1);
    await renderTrackEvents(tIdx);
};

const encodeVLQ = (num) => {
    let res = [num & 0x7F];
    while ((num >>= 7) > 0) res.push((num & 0x7F) | 0x80);
    return res.reverse();
};

const saveMidi = () => {
    if (!currentMidi) return;
    const bytes = [];
    bytes.push(0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6);
    bytes.push(0, currentMidi.header.format);
    bytes.push((currentMidi.track.length >> 8) & 0xFF, currentMidi.track.length & 0xFF);
    bytes.push((currentMidi.header.ticksPerBeat >> 8) & 0xFF, currentMidi.header.ticksPerBeat & 0xFF);
    currentMidi.track.forEach(t => {
        const tBytes = [];
        if (t.event) {
            t.event.forEach(ev => {
                tBytes.push(...encodeVLQ(ev.deltaTime || 0));
                if (ev.type === 255) {
                    tBytes.push(0xFF, ev.metaType);
                    const data = typeof ev.data === 'string' ? new TextEncoder().encode(ev.data) : (Array.isArray(ev.data) ? ev.data : [ev.data]);
                    tBytes.push(...encodeVLQ(data.length), ...data);
                } else {
                    const status = ev.type < 16 ? (ev.type << 4) | (ev.channel || 0) : ev.type;
                    tBytes.push(status);
                    const data = Array.isArray(ev.data) ? ev.data : [ev.data];
                    tBytes.push(...data);
                }
            });
        }
        bytes.push(0x4D, 0x54, 0x72, 0x6B);
        bytes.push((tBytes.length >> 24) & 0xFF, (tBytes.length >> 16) & 0xFF, (tBytes.length >> 8) & 0xFF, tBytes.length & 0xFF);
        bytes.push(...tBytes);
    });
    const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'edited_pro.mid'; a.click();
};

const handleFile = files => {
    if (!files[0]) return;
    showLoading("Quick Analyzing...");
    const reader = new FileReader();
    reader.onload = async e => {
        try {
            currentMidi = MidiParser.parse(new Uint8Array(e.target.result));
            if (!currentMidi) throw new Error("Parser returned empty data.");
            const h = currentMidi.header || {};
            const fmt = h.format !== undefined ? h.format : (currentMidi.formatType ?? '?');
            const numTrks = (currentMidi.track ? currentMidi.track.length : 0) || (h.numTracks ?? '?');
            const resolution = h.ticksPerBeat || (currentMidi.timeDivision ?? '?');
            document.getElementById('header-stats').innerHTML = `
                <div class="stat-card"><div class="stat-label">Format</div><div class="stat-value">Type ${fmt}</div></div>
                <div class="stat-card"><div class="stat-label">Tracks</div><div class="stat-value">${numTrks}</div></div>
                <div class="stat-card"><div class="stat-label">Resolution</div><div class="stat-value">${resolution}</div></div>
            `;
            document.getElementById('main-content').classList.remove('hidden');
            document.getElementById('save-btn').classList.remove('hidden');
            renderTrackList(); hideLoading();
            document.getElementById('main-content').scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            console.error(err); alert("Error: " + err.message); hideLoading();
        }
    };
    reader.readAsArrayBuffer(files[0]);
};

document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    dropZone.onclick = e => { if (e.target !== fileInput) fileInput.click(); };
    fileInput.onchange = e => handleFile(e.target.files);
    ['dragenter','dragover','dragleave','drop'].forEach(e => dropZone.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); }));
    ['dragenter','dragover'].forEach(e => dropZone.addEventListener(e, () => dropZone.classList.add('drag-over')));
    ['dragleave','drop'].forEach(e => dropZone.addEventListener(e, () => dropZone.classList.remove('drag-over')));
    dropZone.addEventListener('drop', e => handleFile(e.dataTransfer.files));
    document.getElementById('save-btn').onclick = saveMidi;
});
