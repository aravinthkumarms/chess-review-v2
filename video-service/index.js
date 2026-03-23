const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Client, auth } = require('cassandra-driver');

const app = express();
app.use(express.json());

// Enable CORS for all routes so Vercel frontend can access it
app.use(cors());

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || 'e:\\Code Space\\chessly-downloader\\downloads';
const HLS_DIR = process.env.HLS_DIR || 'F:\\video-chunks';

// ── Cassandra Client ───────────────────────────────────────────────────────
let cassandraClient = null;
const getCassandraClient = () => {
    if (!cassandraClient) {
        const contactPoints = (process.env.CASSANDRA_HOST || '127.0.0.1').split(',');
        const user = process.env.CASSANDRA_USER || 'cassandra';
        const pass = process.env.CASSANDRA_PASS || 'cassandra';

        const authProvider = new auth.PlainTextAuthProvider(user, pass);
        cassandraClient = new Client({
            contactPoints: contactPoints,
            localDataCenter: process.env.CASSANDRA_DATACENTER || 'datacenter1',
            keyspace: process.env.CASSANDRA_KEYSPACE || 'chess_app',
            authProvider: authProvider,
            socketOptions: { readTimeout: 30000 }
        });

        cassandraClient.on('log', (level, className, message, furtherInfo) => {
            if (level === 'info') return;
            console.log('Cassandra %s: %s', level, message);
        });

        cassandraClient.connect()
            .then(() => console.log('Successfully connected to Cassandra.'))
            .catch(err => console.error('Cassandra Connection Error:', err));
    }
    return cassandraClient;
};

// Start connection early
getCassandraClient();

// Helper to get the username reliably for progress tracking
const getUserId = () => {
    try {
        const userInfo = os.userInfo();
        return userInfo.username || 'default_user';
    } catch (e) {
        return 'default_user';
    }
};

// ── Lessons API ───────────────────────────────────────────────────────────

app.get('/api/lessons/index', async (req, res) => {
    try {
        const courseId = req.query.courseId;
        const client = getCassandraClient();

        if (courseId) {
            const query = 'SELECT * FROM courses_index WHERE id = ?';
            const result = await client.execute(query, [courseId], { prepare: true });
            if (result.rowLength === 0) {
                return res.status(404).json({ error: 'Course not found' });
            }
            const row = result.rows[0];
            return res.json({
                id: row.id,
                name: row.name,
                chapters: JSON.parse(row.chapters),
                orientation: row.orientation,
                kind: row.kind
            });
        }

        const query = 'SELECT id, name, orientation, kind FROM courses_index';
        const result = await client.execute(query);

        const courses = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            orientation: row.orientation,
            kind: row.kind
        }));

        courses.sort((a, b) => a.id.localeCompare(b.id));
        return res.json(courses);
    } catch (error) {
        console.error('Failed to fetch courses from Cassandra:', error);
        return res.status(500).json({ error: 'Failed to fetch courses data' });
    }
});

app.get('/api/lessons/*', async (req, res, next) => {
    // If it's a video file request, let the next handler take it
    const pathPart = req.params[0];
    if (pathPart.endsWith('.mp4') || pathPart.endsWith('.m3u8') || pathPart.endsWith('.ts')) {
        return next();
    }

    try {
        // e.g. /api/lessons/course/chapter/study/lesson.json
        const client = getCassandraClient();
        const query = 'SELECT data FROM lessons_data WHERE path = ?';

        const result = await client.execute(query, [pathPart], { prepare: true });

        if (result.rowLength === 0) {
            return res.status(404).json({ error: 'Lesson not found' });
        }

        const dataString = result.rows[0].data;
        const dataJson = JSON.parse(dataString);
        return res.json(dataJson);
    } catch (error) {
        console.error('Failed to fetch lesson from Cassandra:', error);
        return res.status(500).json({ error: 'Failed to fetch lesson data' });
    }
});

// ── User Progress API ─────────────────────────────────────────────────────

app.get('/api/progress', async (req, res) => {
    try {
        const client = getCassandraClient();
        const userId = getUserId();
        const query = 'SELECT completed_studies FROM chess_app.user_progress WHERE user_id = ?';

        const result = await client.execute(query, [userId], { prepare: true });

        let completedStudies = [];
        if (result.rowLength > 0 && result.rows[0].completed_studies) {
            completedStudies = Array.from(result.rows[0].completed_studies);
        }

        return res.json({ completedStudies });
    } catch (error) {
        console.error('Cassandra progress GET Error:', error);
        return res.status(500).json({ completedStudies: [] });
    }
});

