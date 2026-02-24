const fs = require('fs');
const https = require('https');
const path = require('path');
const { execSync } = require('child_process');

const binName = 'stockfish_linux_x86_64';
const binPath = path.join(__dirname, binName);
const tarPath = path.join(__dirname, 'stockfish.tar');
const url = 'https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-ubuntu-x86-64.tar';

if (fs.existsSync(binPath)) {
    console.log('Stockfish binary already exists.');
    process.exit(0);
}

console.log(`Downloading Stockfish 18 tarball from ${url}...`);

const file = fs.createWriteStream(tarPath);

function download(downloadUrl) {
    https.get(downloadUrl, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
            download(response.headers.location);
            return;
        }
        if (response.statusCode !== 200) {
            console.error(`Failed to download: ${response.statusCode}`);
            process.exit(1);
        }
        response.pipe(file);
        file.on('finish', () => {
            file.close();
            console.log('Download complete. Extracting...');
            try {
                // Extract the tarball
                execSync(`tar -xf "${tarPath}" -C "${__dirname}"`);

                // Stockfish tarballs contain a directory like 'stockfish-ubuntu-x86-64'
                // Let's find any directory that looks like it.
                const items = fs.readdirSync(__dirname);
                const extractedDirName = items.find(item =>
                    fs.statSync(path.join(__dirname, item)).isDirectory() &&
                    item.includes('stockfish')
                );

                if (extractedDirName) {
                    const extractedDir = path.join(__dirname, extractedDirName);
                    const contents = fs.readdirSync(extractedDir);
                    // The binary is often in a 'bin' subdirectory or at the root
                    let binaryLocalPath = contents.find(f => f === 'stockfish' || f.includes('stockfish-ubuntu-x86-64'));

                    if (!binaryLocalPath) {
                        const binSubDir = path.join(extractedDir, 'bin');
                        if (fs.existsSync(binSubDir)) {
                            const binFiles = fs.readdirSync(binSubDir);
                            binaryLocalPath = binFiles.find(f => f === 'stockfish' || f.includes('stockfish-ubuntu-x86-64'));
                            if (binaryLocalPath) {
                                fs.renameSync(path.join(binSubDir, binaryLocalPath), binPath);
                            }
                        }
                    } else {
                        fs.renameSync(path.join(extractedDir, binaryLocalPath), binPath);
                    }
                }

                // Cleanup
                if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);

                if (fs.existsSync(binPath)) {
                    fs.chmodSync(binPath, 0o755);
                    console.log('Stockfish 18 setup successful.');
                } else {
                    console.error('Failed to isolate Stockfish binary from tarball.');
                    process.exit(1);
                }
            } catch (err) {
                console.error(`Extraction error: ${err.message}`);
                process.exit(1);
            }
        });
    }).on('error', (err) => {
        if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
        console.error(`Download error: ${err.message}`);
        process.exit(1);
    });
}

download(url);
