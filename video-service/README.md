# Video Service

This is a standalone Express server that handles video streaming for the Chess Analysis app.

## Why is this separate?
When deploying the Next.js app to Vercel, the local video files (`DOWNLOADS_DIR` and `HLS_DIR`) are not available to Vercel's serverless functions. 
By extracting this into a standalone local service, you can expose it using `zrok` and safely tunnel requests from your deployed application to your local machine.

## Usage
1. Run `npm install` inside this folder.
2. Run `npm start` (or just run `init.bat` from the root project, which does this automatically).
3. The server runs on port 3002.
4. Expose the port with zrok: `zrok share public http://localhost:3002`
5. Copy the resulting zrok public URL and add it to your Vercel project's environment variables as `NEXT_PUBLIC_VIDEO_SERVICE_URL`.
