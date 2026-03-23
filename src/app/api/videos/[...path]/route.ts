import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Original source (raw video files)
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || 'e:\\Code Space\\chessly-downloader\\downloads';
// HLS output base (produced by scripts/chunk-videos.js)
const HLS_DIR = process.env.HLS_DIR || 'F:\\video-chunks';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> }
) {
    const { path: filePathParts } = await context.params;

    // ── Security: keep requests inside the allowed bases ────────────────
    const rawRequestedPath = path.join(DOWNLOADS_DIR, ...filePathParts);
    const resolvedRaw = path.resolve(rawRequestedPath);
    if (!resolvedRaw.startsWith(path.resolve(DOWNLOADS_DIR))) {
        return new NextResponse('Access Denied', { status: 403 });
    }

    const fileName = filePathParts[filePathParts.length - 1];
    const ext = path.extname(fileName).toLowerCase();

    // ── HLS: serve .m3u8 playlists and .ts segments directly ────────────
    if (ext === '.m3u8' || ext === '.ts') {
        const hlsPath = path.join(HLS_DIR, ...filePathParts);
        const resolved = path.resolve(hlsPath);
        if (!resolved.startsWith(path.resolve(HLS_DIR))) {
            return new NextResponse('Access Denied', { status: 403 });
        }
        if (!fs.existsSync(resolved)) {
            return new NextResponse('HLS file not found', { status: 404 });
        }
        const contentType = ext === '.m3u8'
            ? 'application/vnd.apple.mpegurl'
            : 'video/mp2t';
        const data = fs.readFileSync(resolved);
        return new NextResponse(data, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': ext === '.ts' ? 'public, max-age=31536000' : 'no-cache',
            }
        });
    }

    // ── Detect HLS version: prefer F:\video-chunks if chunked ───────────
    // The chunk script stores playlist at:
    //   F:\video-chunks\<course>\<chapter>\<study>\<videoBaseName>\playlist.m3u8
    // filePathParts mirrors:  [course, chapter, study, "video.mp4"]
    // so hlsDir would be:     [course, chapter, study, "video"]
    const videoBaseName = path.basename(fileName, ext); // e.g. "video"
    const hlsPlaylistPath = path.join(
        HLS_DIR,
        ...filePathParts.slice(0, -1),  // strip the filename
        videoBaseName,
        'playlist.m3u8'
    );

    if (fs.existsSync(hlsPlaylistPath)) {
        // Redirect the player to the .m3u8 — the player will then fetch
        // .ts segments via the same API endpoint.
        const base = process.env.NEXT_PUBLIC_API_URL;
        console.log(base);
        const m3u8Url =
            base +
            '/api/videos/' +
            [...filePathParts.slice(0, -1), videoBaseName, 'playlist.m3u8'].join('/');

        return NextResponse.redirect(m3u8Url);
    }

    // ── Fallback: byte-range streaming of the raw file ──────────────────
    if (!fs.existsSync(resolvedRaw)) {
        return new NextResponse('File Not Found', { status: 404 });
    }

    const stats = fs.statSync(resolvedRaw);
    const fileSize = stats.size;
    const range = request.headers.get('range');

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const file = fs.createReadStream(resolvedRaw, { start, end });

        // @ts-ignore
        return new NextResponse(file, {
            status: 206,
            headers: {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize.toString(),
                'Content-Type': 'video/mp4',
            }
        });
    }

    const file = fs.createReadStream(resolvedRaw);
    // @ts-ignore
    return new NextResponse(file, {
        headers: {
            'Content-Length': fileSize.toString(),
            'Content-Type': 'video/mp4',
        }
    });
}