app.post('/api/progress', async (req, res) => {
    try {
        const { studyId } = req.body;
        if (!studyId || typeof studyId !== 'string') {
            return res.status(400).json({ error: 'Invalid studyId' });
        }

        const client = getCassandraClient();
        const userId = getUserId();

        // Add the studyId to the set
        const query = 'UPDATE chess_app.user_progress SET completed_studies = completed_studies + ? WHERE user_id = ?';
        await client.execute(query, [[studyId], userId], { prepare: true });

        // Fetch back updated list
        const fetchQuery = 'SELECT completed_studies FROM chess_app.user_progress WHERE user_id = ?';
        const result = await client.execute(fetchQuery, [userId], { prepare: true });

        let completedStudies = [];
        if (result.rowLength > 0 && result.rows[0].completed_studies) {
            completedStudies = Array.from(result.rows[0].completed_studies);
        }

        return res.json({ completedStudies });
    } catch (error) {
        console.error('Cassandra progress POST Error:', error);
        return res.status(500).json({ error: 'Failed to update progress' });
    }
});

// ── Videos API (Unified with Lessons handler) ──────────────────────────────

app.get('/api/videos/*', (req, res) => {
    const requestedPath = req.params[0];
    if (!requestedPath) {
        return res.status(400).send('Path required');
    }

    const filePathParts = requestedPath.split('/');
    
    // Security: keep requests inside the allowed bases 
    const rawRequestedPath = path.join(DOWNLOADS_DIR, ...filePathParts);
    let resolvedRaw;
    try {
        resolvedRaw = path.resolve(rawRequestedPath);
        if (!resolvedRaw.startsWith(path.resolve(DOWNLOADS_DIR))) {
            return res.status(403).send('Access Denied');
        }
    } catch (e) {
        return res.status(400).send('Invalid path');
    }

    const fileName = filePathParts[filePathParts.length - 1];
    const ext = path.extname(fileName).toLowerCase();

    // HLS: serve .m3u8 playlists and .ts segments directly
    if (ext === '.m3u8' || ext === '.ts') {
        const hlsPath = path.join(HLS_DIR, ...filePathParts);
        const resolved = path.resolve(hlsPath);
        if (!resolved.startsWith(path.resolve(HLS_DIR))) {
            return res.status(403).send('Access Denied');
        }
        if (!fs.existsSync(resolved)) {
            return res.status(404).send('HLS file not found');
        }
        
        const contentType = ext === '.m3u8' ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (ext === '.ts') {
             res.setHeader('Cache-Control', 'public, max-age=31536000');
        } else {
             res.setHeader('Cache-Control', 'no-cache');
        }
        
        const fileStream = fs.createReadStream(resolved);
        return fileStream.pipe(res);
    }

    // Detect HLS version: prefer F:\video-chunks if chunked
    const videoBaseName = path.basename(fileName, ext);
    let hlsPlaylistPath;
    if (filePathParts.length > 1) {
        hlsPlaylistPath = path.join(
            HLS_DIR,
            ...filePathParts.slice(0, -1),
            videoBaseName,
            'playlist.m3u8'
        );
    } else {
        hlsPlaylistPath = path.join(
            HLS_DIR,
            videoBaseName,
            'playlist.m3u8'
        );
    }

    if (fs.existsSync(hlsPlaylistPath)) {
        // Redirect the player to the .m3u8
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const prefixPath = filePathParts.length > 1 ? filePathParts.slice(0, -1).join('/') + '/' : '';
        const m3u8Url = `${baseUrl}/api/videos/${prefixPath}${videoBaseName}/playlist.m3u8`;
        return res.redirect(302, m3u8Url);
    }

    // Fallback: byte-range streaming of the raw file
    if (!fs.existsSync(resolvedRaw)) {
        return res.status(404).send('File Not Found');
    }

    const stats = fs.statSync(resolvedRaw);
    const fileSize = stats.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const file = fs.createReadStream(resolvedRaw, { start, end });
        
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
        });
        file.pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
        });
        fs.createReadStream(resolvedRaw).pipe(res);
    }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Local Backend Service running on http://localhost:${PORT}`);
});
