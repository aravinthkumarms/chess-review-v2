/**
 * chunk-videos.js
 *
 * Splits all lesson videos into HLS (HTTP Live Streaming) chunks using FFmpeg.
 * Output is stored on F:\video-chunks\ mirroring the source folder structure.
 * Additionally moves original videos to F:\video-originals for cleanup.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

// ── Config ─────────────────────────────────────────────────────────────────
const SOURCE_DIR = process.env.SOURCE_DIR || path.resolve('E:\\Code Space\\chessly-downloader\\downloads');
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'F:\\video-chunks';
const ORIGINALS_DIR = process.env.ORIGINALS_DIR || 'F:\\video-originals';
const SEGMENT_TIME = process.env.SEGMENT_TIME || '4';
const CONCURRENCY = parseInt(process.env.CONCURRENCY) || os.cpus().length || 4;

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mkv', '.mov', '.avi']);
// ───────────────────────────────────────────────────────────────────────────

function checkFFmpeg() {
    const result = spawnSync('ffmpeg', ['-version'], { stdio: 'pipe' });
    if (result.error || result.status !== 0) {
        console.error('❌  FFmpeg not found.');
        process.exit(1);
    }
}

function findVideos(dir, results = []) {
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            findVideos(full, results);
        } else if (VIDEO_EXTS.has(path.extname(entry.name).toLowerCase())) {
            results.push(full);
        }
    }
    return results;
}

function relPath(filePath) {
    return path.relative(SOURCE_DIR, filePath);
}

function convertToHLS(videoPath) {
    return new Promise((resolve) => {
        const rel = relPath(videoPath);
        const baseName = path.basename(videoPath, path.extname(videoPath));
        const outDir = path.join(OUTPUT_DIR, path.dirname(rel), baseName);
        const playlist = path.join(outDir, 'playlist.m3u8');
        const segPat = path.join(outDir, 'seg%03d.ts');

        const outRel = path.join(path.dirname(rel), baseName);

        if (fs.existsSync(playlist)) {
            console.log(`  ⏩  Skipping (Already Chunked): ${rel}`);
            return resolve({ skipped: true, rel, outRel });
        }

        fs.mkdirSync(outDir, { recursive: true });
        console.log(`  🔪  Processing: ${rel}`);

        const args = [
            '-i', videoPath,
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
            '-hls_time', SEGMENT_TIME,
            '-hls_list_size', '0',
            '-hls_segment_filename', segPat,
            '-hls_flags', 'independent_segments',
            playlist
        ];

        const proc = spawn('ffmpeg', args, { stdio: 'ignore' });

        proc.on('close', (code) => {
            if (code !== 0) {
                console.error(`  ❌  Failed: ${rel} (Code ${code})`);
                return resolve({ error: true, rel });
            }

            // Move to F: drive backup after success
            const dest = path.join(ORIGINALS_DIR, rel);
            try {
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                fs.renameSync(videoPath, dest);
                console.log(`  📂  Moved to Backup: ${rel}`);
            } catch (e) {
                console.error(`  ⚠️  Move Failed: ${e.message}`);
            }

            const segs = fs.readdirSync(outDir).filter(f => f.endsWith('.ts')).length;
            console.log(`  ✅  Complete: ${rel} (${segs} segs)`);
            resolve({ ok: true, rel, outRel, segs });
        });
    });
}

function writeManifest(entries) {
    const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
    const existing = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) : {};
    for (const { rel, outRel, segs } of entries) {
        existing[rel.replace(/\\/g, '/')] = {
            playlist: outRel.replace(/\\/g, '/') + '/playlist.m3u8',
            segments: segs,
            at: new Date().toISOString()
        };
    }
    fs.writeFileSync(manifestPath, JSON.stringify(existing, null, 2));
}

async function main() {
    console.log(`🚀 Starting Chunking (Workers: ${CONCURRENCY})\n`);
    checkFFmpeg();
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const videos = findVideos(SOURCE_DIR);
    if (!videos.length) return console.log('No videos found.');

    const results = [];
    let active = 0, finished = 0, queue = [...videos];

    return new Promise((resolve) => {
        const next = () => {
            if (finished === videos.length) {
                const ok = results.filter(r => r.ok);
                const skipped = results.filter(r => r.skipped);
                writeManifest([...ok, ...skipped.map(s => {
                    const dir = path.join(OUTPUT_DIR, s.outRel);
                    return { ...s, segs: fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.ts')).length : 0 };
                })]);
                console.log(`\nDone: ${ok.length} Ok, ${skipped.length} Skipped, ${results.filter(r => r.error).length} Errors`);
                return resolve();
            }
            while (active < CONCURRENCY && queue.length) {
                const v = queue.shift(); active++;
                convertToHLS(v).then(r => { results.push(r); active--; finished++; setImmediate(next); });
            }
        };
        next();
    });
}

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

main().catch(err => {
    console.error('Fatal Error in Main:', err);
    process.exit(1);
});
